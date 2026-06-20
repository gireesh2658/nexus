import { Response } from 'express';
import { nanoid } from 'nanoid';
import { AuthRequest } from '../middleware/authMiddleware';
import Meeting from '../models/Meeting';
import Participant from '../models/Participant';
import User from '../models/User';
import TranscriptSegment from '../models/TranscriptSegment';
import MeetingSummary from '../models/MeetingSummary';
import { AccessToken } from 'livekit-server-sdk';
import { io } from '../server';
import { sendEmail } from '../services/mailer';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const createMeeting = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { title, description, participantUsernames, scheduledAt, scheduledDurationMins, analyticsEnabled, moderationEnabled } = req.body;

    if (!title || !scheduledAt || !scheduledDurationMins) {
      res.status(400).json({ error: 'Title, scheduledAt, and scheduledDurationMins are required' });
      return;
    }

    if (!participantUsernames || !Array.isArray(participantUsernames) || participantUsernames.length === 0) {
      res.status(400).json({ error: 'At least one participant username is required' });
      return;
    }

    // Validate all usernames exist
    const users = await User.find({ username: { $in: participantUsernames.map((u: string) => u.toLowerCase()) }, isActive: true });
    const validUsernames = users.map(u => u.username);
    const invalidUsernames = participantUsernames.filter((u: string) => !validUsernames.includes(u.toLowerCase()));

    if (invalidUsernames.length > 0) {
      res.status(400).json({ error: `Invalid usernames: ${invalidUsernames.join(', ')}` });
      return;
    }

    // Generate unique room code (no public link)
    const roomCode = nanoid(12);

    const meeting = await Meeting.create({
      title,
      description: description || '',
      hostId: req.user._id,
      participantUsernames: validUsernames,
      scheduledAt: new Date(scheduledAt),
      scheduledDurationMins,
      analyticsEnabled: analyticsEnabled !== false,
      moderationEnabled: moderationEnabled !== false,
      roomCode,
    });

    // Create participant records and notifications for each invited user
    const participantDocs = users.map(user => ({
      meetingId: meeting._id,
      userId: user._id,
      status: 'pending' as const,
      invitedAt: new Date(),
    }));

    await Participant.insertMany(participantDocs);

    // Also create a participant record for the host
    await Participant.create({
      meetingId: meeting._id,
      userId: req.user._id,
      status: 'accepted',
      invitedAt: new Date(),
    });


    const populatedMeeting = await Meeting.findById(meeting._id).populate('hostId', 'name username avatarColor');

    res.status(201).json({ meeting: populatedMeeting });
  } catch (error: any) {
    console.error('[Meeting] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
};

export const getMyMeetings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Get meetings where user is host
    const hostedMeetings = await Meeting.find({ hostId: req.user._id })
      .populate('hostId', 'name username avatarColor')
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get meetings where user is a participant
    const participantRecords = await Participant.find({ userId: req.user._id }).select('meetingId');
    const participantMeetingIds = participantRecords.map(p => p.meetingId);

    const invitedMeetings = await Meeting.find({
      _id: { $in: participantMeetingIds },
      hostId: { $ne: req.user._id },
    })
      .populate('hostId', 'name username avatarColor')
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ hosted: hostedMeetings, invited: invitedMeetings });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
};

export const getMeetingById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const meeting = await Meeting.findById(req.params.id).populate('hostId', 'name username avatarColor');
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Verify user is host or invited participant
    const isHost = meeting.hostId._id.toString() === req.user._id.toString();
    const isParticipant = await Participant.findOne({ meetingId: meeting._id, userId: req.user._id });

    if (!isHost && !isParticipant && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized to view this meeting' });
      return;
    }

    const participants = await Participant.find({ meetingId: meeting._id })
      .populate('userId', 'name username avatarColor role');

    res.json({ meeting, participants });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
};

export const getMeetingByRoomCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const meeting = await Meeting.findOne({ roomCode: req.params.roomCode }).populate('hostId', 'name username avatarColor');
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Verify user is host or invited participant
    const isHost = meeting.hostId._id.toString() === req.user._id.toString();
    const isParticipant = await Participant.findOne({ meetingId: meeting._id, userId: req.user._id });

    if (!isHost && !isParticipant && req.user.role !== 'admin') {
      res.status(403).json({ error: 'You are not invited to this meeting' });
      return;
    }

    const participants = await Participant.find({ meetingId: meeting._id })
      .populate('userId', 'name username avatarColor role');

    res.json({ meeting, participants });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
};

export const updateMeetingStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { status } = req.body;

    const allowedStatuses = ['scheduled', 'active', 'ended', 'cancelled'];
    if (!status || !allowedStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
      return;
    }

    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (meeting.hostId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Only the host can update meeting status' });
      return;
    }

    meeting.status = status;
    if (status === 'ended') {
      const startTime = meeting.updatedAt || meeting.scheduledAt;
      meeting.actualDurationSecs = Math.floor((Date.now() - startTime.getTime()) / 1000);
    }
    await meeting.save();

    res.json({ meeting });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update meeting status' });
  }
};

export const respondToInvite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { response } = req.body; // 'accepted' or 'declined'

    if (!response || !['accepted', 'declined'].includes(response)) {
      res.status(400).json({ error: 'Response must be either "accepted" or "declined"' });
      return;
    }

    const participant = await Participant.findOne({ meetingId: req.params.id, userId: req.user._id });

    if (!participant) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    participant.status = response;
    await participant.save();

    res.json({ participant });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to respond to invite' });
  }
};

export const giveConsent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const participant = await Participant.findOne({ meetingId: req.params.id, userId: req.user._id });
    if (!participant) {
      res.status(404).json({ error: 'Participant record not found' });
      return;
    }

    participant.consentGiven = true;
    participant.consentTimestamp = new Date();
    await participant.save();

    res.json({ participant });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to record consent' });
  }
};

export const generateLiveKitToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { roomCode } = req.params;

    const meeting = await Meeting.findOne({ roomCode });
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Verify user is host or invited participant
    const isHost = meeting.hostId.toString() === req.user._id.toString();
    const isParticipant = await Participant.findOne({ meetingId: meeting._id, userId: req.user._id });

    if (!isHost && !isParticipant && req.user.role !== 'admin') {
      res.status(403).json({ error: 'You are not authorized to join this meeting' });
      return;
    }

    // Generate LiveKit token
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: req.user.username,
        name: req.user.name,
      }
    );

    at.addGrant({
      roomJoin: true,
      room: roomCode,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    res.json({ token, wsUrl: process.env.LIVEKIT_WS_URL });
  } catch (error: any) {
    console.error('[LiveKit] Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate meeting token' });
  }
};

export const endMeeting = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    
    const { id } = req.params;
    const meeting = await Meeting.findById(id);

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (meeting.hostId.toString() !== req.user._id.toString()) {
      res.status(403).json({ error: 'Only the host can end the meeting for all' });
      return;
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();
    await meeting.save();

    // Disconnect all users via WebSocket
    io.to(`meeting:${id}`).emit('meeting-ended');

    // Generate AI Summary
    const segments = await TranscriptSegment.find({ meetingId: id }).sort({ startTime: 1 });
    
    let summaryText = 'No spoken content captured.';
    let decisions: string[] = [];
    let actionItems: any[] = [];
    
    if (segments.length > 0) {
      try {
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_key_here') {
          throw new Error('No valid Gemini API key configured');
        }
        
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const fullTranscript = segments.map(s => `[${s.userName}]: ${s.text}`).join('\n');
        
        const prompt = `You are an AI meeting assistant. Here is a transcript of a meeting:\n\n${fullTranscript}\n\nPlease analyze it and provide the following in pure JSON format without markdown wrapping:\n{\n  "summary": "A 2-3 sentence overview of the meeting",\n  "decisions": ["Decision 1", "Decision 2"],\n  "actionItems": [\n    { "task": "Task description", "owner": "Name of person responsible or 'TBD'" }\n  ]\n}`;
        
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const parsed = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
        
        summaryText = parsed.summary || 'Summary could not be generated.';
        decisions = parsed.decisions || [];
        actionItems = parsed.actionItems || [];
      } catch (aiError) {
        console.error('[MeetingController] Gemini AI failed, falling back to heuristic:', aiError);
        
        summaryText = `This meeting lasted approximately ${Math.round((meeting.endedAt.getTime() - (meeting.startedAt?.getTime() || meeting.endedAt.getTime())) / 60000)} minutes. Participants discussed various topics including: ${segments.slice(0, 3).map(s => s.text).join(' ')}... (Generated via Nexus Free Heuristic Engine)`;
        
        decisions = segments
          .filter(s => s.text.toLowerCase().includes('decide') || s.text.toLowerCase().includes('agree'))
          .map(s => `[${s.userName}] ${s.text}`);
          
        if (decisions.length === 0) decisions.push('No explicit decisions detected.');

        actionItems = segments
          .filter(s => s.text.toLowerCase().includes('will') || s.text.toLowerCase().includes('need to') || s.text.toLowerCase().includes('todo'))
          .map(s => ({
            task: s.text,
            owner: s.userName,
            deadline: 'TBD'
          }));
      }
    }

    const summary = await MeetingSummary.create({
      meetingId: id,
      summary: summaryText,
      decisions: decisions,
      actionItems: actionItems,
      followUpEmail: `Hi Team,\n\nThanks for a great meeting. Here is a brief recap:\n\n${summaryText}\n\nBest,\n${req.user.name}`
    });

    // Actually send the email using Nodemailer & Ethereal
    await sendEmail(
      req.user.email,
      `Nexus Post-Meeting Debrief: ${meeting.title || 'Meeting'}`,
      summary.followUpEmail
    );

    res.json({ message: 'Meeting ended successfully', summaryId: summary._id });
  } catch (error) {
    console.error('Error ending meeting:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getMeetingSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    
    const { id } = req.params;
    const summary = await MeetingSummary.findOne({ meetingId: id });
    const transcript = await TranscriptSegment.find({ meetingId: id }).sort({ startTime: 1 });
    
    res.json({
      summary,
      transcript
    });
  } catch (error) {
    console.error('Error fetching meeting summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

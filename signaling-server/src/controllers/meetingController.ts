import { Response } from 'express';
import { nanoid } from 'nanoid';
import { AuthRequest } from '../middleware/authMiddleware';
import { prisma } from '../config/db';
import { AccessToken } from 'livekit-server-sdk';
import { io } from '../server';
import { sendEmail } from '../services/mailer';

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

    const lowerUsernames = participantUsernames.map((u: string) => u.toLowerCase());
    const users = await prisma.user.findMany({
      where: { username: { in: lowerUsernames }, isActive: true }
    });

    const validUsernames = users.map((u: any) => u.username);
    const invalidUsernames = lowerUsernames.filter((u: string) => !validUsernames.includes(u));

    if (invalidUsernames.length > 0) {
      res.status(400).json({ error: `Invalid usernames: ${invalidUsernames.join(', ')}` });
      return;
    }

    const roomCode = nanoid(12);

    const meeting = await prisma.meeting.create({
      data: {
        title,
        description: description || '',
        hostId: req.user.id,
        scheduledAt: new Date(scheduledAt),
        scheduledDurationMins,
        analyticsEnabled: analyticsEnabled !== false,
        moderationEnabled: moderationEnabled !== false,
        roomCode,
      },
    });

    const participantDocs = users.map((user: any) => ({
      meetingId: meeting.id,
      userId: user.id,
      status: 'pending',
      invitedAt: new Date(),
    }));

    // Add host as a participant too
    participantDocs.push({
      meetingId: meeting.id,
      userId: req.user.id,
      status: 'accepted',
      invitedAt: new Date(),
    });

    await prisma.participant.createMany({ data: participantDocs });

    const populatedMeeting = await prisma.meeting.findUnique({
      where: { id: meeting.id },
      include: { host: { select: { name: true, username: true, avatarColor: true } } }
    });

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

    const hostedMeetings = await prisma.meeting.findMany({
      where: { hostId: req.user.id },
      include: { host: { select: { name: true, username: true, avatarColor: true } } },
      orderBy: { scheduledAt: 'desc' },
      skip,
      take: limit
    });

    const participantRecords = await prisma.participant.findMany({
      where: { userId: req.user.id },
      select: { meetingId: true }
    });
    const participantMeetingIds = participantRecords.map((p: any) => p.meetingId);

    const invitedMeetings = await prisma.meeting.findMany({
      where: {
        id: { in: participantMeetingIds },
        hostId: { not: req.user.id },
      },
      include: { host: { select: { name: true, username: true, avatarColor: true } } },
      orderBy: { scheduledAt: 'desc' },
      skip,
      take: limit
    });

    res.json({ hosted: hostedMeetings, invited: invitedMeetings });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
};

export const getMeetingById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      include: { host: { select: { name: true, username: true, avatarColor: true } } }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const isHost = meeting.hostId === req.user.id;
    const isParticipant = await prisma.participant.findFirst({
      where: { meetingId: meeting.id, userId: req.user.id }
    });

    if (!isHost && !isParticipant && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized to view this meeting' });
      return;
    }

    const participants = await prisma.participant.findMany({
      where: { meetingId: meeting.id },
      include: { user: { select: { name: true, username: true, avatarColor: true, role: true } } }
    });

    res.json({ meeting, participants });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
};

export const getMeetingByRoomCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const meeting = await prisma.meeting.findUnique({
      where: { roomCode: req.params.roomCode },
      include: { host: { select: { name: true, username: true, avatarColor: true } } }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const isHost = meeting.hostId === req.user.id;
    const isParticipant = await prisma.participant.findFirst({
      where: { meetingId: meeting.id, userId: req.user.id }
    });

    if (!isHost && !isParticipant && req.user.role !== 'admin') {
      res.status(403).json({ error: 'You are not invited to this meeting' });
      return;
    }

    const participants = await prisma.participant.findMany({
      where: { meetingId: meeting.id },
      include: { user: { select: { name: true, username: true, avatarColor: true, role: true } } }
    });

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

    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (meeting.hostId !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Only the host can update meeting status' });
      return;
    }

    const updates: any = { status };
    if (status === 'ended') {
      const startTime = meeting.actualStartTime || meeting.scheduledAt || new Date();
      const endTime = meeting.actualEndTime || new Date();
      updates.actualEndTime = endTime;
      updates.endedAt = endTime;
      updates.actualDurationSecs = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id: req.params.id },
      data: updates
    });

    res.json({ meeting: updatedMeeting });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update meeting status' });
  }
};

export const respondToInvite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { response } = req.body;

    if (!response || !['accepted', 'declined'].includes(response)) {
      res.status(400).json({ error: 'Response must be either "accepted" or "declined"' });
      return;
    }

    const participant = await prisma.participant.findFirst({
      where: { meetingId: req.params.id, userId: req.user.id }
    });

    if (!participant) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    const updated = await prisma.participant.update({
      where: { id: participant.id },
      data: { status: response }
    });

    res.json({ participant: updated });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to respond to invite' });
  }
};

export const giveConsent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const participant = await prisma.participant.findFirst({
      where: { meetingId: req.params.id, userId: req.user.id }
    });

    if (!participant) {
      res.status(404).json({ error: 'Participant record not found' });
      return;
    }

    const updated = await prisma.participant.update({
      where: { id: participant.id },
      data: { consentGiven: true, consentTimestamp: new Date() }
    });

    res.json({ participant: updated });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to record consent' });
  }
};

export const generateLiveKitToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { roomCode } = req.params;

    const meeting = await prisma.meeting.findUnique({ where: { roomCode } });
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const isHost = meeting.hostId === req.user.id;
    const isParticipant = await prisma.participant.findFirst({
      where: { meetingId: meeting.id, userId: req.user.id }
    });

    if (!isHost && !isParticipant && req.user.role !== 'admin') {
      res.status(403).json({ error: 'You are not authorized to join this meeting' });
      return;
    }

    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
        res.status(500).json({ error: 'LiveKit credentials missing' });
        return;
    }

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

    res.json({ token, wsUrl: process.env.LIVEKIT_WS_URL, consentGiven: isParticipant?.consentGiven || false });
  } catch (error: any) {
    console.error('[LiveKit] Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate meeting token' });
  }
};

export const endMeeting = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    
    const { id } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { id } });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (meeting.hostId !== req.user.id) {
      res.status(403).json({ error: 'Only the host can end the meeting for all' });
      return;
    }

    const now = new Date();
    let actualDurationSecs = 0;
    if (meeting.actualStartTime) {
      actualDurationSecs = Math.floor((now.getTime() - meeting.actualStartTime.getTime()) / 1000);
    }

    await prisma.meeting.update({
      where: { id },
      data: {
        status: 'ended',
        actualEndTime: now,
        endedAt: now,
        actualDurationSecs,
      }
    });

    io.to(`meeting:${id}`).emit('meeting-ended');

    // Telemetry and Summary generation offloaded to Analysis API via TimescaleDB/Redpanda.
    // We will mock the summary generation for now.
    const summaryText = 'AI Summary is processing on the backend...';
    
    const summary = await prisma.meetingSummary.create({
      data: {
        meetingId: id,
        summaryText,
        decisions: [],
        actionItems: [],
        followUpEmail: `Hi Team,\n\nThanks for a great meeting.\n\nBest,\n${req.user.name}`
      }
    });

    await sendEmail(
      req.user.email,
      `Nexus Post-Meeting Debrief: ${meeting.title || 'Meeting'}`,
      summary.followUpEmail || ''
    );

    res.json({ message: 'Meeting ended successfully', summaryId: summary.id });
  } catch (error) {
    console.error('Error ending meeting:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getMeetingSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    
    const { id } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    const summary = await prisma.meetingSummary.findUnique({ where: { meetingId: id } });
    
    // Telemetry and Transcripts are offloaded to Analysis API via TimescaleDB
    const transcript: any[] = [];
    const speakingPercentages: any[] = [];

    res.json({
      summary,
      transcript,
      actualDurationSecs: meeting?.actualDurationSecs,
      actualStartTime: meeting?.actualStartTime,
      actualEndTime: meeting?.actualEndTime,
      speakingPercentages
    });
  } catch (error) {
    console.error('Error fetching meeting summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

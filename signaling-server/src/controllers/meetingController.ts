import { Response } from 'express';
import { nanoid } from 'nanoid';
import { AuthRequest } from '../middleware/authMiddleware';
import { prisma } from '../config/db';
import { AccessToken } from 'livekit-server-sdk';
import { io } from '../server';
import { sendEmail } from '../services/mailer';
import { isMeetingExpired, isValidStatusTransition, expireStaleMeetings, VALID_STATUSES } from '../services/meetingLifecycle';

export const createMeeting = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { title, description, participantUsernames, scheduledAt, scheduledDurationMins, analyticsEnabled, moderationEnabled, waitingRoomEnabled } = req.body;

    if (!title || !scheduledAt || !scheduledDurationMins) {
      res.status(400).json({ error: 'Title, scheduledAt, and scheduledDurationMins are required' });
      return;
    }

    const scheduledTime = new Date(scheduledAt).getTime();
    if (isNaN(scheduledTime)) {
      res.status(400).json({ error: 'Invalid scheduledAt format' });
      return;
    }

    const duration = parseInt(scheduledDurationMins as any, 10);
    if (isNaN(duration) || duration <= 0) {
      res.status(400).json({ error: 'scheduledDurationMins must be a positive integer' });
      return;
    }

    // Do not allow scheduling a meeting whose validity window has completely passed
    const expiryThreshold = scheduledTime + (duration * 60 * 1000) + (15 * 60 * 1000);
    if (Date.now() > expiryThreshold) {
      res.status(400).json({ error: 'Cannot schedule a meeting whose scheduled window has already passed' });
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
        scheduledDurationMins: duration,
        status: 'scheduled',
        analyticsEnabled: analyticsEnabled !== false,
        moderationEnabled: moderationEnabled !== false,
        waitingRoomEnabled: waitingRoomEnabled === true,
        roomCode,
      },
    });

    const participantDocs = users
      .filter((user: any) => user.id !== req.user.id)
      .map((user: any) => ({
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

    // Proactive lifecycle sweep: expire any stale scheduled meetings
    await expireStaleMeetings();

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const filter = ((req.query.filter as string) || (req.query.type as string) || 'all').toLowerCase();

    const hostedMeetingsRaw = await prisma.meeting.findMany({
      where: { hostId: req.user.id },
      include: { host: { select: { name: true, username: true, avatarColor: true } } },
      orderBy: { scheduledAt: 'desc' },
    });

    const participantRecords = await prisma.participant.findMany({
      where: { userId: req.user.id },
      select: { meetingId: true }
    });
    const participantMeetingIds = participantRecords.map((p: any) => p.meetingId);

    const invitedMeetingsRaw = await prisma.meeting.findMany({
      where: {
        id: { in: participantMeetingIds },
        hostId: { not: req.user.id },
      },
      include: { host: { select: { name: true, username: true, avatarColor: true } } },
      orderBy: { scheduledAt: 'desc' },
    });

    const isUpcoming = (m: any) => (m.status === 'scheduled' || m.status === 'waiting' || m.status === 'active') && !isMeetingExpired(m);
    const isActive = (m: any) => m.status === 'active';
    const isHistory = (m: any) => m.status === 'ended' || m.status === 'cancelled' || m.status === 'expired' || isMeetingExpired(m);

    let hosted = hostedMeetingsRaw;
    let invited = invitedMeetingsRaw;

    if (filter === 'upcoming') {
      hosted = hostedMeetingsRaw.filter(isUpcoming);
      invited = invitedMeetingsRaw.filter(isUpcoming);
    } else if (filter === 'active') {
      hosted = hostedMeetingsRaw.filter(isActive);
      invited = invitedMeetingsRaw.filter(isActive);
    } else if (filter === 'history' || filter === 'past') {
      hosted = hostedMeetingsRaw.filter(isHistory);
      invited = invitedMeetingsRaw.filter(isHistory);
    }

    const allUpcoming = [...hostedMeetingsRaw, ...invitedMeetingsRaw].filter(isUpcoming);
    const allHistory = [...hostedMeetingsRaw, ...invitedMeetingsRaw].filter(isHistory);
    const allActive = [...hostedMeetingsRaw, ...invitedMeetingsRaw].filter(isActive);

    res.json({
      hosted: hosted.slice(skip, skip + limit),
      invited: invited.slice(skip, skip + limit),
      upcoming: allUpcoming.slice(skip, skip + limit),
      history: allHistory.slice(skip, skip + limit),
      active: allActive.slice(skip, skip + limit),
      total: {
        hosted: hosted.length,
        invited: invited.length,
        upcoming: allUpcoming.length,
        history: allHistory.length,
        active: allActive.length,
      }
    });
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

    if (isMeetingExpired(meeting) && meeting.status !== 'expired') {
      await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'expired' } });
      meeting.status = 'expired';
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

    if (isMeetingExpired(meeting) && meeting.status !== 'expired') {
      await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'expired' } });
      meeting.status = 'expired';
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
    if (!status || !VALID_STATUSES.includes(status as any)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
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

    if (isMeetingExpired(meeting) && meeting.status !== 'expired') {
      await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'expired' } });
      meeting.status = 'expired';
    }

    if (!isValidStatusTransition(meeting.status, status)) {
      res.status(400).json({
        error: `Cannot transition meeting from '${meeting.status}' to '${status}'. Terminal meetings (ended, cancelled, or expired) cannot be modified.`
      });
      return;
    }

    const updates: any = { status };
    if (status === 'ended') {
      const startTime = meeting.actualStartTime || meeting.scheduledAt || new Date();
      const endTime = meeting.actualEndTime || new Date();
      updates.actualEndTime = endTime;
      updates.endedAt = endTime;
      updates.actualDurationSecs = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    } else if (status === 'active' && !meeting.actualStartTime) {
      const now = new Date();
      updates.actualStartTime = now;
      updates.startedAt = now;
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

export const cancelMeeting = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const { id } = req.params;
    const meeting = await prisma.meeting.findFirst({
      where: { OR: [{ id }, { roomCode: id }] }
    });
    if (!meeting) { res.status(404).json({ error: 'Meeting not found' }); return; }
    if (meeting.hostId !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Only the host can cancel the meeting' });
      return;
    }
    if (meeting.status === 'ended' || meeting.status === 'expired') {
      res.status(400).json({ error: `Cannot cancel a meeting that is already ${meeting.status}` });
      return;
    }
    if (meeting.status === 'cancelled') {
      res.json({ message: 'Meeting was already cancelled', meeting });
      return;
    }
    const updated = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: 'cancelled' }
    });
    io.to(`meeting:${meeting.id}`).emit('meeting-cancelled', { meetingId: meeting.id, roomCode: meeting.roomCode });
    res.json({ message: 'Meeting cancelled successfully', meeting: updated });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to cancel meeting' });
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

    const meeting = await prisma.meeting.findFirst({
      where: {
        OR: [
          { id: req.params.id },
          { roomCode: req.params.id }
        ]
      }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    let participant = await prisma.participant.findFirst({
      where: { meetingId: meeting.id, userId: req.user.id }
    });

    if (!participant) {
      res.status(403).json({ error: 'You are not invited to this meeting' });
      return;
    }

    if (participant.status === 'removed' || participant.status === 'declined') {
      res.status(403).json({ error: 'You are not authorized to give consent for this meeting' });
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

    const meeting = await prisma.meeting.findFirst({
      where: {
        OR: [
          { roomCode },
          { id: roomCode }
        ]
      }
    });
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Lifecycle enforcement: Reject terminated, cancelled, or expired meetings
    if (meeting.status === 'ended' || meeting.status === 'cancelled' || meeting.status === 'expired' || isMeetingExpired(meeting)) {
      if (isMeetingExpired(meeting) && meeting.status !== 'expired') {
        await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'expired' } });
      }
      const reason = (meeting.status === 'expired' || isMeetingExpired(meeting)) ? 'expired' : meeting.status;
      res.status(410).json({
        error: `Cannot join meeting: This meeting has ${reason} and can no longer be launched or joined.`
      });
      return;
    }

    const isHost = meeting.hostId === req.user.id;

    if (meeting.isLocked && !isHost) {
      res.status(403).json({ error: 'Meeting is locked by the host' });
      return;
    }

    const participant = await prisma.participant.findFirst({
      where: { meetingId: meeting.id, userId: req.user.id }
    });

    if (!isHost && (!participant || participant.status === 'removed' || participant.status === 'declined')) {
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
      room: meeting.roomCode,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    res.json({
      token,
      wsUrl: process.env.LIVEKIT_WS_URL,
      consentGiven: participant ? participant.consentGiven : false,
      isHost,
      hostId: meeting.hostId,
      meetingId: meeting.id,
      scheduledDurationMins: meeting.scheduledDurationMins,
    });
  } catch (error: any) {
    console.error('[LiveKit] Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate meeting token' });
  }
};

export const endMeeting = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    
    const { id } = req.params;

    const transactionResult = await prisma.$transaction(async (tx) => {
      const meeting = await tx.meeting.findFirst({
        where: {
          OR: [
            { id },
            { roomCode: id }
          ]
        }
      });

      if (!meeting) {
        throw new Error('NOT_FOUND');
      }

      if (meeting.hostId !== req.user!.id) {
        throw new Error('FORBIDDEN');
      }

      if (meeting.status === 'cancelled') {
        throw new Error('CANCELLED');
      }

      if (meeting.status === 'expired') {
        throw new Error('EXPIRED');
      }

      const meetingId = meeting.id;

      if (meeting.status === 'ended') {
        return { meeting, summary: await tx.meetingSummary.findUnique({ where: { meetingId } }), alreadyEnded: true };
      }

      const now = new Date();
      let actualDurationSecs = 0;
      if (meeting.actualStartTime) {
        actualDurationSecs = Math.floor((now.getTime() - meeting.actualStartTime.getTime()) / 1000);
      }

      const updatedMeeting = await tx.meeting.update({
        where: { id: meetingId },
        data: {
          status: 'ended',
          actualEndTime: now,
          endedAt: now,
          actualDurationSecs,
        }
      });

      const summary = await tx.meetingSummary.upsert({
        where: { meetingId },
        update: {},
        create: {
          meetingId,
          status: 'PENDING',
          decisions: [],
          actionItems: []
        }
      });
      return { meeting: updatedMeeting, summary, alreadyEnded: false };
    });

    if (transactionResult.alreadyEnded) {
      res.json({
        message: 'Meeting was already ended',
        summaryId: transactionResult.summary?.id,
        meetingId: transactionResult.meeting.id
      });
      return;
    }

    const canonicalMeetingId = transactionResult.meeting.id;
    const roomCode = transactionResult.meeting.roomCode;

    const endPayload = {
      meetingId: canonicalMeetingId,
      roomCode,
      status: 'ended',
      redirectAfter: 2000
    };

    io.to(`meeting:${canonicalMeetingId}`).emit('meeting-ended', endPayload);
    io.to(`meeting:${canonicalMeetingId}`).emit('meeting-ended-by-host', endPayload);
    if (roomCode) {
      io.to(`meeting:${roomCode}`).emit('meeting-ended', endPayload);
      io.to(`meeting:${roomCode}`).emit('meeting-ended-by-host', endPayload);
    }

    // Trigger AI summary asynchronously
    const analysisApiUrl = process.env.VITE_ANALYSIS_URL ? process.env.VITE_ANALYSIS_URL.replace('ws://', 'http://') : 'http://localhost:8000';
    fetch(`${analysisApiUrl}/api/ai/summarize/${canonicalMeetingId}`, {
      method: 'POST',
      headers: {
        'X-Internal-Token': process.env.INTERNAL_API_TOKEN || ''
      }
    }).then(res => {
      console.log(`AI trigger response: ${res.status} ${res.statusText}`);
    }).catch(err => {
      console.error('Failed to trigger AI summary:', err);
    });

    // We no longer send the email immediately; the AI worker or a separate cron should do that when COMPLETED.
    res.json({
      message: 'Meeting ended successfully',
      summaryId: transactionResult.summary?.id,
      meetingId: canonicalMeetingId
    });
  } catch (error: any) {
    console.error('Error ending meeting:', error);
    if (error.message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Meeting not found' });
    } else if (error.message === 'FORBIDDEN') {
      res.status(403).json({ error: 'Only the host can end the meeting for all' });
    } else if (error.message === 'CANCELLED') {
      res.status(400).json({ error: 'Cannot end a meeting that was cancelled' });
    } else if (error.message === 'EXPIRED') {
      res.status(400).json({ error: 'Cannot end a meeting that has expired' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
};

export const getMeetingSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    
    const { id } = req.params;
    const meeting = await prisma.meeting.findFirst({
      where: {
        OR: [
          { id },
          { roomCode: id }
        ]
      }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const isHost = meeting.hostId === req.user.id;
    const isAdmin = req.user.role === 'admin';
    let isAuthorized = isHost || isAdmin;

    if (!isAuthorized) {
      const participant = await prisma.participant.findFirst({
        where: {
          meetingId: meeting.id,
          userId: req.user.id,
          status: { notIn: ['removed', 'declined'] }
        }
      });
      if (participant) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      res.status(403).json({ error: 'Not authorized to view meeting summary' });
      return;
    }

    const summary = await prisma.meetingSummary.findUnique({ where: { meetingId: meeting.id } });
    
    // Fetch persisted transcripts from the Transcription table
    const transcriptRecords = await prisma.transcription.findMany({
      where: { meetingId: meeting.id },
      orderBy: { startTimeMs: 'asc' }
    });

    const transcript = transcriptRecords.map((t) => {
      const start = Number(t.startTimeMs);
      const mins = Math.floor(start / 60000);
      const secs = Math.floor((start % 60000) / 1000);
      return {
        id: t.id,
        userName: t.participantId,
        text: t.text,
        startTimeMs: Number(t.startTimeMs),
        endTimeMs: Number(t.endTimeMs),
        formattedTime: `${mins}:${secs < 10 ? '0' : ''}${secs}`
      };
    });

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

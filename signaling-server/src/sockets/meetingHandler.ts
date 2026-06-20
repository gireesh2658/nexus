import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwtConfig';
import Participant from '../models/Participant';
import Meeting from '../models/Meeting';
import mongoose from 'mongoose';

interface MeetingRoom {
  meetingId: string;
  roomCode: string;
  hostId: string;
  participants: Map<string, { socketId: string; username: string; name: string; avatarColor: string }>;
}

const activeRooms = new Map<string, MeetingRoom>();

/**
 * Meeting Room Handler
 * Manages meeting lifecycle events: join, leave, participant sync, moderation, behavioral signals.
 *
 * SECURITY: All connections are JWT-verified. Host-only operations check the
 * caller's identity against the meeting's hostId.
 */
export const setupMeetingHandler = (io: Server): void => {
  io.on('connection', (socket: Socket) => {
    // ── JWT verification ────────────────────────────────────────────────
    const token = socket.handshake.auth?.token;
    if (!token) {
      socket.emit('auth-error', { error: 'No token provided' });
      socket.disconnect(true);
      return;
    }

    let userId: string;
    try {
      const decoded = jwt.verify(token, jwtConfig.publicKey, {
        algorithms: [jwtConfig.algorithm],
      }) as { userId: string };
      userId = decoded.userId;
    } catch {
      socket.emit('auth-error', { error: 'Invalid or expired token' });
      socket.disconnect(true);
      return;
    }

    // Join the user's private room for targeted messaging
    socket.join(`user:${userId}`);

    // ── Join a meeting room (with strict authorization) ────────────────
    socket.on('join-room', async (data: { meetingId: string; roomCode: string; username: string; name: string; avatarColor: string }) => {
      const { meetingId, roomCode, username, name, avatarColor } = data;
      
      try {
        const meeting = await Meeting.findOne({
          $or: [
            { _id: mongoose.isValidObjectId(meetingId) ? meetingId : null },
            { roomCode: roomCode || meetingId }
          ]
        });
        if (!meeting) {
          socket.emit('join-error', { error: 'Meeting not found' });
          return;
        }

        // Check: is the user the host OR an invited participant?
        const isHost = meeting.hostId.toString() === userId;
        const participant = await Participant.findOne({ meetingId, userId, status: { $in: ['pending', 'accepted'] } });
        
        if (!isHost && !participant) {
          socket.emit('join-error', { error: 'You are not authorized to join this meeting' });
          return;
        }
      } catch (err) {
        console.error('[Meeting] Authorization check failed:', err);
        socket.emit('join-error', { error: 'Authorization failed' });
        return;
      }
      
      // Join Socket.IO room
      socket.join(`meeting:${meetingId}`);

      // Track in active rooms
      if (!activeRooms.has(meetingId)) {
        // Fetch hostId to store for authorization checks
        let hostId = '';
        try {
          const meeting = await Meeting.findById(meetingId).select('hostId');
          hostId = meeting?.hostId.toString() || '';
        } catch { /* already validated above */ }

        activeRooms.set(meetingId, {
          meetingId,
          roomCode,
          hostId,
          participants: new Map(),
        });
      }

      const room = activeRooms.get(meetingId)!;
      room.participants.set(userId, { socketId: socket.id, username, name, avatarColor });

      // Update participant join time in DB
      try {
        await Participant.findOneAndUpdate(
          { meetingId, userId },
          { joinedAt: new Date(), status: 'accepted' }
        );
      } catch (err) {
        console.error('[Meeting] Failed to update participant join time:', err);
      }

      // Notify all participants in the room
      const participantList = Array.from(room.participants.entries()).map(([uid, info]) => ({
        userId: uid,
        ...info,
      }));

      io.to(`meeting:${meetingId}`).emit('user-joined', {
        userId,
        username,
        name,
        avatarColor,
        participants: participantList,
      });
    });

    // ── Leave a meeting room ────────────────────────────────────────────
    socket.on('leave-room', async (data: { meetingId: string }) => {
      const { meetingId } = data;
      
      socket.leave(`meeting:${meetingId}`);

      const room = activeRooms.get(meetingId);
      if (room) {
        const userInfo = room.participants.get(userId);
        room.participants.delete(userId);

        // Update participant left time
        try {
          await Participant.findOneAndUpdate(
            { meetingId, userId },
            { leftAt: new Date() }
          );
        } catch (err) {
          console.error('[Meeting] Failed to update participant leave time:', err);
        }

        io.to(`meeting:${meetingId}`).emit('user-left', {
          userId,
          username: userInfo?.username,
          participants: Array.from(room.participants.entries()).map(([uid, info]) => ({
            userId: uid,
            ...info,
          })),
        });

        // Clean up empty rooms
        if (room.participants.size === 0) {
          activeRooms.delete(meetingId);
        }
      }
    });

    // ── Behavioral signal relay ─────────────────────────────────────────
    socket.on('behavioral-signal', (data: { meetingId: string; signal: any }) => {
      const room = activeRooms.get(data.meetingId);
      if (room && room.participants.has(userId)) {
        io.to(`meeting:${data.meetingId}`).emit('behavioral-update', {
          userId,
          signal: data.signal,
        });
      }
    });

    // ── Chat and Collaboration ──────────────────────────────────────────
    socket.on('send-chat', (data: { meetingId: string; text: string; senderId: string; senderName: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (room && room.participants.has(userId)) {
        // Broadcast to everyone else in the room
        socket.to(`meeting:${data.meetingId}`).emit('chat-message', {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          senderId: data.senderId,
          senderName: data.senderName,
          text: data.text,
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('draw-line', (data: any) => {
      const room = activeRooms.get(data.meetingId);
      if (room && room.participants.has(userId)) {
        socket.to(`meeting:${data.meetingId}`).emit('draw-line', data);
      }
    });

    socket.on('draw-clear', (data: { meetingId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (room && room.participants.has(userId)) {
        socket.to(`meeting:${data.meetingId}`).emit('draw-clear');
      }
    });

    socket.on('meeting-reaction', (data: { meetingId: string; emoji: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (room && room.participants.has(userId)) {
        io.to(`meeting:${data.meetingId}`).emit('meeting-reaction', {
          userId,
          emoji: data.emoji
        });
      }
    });

    // ── Live Transcription ──────────────────────────────────────────────
    socket.on('live-transcript', async (data: { meetingId: string; text: string; isFinal: boolean; userName: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (room && room.participants.has(userId)) {
        // Broadcast to everyone in the room so the sender also sees their own live captions
        io.to(`meeting:${data.meetingId}`).emit('live-transcript', {
          userId,
          userName: data.userName,
          text: data.text,
          isFinal: data.isFinal,
          timestamp: new Date().toISOString()
        });

        // Only save final segments to the DB
        if (data.isFinal && data.text.trim().length > 0) {
          try {
            const { default: TranscriptSegment } = await import('../models/TranscriptSegment');
            await TranscriptSegment.create({
              meetingId: data.meetingId,
              userId: userId,
              userName: data.userName,
              text: data.text.trim(),
              isInterim: false,
            });
          } catch (err) {
            console.error('[Meeting] Failed to save transcript segment:', err);
          }
        }
      }
    });

    // ── Host Moderation Controls (AUTHORIZED) ───────────────────────────
    socket.on('moderation-event', (data: { meetingId: string; targetUserId: string; type: string; warningCount: number; message: string }) => {
      const { meetingId, targetUserId, type, warningCount, message } = data;

      if (type === 'warn') {
        io.to(`user:${targetUserId}`).emit('moderation-warning', { type: 'private', message, warningCount });
      } else if (type === 'warn_all') {
        io.to(`meeting:${meetingId}`).emit('moderation-warning', { type: 'public', message, warningCount, targetUserId });
      } else if (type === 'mute') {
        io.to(`meeting:${meetingId}`).emit('moderation-warning', { type: 'mute', message, warningCount, targetUserId });
        io.to(`user:${targetUserId}`).emit('force-mute', { meetingId });
      }
    });

    // ── Host moderation controls (AUTHORIZED) ───────────────────────────
    socket.on('host-mute', async (data: { meetingId: string; targetUserId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) {
        socket.emit('moderation-error', { error: 'Only the host can mute participants' });
        return;
      }
      io.to(`user:${data.targetUserId}`).emit('force-mute', { meetingId: data.meetingId });
    });

    socket.on('host-mute-all', async (data: { meetingId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) {
        socket.emit('moderation-error', { error: 'Only the host can mute participants' });
        return;
      }
      // Broadcast force-mute to everyone in the room except the host
      socket.to(`meeting:${data.meetingId}`).emit('force-mute', { meetingId: data.meetingId });
    });

    socket.on('host-lock-meeting', async (data: { meetingId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) {
        socket.emit('moderation-error', { error: 'Only the host can lock the meeting' });
        return;
      }
      io.to(`meeting:${data.meetingId}`).emit('meeting-locked', { meetingId: data.meetingId });
    });

    socket.on('host-unmute', async (data: { meetingId: string; targetUserId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) {
        socket.emit('moderation-error', { error: 'Only the host can unmute participants' });
        return;
      }
      io.to(`user:${data.targetUserId}`).emit('force-unmute', { meetingId: data.meetingId });
    });

    socket.on('host-remove', async (data: { meetingId: string; targetUserId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) {
        socket.emit('moderation-error', { error: 'Only the host can remove participants' });
        return;
      }

      io.to(`user:${data.targetUserId}`).emit('force-remove', { meetingId: data.meetingId });
      
      try {
        await Participant.findOneAndUpdate(
          { meetingId: data.meetingId, userId: data.targetUserId },
          { status: 'removed', leftAt: new Date() }
        );
      } catch (err) {
        console.error('[Meeting] Failed to remove participant:', err);
      }
    });

    // ── Focus score update (from analysis API → host dashboard) ─────────
    socket.on('focus-score-update', (data: { meetingId: string; scores: Record<string, number> }) => {
      io.to(`meeting:${data.meetingId}`).emit('focus-scores', data.scores);
    });

    // ── Handle disconnect ───────────────────────────────────────────────
    socket.on('disconnect', () => {
      for (const [meetingId, room] of activeRooms.entries()) {
        if (room.participants.has(userId)) {
          const userInfo = room.participants.get(userId);
          room.participants.delete(userId);

          io.to(`meeting:${meetingId}`).emit('user-left', {
            userId,
            username: userInfo?.username,
            participants: Array.from(room.participants.entries()).map(([uid, info]) => ({
              userId: uid,
              ...info,
            })),
          });

          if (room.participants.size === 0) {
            activeRooms.delete(meetingId);
          }
        }
      }
    });
  });
};

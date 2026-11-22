import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwtConfig';
import { prisma } from '../config/db';
import { redis1, isRedisAvailable } from '../config/redis';
import { isMeetingExpired } from '../services/meetingLifecycle';

interface ParticipantInfo {
  socketId: string;
  username: string;
  name: string;
  avatarColor: string;
  joinedAt: Date;
}

interface MeetingRoom {
  meetingId: string;
  roomCode: string;
  hostId: string;
  status: 'scheduled' | 'waiting' | 'active' | 'ended' | 'cancelled' | 'expired';
  actualStartTime: Date | null;
  waitingRoomEnabled: boolean;
  preventUnmute: boolean;
  isLocked: boolean;
  participants: Map<string, ParticipantInfo>;
  waitingParticipants: Map<string, ParticipantInfo>;
  idleTimeout: NodeJS.Timeout | null;
}

const activeRooms = new Map<string, MeetingRoom>();

const findActiveRoom = (idOrCode: string): MeetingRoom | undefined => {
  if (!idOrCode) return undefined;
  const direct = activeRooms.get(idOrCode);
  if (direct) return direct;
  for (const room of activeRooms.values()) {
    if (room.roomCode === idOrCode) return room;
  }
  return undefined;
};

export const setupMeetingHandler = (io: Server): void => {
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, jwtConfig.publicKey, {
        algorithms: [jwtConfig.algorithm],
      }) as { userId: string; jti?: string; typ?: string };

      if (decoded.typ !== 'access') {
        return next(new Error('Authentication error: Invalid token type. Access token required.'));
      }

      if (decoded.jti && redis1 && isRedisAvailable()) {
        try {
          const blacklisted = await redis1.get(`bl_${decoded.jti}`);
          if (blacklisted) {
            return next(new Error('Authentication error: Token has been revoked.'));
          }
        } catch (err) {
          console.warn('[Socket] Redis error checking token revocation:', err);
        }
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, name: true, username: true, avatarColor: true, role: true, isActive: true }
      });

      if (!dbUser) {
        return next(new Error('Authentication error: User not found'));
      }

      if (!dbUser.isActive) {
        return next(new Error('Authentication error: Account deactivated'));
      }

      socket.data.user = dbUser;
      next();
    } catch (err: any) {
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    let user = socket.data.user;

    // Fallback if io.use was bypassed in certain environments
    if (!user) {
      const token = socket.handshake.auth?.token;
      if (!token) {
        socket.emit('auth-error', { error: 'No token provided' });
        socket.disconnect(true);
        return;
      }

      let userId: string;
      let jti: string | undefined;
      try {
        const decoded = jwt.verify(token, jwtConfig.publicKey, {
          algorithms: [jwtConfig.algorithm],
        }) as { userId: string; jti?: string; typ?: string };

        if (decoded.typ !== 'access') {
          socket.emit('auth-error', { error: 'Invalid token type. Access token required.' });
          socket.disconnect(true);
          return;
        }

        userId = decoded.userId;
        jti = decoded.jti;
      } catch {
        socket.emit('auth-error', { error: 'Invalid or expired token' });
        socket.disconnect(true);
        return;
      }

      if (jti && redis1 && isRedisAvailable()) {
        try {
          const blacklisted = await redis1.get(`bl_${jti}`);
          if (blacklisted) {
            socket.emit('auth-error', { error: 'Token has been revoked.' });
            socket.disconnect(true);
            return;
          }
        } catch (err) {
          console.warn('[Socket] Redis error checking token revocation:', err);
        }
      }

      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, username: true, avatarColor: true, role: true, isActive: true }
        });

        if (!dbUser) {
          socket.emit('auth-error', { error: 'User not found' });
          socket.disconnect(true);
          return;
        }

        if (!dbUser.isActive) {
          socket.emit('auth-error', { error: 'Account deactivated' });
          socket.disconnect(true);
          return;
        }

        user = dbUser;
        socket.data.user = dbUser;
      } catch (err) {
        socket.emit('auth-error', { error: 'Failed to authenticate socket' });
        socket.disconnect(true);
        return;
      }
    }

    const userId = user.id;
    socket.join(`user:${userId}`);

    socket.on('join-room', async (data: { meetingId: string; roomCode?: string }) => {
      const { meetingId, roomCode } = data;
      const username = user.username;
      const name = user.name;
      const avatarColor = user.avatarColor || '#3B82F6';
      
      try {
        const meeting = await prisma.meeting.findFirst({
          where: {
            OR: [
              { id: meetingId.length === 36 ? meetingId : undefined },
              { roomCode: roomCode || meetingId }
            ]
          }
        });
        
        if (!meeting) {
          socket.emit('join-error', { error: 'Meeting not found' });
          return;
        }

        if (meeting.status === 'ended' || meeting.status === 'cancelled' || meeting.status === 'expired' || isMeetingExpired(meeting)) {
          const expired = meeting.status === 'expired' || isMeetingExpired(meeting);
          if (expired && meeting.status !== 'expired') {
            await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'expired' } }).catch(() => {});
          }
          const errorMsg = meeting.status === 'cancelled'
            ? 'This meeting was cancelled.'
            : expired
            ? 'This scheduled meeting has expired and can no longer be joined.'
            : 'This meeting has ended.';
          socket.emit('join-error', { error: errorMsg });
          return;
        }

        const isHost = meeting.hostId === userId;
        const participantDb = await prisma.participant.findFirst({
          where: { meetingId: meeting.id, userId }
        });
        
        if (!isHost && !participantDb) {
          socket.emit('join-error', { error: 'You are not authorized to join this meeting.' });
          return;
        }

        if (!isHost && participantDb && (participantDb.status === 'removed' || participantDb.status === 'declined')) {
          socket.emit('join-error', { error: 'You are not authorized to join this meeting.' });
          return;
        }

        const roomKey = meeting.id;

        if (!activeRooms.has(roomKey)) {
          activeRooms.set(roomKey, {
            meetingId: roomKey,
            roomCode: meeting.roomCode,
            hostId: meeting.hostId,
            status: meeting.status as any,
            actualStartTime: meeting.actualStartTime || null,
            waitingRoomEnabled: meeting.waitingRoomEnabled !== undefined ? meeting.waitingRoomEnabled : true,
            preventUnmute: meeting.preventUnmute !== undefined ? meeting.preventUnmute : false,
            isLocked: meeting.isLocked !== undefined ? meeting.isLocked : false,
            participants: new Map(),
            waitingParticipants: new Map(),
            idleTimeout: null,
          });
        }

        const room = activeRooms.get(roomKey)!;

        if (!isHost && room.isLocked) {
          socket.emit('meeting-locked', { error: 'The meeting is locked by the host.' });
          return;
        }

        if (!isHost && room.waitingRoomEnabled) {
          room.waitingParticipants.set(userId, { socketId: socket.id, username, name, avatarColor, joinedAt: new Date() });
          socket.join(`waiting:${roomKey}`);
          socket.emit('waiting-room-status', { status: 'waiting', message: 'Please wait, the host will let you in soon.' });
          
          io.to(`user:${room.hostId}`).emit('participant-waiting', { userId, username, name, avatarColor });
          
          if (room.status === 'scheduled') {
            room.status = 'waiting';
            await prisma.meeting.update({ where: { id: roomKey }, data: { status: 'waiting' } });
          }
          return;
        }

        socket.join(`meeting:${roomKey}`);
        if (meeting.roomCode && meeting.roomCode !== roomKey) {
          socket.join(`meeting:${meeting.roomCode}`);
        }
        room.participants.set(userId, { socketId: socket.id, username, name, avatarColor, joinedAt: new Date() });

        if (room.idleTimeout) {
          clearTimeout(room.idleTimeout);
          room.idleTimeout = null;
        }

        if (isHost && (room.status === 'scheduled' || room.status === 'waiting')) {
          room.status = 'active';
          room.actualStartTime = new Date();
          
          await prisma.meeting.update({
            where: { id: roomKey },
            data: { status: 'active', actualStartTime: room.actualStartTime, startedAt: room.actualStartTime }
          });

          if (!room.waitingRoomEnabled) {
             for (const [wId, wInfo] of room.waitingParticipants.entries()) {
               room.participants.set(wId, wInfo);
               const wSocket = io.sockets.sockets.get(wInfo.socketId);
               if (wSocket) {
                 wSocket.leave(`waiting:${roomKey}`);
                 wSocket.join(`meeting:${roomKey}`);
                 if (meeting.roomCode && meeting.roomCode !== roomKey) {
                   wSocket.join(`meeting:${meeting.roomCode}`);
                 }
                 wSocket.emit('admitted', { actualStartTime: room.actualStartTime });
               }
             }
             room.waitingParticipants.clear();
          }

          io.to(`meeting:${roomKey}`).emit('meeting-started', { actualStartTime: room.actualStartTime });
        }

        try {
          const now = new Date();
          const p = await prisma.participant.findFirst({ where: { meetingId: roomKey, userId } });
          if (p) {
            let joinTime = p.joinTime;
            if (p.leaveTime && (now.getTime() - p.leaveTime.getTime()) >= 60000) {
               joinTime = now;
            } else if (!p.leaveTime) {
               joinTime = now;
            }
            await prisma.participant.update({
              where: { id: p.id },
              data: { joinTime }
            });
          }
        } catch (err) {
          console.error('[Meeting] Failed to update joinTime:', err);
        }

        const participantList = Array.from(room.participants.entries()).map(([uid, info]) => ({
          userId: uid, ...info,
        }));

        io.to(`meeting:${roomKey}`).emit('user-joined', {
          userId, username, name, avatarColor,
          participants: participantList,
          actualStartTime: room.actualStartTime
        });

        socket.emit('room-status', { status: room.status, actualStartTime: room.actualStartTime });

      } catch (err) {
        console.error('[Meeting] Error in join-room:', err);
      }
    });

    socket.on('host-admit', (data: { meetingId: string; targetUserId: string }) => {
      const room = findActiveRoom(data.meetingId);
      if (!room || room.hostId !== userId) return;
      const canonicalId = room.meetingId;

      const pInfo = room.waitingParticipants.get(data.targetUserId);
      if (pInfo) {
        room.waitingParticipants.delete(data.targetUserId);
        room.participants.set(data.targetUserId, pInfo);
        
        const wSocket = io.sockets.sockets.get(pInfo.socketId);
        if (wSocket) {
          wSocket.leave(`waiting:${canonicalId}`);
          wSocket.join(`meeting:${canonicalId}`);
          if (room.roomCode && room.roomCode !== canonicalId) {
            wSocket.join(`meeting:${room.roomCode}`);
          }
          wSocket.emit('admitted', { actualStartTime: room.actualStartTime });
        }

        io.to(`meeting:${canonicalId}`).emit('user-joined', {
          userId: data.targetUserId,
          ...pInfo,
          participants: Array.from(room.participants.entries()).map(([uid, info]) => ({ userId: uid, ...info })),
          actualStartTime: room.actualStartTime
        });
      }
    });

    socket.on('host-deny', (data: { meetingId: string; targetUserId: string }) => {
      const room = findActiveRoom(data.meetingId);
      if (!room || room.hostId !== userId) return;

      const pInfo = room.waitingParticipants.get(data.targetUserId);
      if (pInfo) {
        room.waitingParticipants.delete(data.targetUserId);
        io.to(pInfo.socketId).emit('denied', { message: 'The host did not admit you to the meeting.' });
      }
    });

    socket.on('end-meeting-for-all', async (data: { meetingId: string }) => {
      const room = findActiveRoom(data.meetingId);
      if (!room || room.hostId !== userId) return;
      const canonicalId = room.meetingId;

      const now = new Date();
      const durationSecs = room.actualStartTime ? Math.floor((now.getTime() - room.actualStartTime.getTime()) / 1000) : 0;

      await prisma.meeting.update({
        where: { id: canonicalId },
        data: { status: 'ended', actualEndTime: now, endedAt: now, actualDurationSecs: durationSecs }
      });

      for (const [uid] of room.participants.entries()) {
         await prisma.participant.updateMany({
           where: { meetingId: canonicalId, userId: uid },
           data: { leaveTime: now }
         });
      }

      io.to(`meeting:${canonicalId}`).emit('meeting-ended-by-host', { redirectAfter: 3000 });
      io.to(`meeting:${canonicalId}`).emit('meeting-ended', { redirectAfter: 3000 });
      activeRooms.delete(canonicalId);
    });

    socket.on('host-transfer', async (data: { meetingId: string; newHostId: string }) => {
      const room = findActiveRoom(data.meetingId);
      if (!room || room.hostId !== userId) return;
      const canonicalId = room.meetingId;
      
      if (room.participants.has(data.newHostId)) {
        room.hostId = data.newHostId;
        await prisma.meeting.update({ where: { id: canonicalId }, data: { hostId: data.newHostId } });
        io.to(`meeting:${canonicalId}`).emit('host-transferred', { newHostId: data.newHostId });
      }
    });

    socket.on('host-spotlight', (data: { meetingId: string; targetUserId: string | null }) => {
      const room = findActiveRoom(data.meetingId);
      if (!room || room.hostId !== userId) return;
      io.to(`meeting:${room.meetingId}`).emit('spotlight-changed', { spotlightedUserId: data.targetUserId });
    });

    socket.on('host-lock-meeting', async (data: { meetingId: string; isLocked: boolean }) => {
      const room = findActiveRoom(data.meetingId);
      if (!room || room.hostId !== userId) return;
      room.isLocked = data.isLocked;
      await prisma.meeting.update({
        where: { id: room.meetingId },
        data: { isLocked: data.isLocked }
      }).catch(err => console.error('[Meeting] Failed to persist isLocked:', err));
      io.to(`meeting:${room.meetingId}`).emit('meeting-locked-state', { isLocked: data.isLocked });
    });

    socket.on('host-mute-all', async (data: { meetingId: string; preventUnmute: boolean }) => {
      const room = findActiveRoom(data.meetingId);
      if (!room || room.hostId !== userId) return;
      room.preventUnmute = data.preventUnmute;
      socket.to(`meeting:${room.meetingId}`).emit('force-mute', { preventUnmute: data.preventUnmute });
    });

    socket.on('request-unmute', (data: { meetingId: string }) => {
      const room = findActiveRoom(data.meetingId);
      if (room && room.preventUnmute) {
         const pInfo = room.participants.get(userId);
         if (pInfo) {
           io.to(`user:${room.hostId}`).emit('participant-request-unmute', { userId, name: pInfo.name });
         }
      }
    });

    socket.on('approve-unmute', (data: { meetingId: string; targetUserId: string }) => {
      const room = findActiveRoom(data.meetingId);
      if (!room || room.hostId !== userId) return;
      io.to(`user:${data.targetUserId}`).emit('unmute-approved');
    });

    socket.on('host-remove', async (data: { meetingId: string; targetUserId: string }) => {
      const room = findActiveRoom(data.meetingId);
      if (!room || room.hostId !== userId) return;
      const canonicalId = room.meetingId;

      io.to(`user:${data.targetUserId}`).emit('force-remove', { message: 'You have been removed by the host.' });
      
      const pInfo = room.participants.get(data.targetUserId);
      if (pInfo) {
         room.participants.delete(data.targetUserId);
         io.to(`meeting:${canonicalId}`).emit('user-left', {
            userId: data.targetUserId,
            participants: Array.from(room.participants.entries()).map(([uid, info]) => ({ userId: uid, ...info }))
         });
      }

      await prisma.participant.updateMany({
        where: { meetingId: canonicalId, userId: data.targetUserId },
        data: { status: 'removed', leaveTime: new Date() }
      });
    });

    const handleLeave = async (meetingIdOrCode: string, uId: string) => {
      const room = findActiveRoom(meetingIdOrCode);
      if (!room) return;
      const canonicalId = room.meetingId;

      if (room.waitingParticipants.has(uId)) {
        room.waitingParticipants.delete(uId);
        return;
      }

      const pInfo = room.participants.get(uId);
      if (pInfo) {
        room.participants.delete(uId);
        
        const now = new Date();
        await prisma.participant.updateMany({
          where: { meetingId: canonicalId, userId: uId },
          data: { leaveTime: now }
        });

        io.to(`meeting:${canonicalId}`).emit('user-left', {
          userId: uId,
          participants: Array.from(room.participants.entries()).map(([id, info]) => ({ userId: id, ...info })),
        });

        if (room.participants.size === 0) {
          if (!room.idleTimeout) {
            room.idleTimeout = setTimeout(async () => {
               const activeRoom = activeRooms.get(canonicalId);
               if (activeRoom && activeRoom.participants.size === 0) {
                  const endNow = new Date();
                  const duration = activeRoom.actualStartTime ? Math.floor((endNow.getTime() - activeRoom.actualStartTime.getTime())/1000) : 0;
                  await prisma.meeting.update({
                    where: { id: canonicalId },
                    data: { status: 'ended', actualEndTime: endNow, endedAt: endNow, actualDurationSecs: duration }
                  });
                  activeRooms.delete(canonicalId);
               }
            }, 60000);
          }
        } else if (room.hostId === uId) {
          let earliestUser = '';
          let earliestTime = new Date(8640000000000000);
          for (const [id, info] of room.participants.entries()) {
             if (info.joinedAt < earliestTime) {
               earliestTime = info.joinedAt;
               earliestUser = id;
             }
          }
          if (earliestUser) {
             room.hostId = earliestUser;
             await prisma.meeting.update({ where: { id: canonicalId }, data: { hostId: earliestUser } });
             io.to(`meeting:${canonicalId}`).emit('host-transferred', { newHostId: earliestUser });
          }
        }
      }
    };

    socket.on('leave-room', (data: { meetingId: string }) => {
      const room = findActiveRoom(data.meetingId);
      const canonicalId = room ? room.meetingId : data.meetingId;
      socket.leave(`meeting:${canonicalId}`);
      if (room?.roomCode) socket.leave(`meeting:${room.roomCode}`);
      handleLeave(canonicalId, userId);
    });

    socket.on('disconnect', () => {
      for (const meetingId of activeRooms.keys()) {
         handleLeave(meetingId, userId);
      }
    });

    socket.on('behavioral-signal', (data: { meetingId: string; signal: any }) => {
      const room = findActiveRoom(data.meetingId);
      if (room && room.participants.has(userId)) {
        io.to(`meeting:${room.meetingId}`).emit('behavioral-update', { userId, signal: data.signal });
      }
    });

    socket.on('send-chat', (data: { meetingId: string; text: string; senderId?: string; senderName?: string }) => {
      const room = findActiveRoom(data.meetingId);
      if (room && room.participants.has(userId)) {
        socket.to(`meeting:${room.meetingId}`).emit('chat-message', {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          senderId: user.id,
          senderName: user.name,
          text: data.text,
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('live-transcript', async (data: { meetingId: string; text: string; isFinal: boolean; userName?: string; actualStartTime?: string }) => {
      const room = findActiveRoom(data.meetingId);
      if (room && room.participants.has(userId)) {
        io.to(`meeting:${room.meetingId}`).emit('live-transcript', {
          userId: user.id,
          userName: user.name,
          text: data.text,
          isFinal: data.isFinal,
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('draw-line', (data: { meetingId: string; x0: number; y0: number; x1: number; y1: number; color: string; lineWidth: number }) => {
      if (!data?.meetingId) return;
      const room = findActiveRoom(data.meetingId);
      const canonicalId = room ? room.meetingId : data.meetingId;
      if (!socket.rooms.has(`meeting:${canonicalId}`) && !socket.rooms.has(`meeting:${data.meetingId}`)) {
        return;
      }
      socket.to(`meeting:${canonicalId}`).emit('draw-line', data);
    });

    socket.on('draw-clear', (data: { meetingId: string }) => {
      if (!data?.meetingId) return;
      const room = findActiveRoom(data.meetingId);
      const canonicalId = room ? room.meetingId : data.meetingId;
      if (!socket.rooms.has(`meeting:${canonicalId}`) && !socket.rooms.has(`meeting:${data.meetingId}`)) {
        return;
      }
      socket.to(`meeting:${canonicalId}`).emit('draw-clear');
    });
  });
};

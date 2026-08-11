import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwtConfig';
import { prisma } from '../config/db';

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
  status: 'scheduled' | 'waiting' | 'active' | 'ended';
  actualStartTime: Date | null;
  waitingRoomEnabled: boolean;
  preventUnmute: boolean;
  isLocked: boolean;
  participants: Map<string, ParticipantInfo>;
  waitingParticipants: Map<string, ParticipantInfo>;
  idleTimeout: NodeJS.Timeout | null;
}

const activeRooms = new Map<string, MeetingRoom>();

export const setupMeetingHandler = (io: Server): void => {
  io.on('connection', (socket: Socket) => {
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

    socket.join(`user:${userId}`);

    socket.on('join-room', async (data: { meetingId: string; roomCode: string; username: string; name: string; avatarColor: string }) => {
      const { meetingId, roomCode, username, name, avatarColor } = data;
      
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

        if (meeting.status === 'ended' || meeting.status === 'cancelled') {
          socket.emit('join-error', { error: 'This meeting has ended.' });
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
              data: { status: 'accepted', joinTime }
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

      } catch (err) {
        console.error('[Meeting] Error in join-room:', err);
      }
    });

    socket.on('host-admit', (data: { meetingId: string; targetUserId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) return;

      const pInfo = room.waitingParticipants.get(data.targetUserId);
      if (pInfo) {
        room.waitingParticipants.delete(data.targetUserId);
        room.participants.set(data.targetUserId, pInfo);
        
        const wSocket = io.sockets.sockets.get(pInfo.socketId);
        if (wSocket) {
          wSocket.leave(`waiting:${data.meetingId}`);
          wSocket.join(`meeting:${data.meetingId}`);
          wSocket.emit('admitted', { actualStartTime: room.actualStartTime });
        }

        io.to(`meeting:${data.meetingId}`).emit('user-joined', {
          userId: data.targetUserId,
          ...pInfo,
          participants: Array.from(room.participants.entries()).map(([uid, info]) => ({ userId: uid, ...info })),
          actualStartTime: room.actualStartTime
        });
      }
    });

    socket.on('host-deny', (data: { meetingId: string; targetUserId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) return;

      const pInfo = room.waitingParticipants.get(data.targetUserId);
      if (pInfo) {
        room.waitingParticipants.delete(data.targetUserId);
        io.to(pInfo.socketId).emit('denied', { message: 'The host did not admit you to the meeting.' });
      }
    });

    socket.on('end-meeting-for-all', async (data: { meetingId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) return;

      const now = new Date();
      const durationSecs = room.actualStartTime ? Math.floor((now.getTime() - room.actualStartTime.getTime()) / 1000) : 0;

      await prisma.meeting.update({
        where: { id: data.meetingId },
        data: { status: 'ended', actualEndTime: now, endedAt: now, actualDurationSecs: durationSecs }
      });

      for (const [uid, pInfo] of room.participants.entries()) {
         await prisma.participant.updateMany({
           where: { meetingId: data.meetingId, userId: uid },
           data: { leaveTime: now }
         });
      }

      io.to(`meeting:${data.meetingId}`).emit('meeting-ended-by-host', { redirectAfter: 3000 });
      activeRooms.delete(data.meetingId);
    });

    socket.on('host-transfer', async (data: { meetingId: string; newHostId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) return;
      
      if (room.participants.has(data.newHostId)) {
        room.hostId = data.newHostId;
        await prisma.meeting.update({ where: { id: data.meetingId }, data: { hostId: data.newHostId } });
        io.to(`meeting:${data.meetingId}`).emit('host-transferred', { newHostId: data.newHostId });
      }
    });

    socket.on('host-spotlight', (data: { meetingId: string; targetUserId: string | null }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) return;
      io.to(`meeting:${data.meetingId}`).emit('spotlight-changed', { spotlightedUserId: data.targetUserId });
    });

    socket.on('host-lock-meeting', async (data: { meetingId: string; isLocked: boolean }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) return;
      room.isLocked = data.isLocked;
      io.to(`meeting:${data.meetingId}`).emit('meeting-locked-state', { isLocked: data.isLocked });
    });

    socket.on('host-mute-all', async (data: { meetingId: string; preventUnmute: boolean }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) return;
      room.preventUnmute = data.preventUnmute;
      socket.to(`meeting:${data.meetingId}`).emit('force-mute', { preventUnmute: data.preventUnmute });
    });

    socket.on('request-unmute', (data: { meetingId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (room && room.preventUnmute) {
         const pInfo = room.participants.get(userId);
         if (pInfo) {
           io.to(`user:${room.hostId}`).emit('participant-request-unmute', { userId, name: pInfo.name });
         }
      }
    });

    socket.on('approve-unmute', (data: { meetingId: string; targetUserId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) return;
      io.to(`user:${data.targetUserId}`).emit('unmute-approved');
    });

    socket.on('host-remove', async (data: { meetingId: string; targetUserId: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (!room || room.hostId !== userId) return;

      io.to(`user:${data.targetUserId}`).emit('force-remove', { message: 'You have been removed by the host.' });
      
      const pInfo = room.participants.get(data.targetUserId);
      if (pInfo) {
         room.participants.delete(data.targetUserId);
         io.to(`meeting:${data.meetingId}`).emit('user-left', {
            userId: data.targetUserId,
            participants: Array.from(room.participants.entries()).map(([uid, info]) => ({ userId: uid, ...info }))
         });
      }

      await prisma.participant.updateMany({
        where: { meetingId: data.meetingId, userId: data.targetUserId },
        data: { status: 'removed', leaveTime: new Date() }
      });
    });

    const handleLeave = async (meetingId: string, uId: string) => {
      const room = activeRooms.get(meetingId);
      if (!room) return;

      if (room.waitingParticipants.has(uId)) {
        room.waitingParticipants.delete(uId);
        return;
      }

      const pInfo = room.participants.get(uId);
      if (pInfo) {
        room.participants.delete(uId);
        
        const now = new Date();
        await prisma.participant.updateMany({
          where: { meetingId, userId: uId },
          data: { leaveTime: now }
        });

        io.to(`meeting:${meetingId}`).emit('user-left', {
          userId: uId,
          participants: Array.from(room.participants.entries()).map(([id, info]) => ({ userId: id, ...info })),
        });

        if (room.participants.size === 0) {
          if (!room.idleTimeout) {
            room.idleTimeout = setTimeout(async () => {
               const activeRoom = activeRooms.get(meetingId);
               if (activeRoom && activeRoom.participants.size === 0) {
                  const endNow = new Date();
                  const duration = activeRoom.actualStartTime ? Math.floor((endNow.getTime() - activeRoom.actualStartTime.getTime())/1000) : 0;
                  await prisma.meeting.update({
                    where: { id: meetingId },
                    data: { status: 'ended', actualEndTime: endNow, endedAt: endNow, actualDurationSecs: duration }
                  });
                  activeRooms.delete(meetingId);
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
             await prisma.meeting.update({ where: { id: meetingId }, data: { hostId: earliestUser } });
             io.to(`meeting:${meetingId}`).emit('host-transferred', { newHostId: earliestUser });
          }
        }
      }
    };

    socket.on('leave-room', (data: { meetingId: string }) => {
      socket.leave(`meeting:${data.meetingId}`);
      handleLeave(data.meetingId, userId);
    });

    socket.on('disconnect', () => {
      for (const meetingId of activeRooms.keys()) {
         handleLeave(meetingId, userId);
      }
    });

    socket.on('behavioral-signal', (data: { meetingId: string; signal: any }) => {
      const room = activeRooms.get(data.meetingId);
      if (room && room.participants.has(userId)) {
        io.to(`meeting:${data.meetingId}`).emit('behavioral-update', { userId, signal: data.signal });
      }
    });

    socket.on('send-chat', (data: { meetingId: string; text: string; senderId: string; senderName: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (room && room.participants.has(userId)) {
        socket.to(`meeting:${data.meetingId}`).emit('chat-message', {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          senderId: data.senderId, senderName: data.senderName, text: data.text, timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('live-transcript', async (data: { meetingId: string; text: string; isFinal: boolean; userName: string; actualStartTime?: string }) => {
      const room = activeRooms.get(data.meetingId);
      if (room && room.participants.has(userId)) {
        io.to(`meeting:${data.meetingId}`).emit('live-transcript', {
          userId, userName: data.userName, text: data.text, isFinal: data.isFinal, timestamp: new Date().toISOString()
        });
        
        // Note: Transcript saving is offloaded to Analysis API via Redpanda and TimescaleDB
      }
    });
  });
};

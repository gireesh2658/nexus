import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';

const TEST_SECRET = 'nexus_test_jwt_secret_at_least_64_characters_long_for_security_testing_purpose';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = TEST_SECRET;
process.env.LIVEKIT_API_KEY = 'test_livekit_key';
process.env.LIVEKIT_API_SECRET = 'test_livekit_secret_at_least_32_characters_long';
process.env.INTERNAL_API_TOKEN = 'test_internal_token';
process.env.DISABLE_RATE_LIMIT = 'true';

// Mock database and redis before importing app/server
vi.mock('../src/config/db', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
      meeting: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      participant: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      meetingSummary: {
        findUnique: vi.fn(),
      },
      transcription: {
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
    },
    default: vi.fn(),
  };
});

vi.mock('../src/config/redis', () => ({
  redis1: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    call: vi.fn().mockResolvedValue(1),
  },
  isRedisAvailable: vi.fn().mockReturnValue(true),
}));

vi.mock('../src/services/mailer', () => ({
  initMailer: vi.fn(),
  sendMeetingInvite: vi.fn(),
  sendMeetingSummaryEmail: vi.fn(),
}));

vi.mock('../src/services/meetingLifecycle', () => ({
  startLifecycleWorker: vi.fn(),
  isMeetingExpired: vi.fn().mockReturnValue(false),
}));

import { app } from '../src/server';
import { prisma } from '../src/config/db';
import { setupMeetingHandler } from '../src/sockets/meetingHandler';
import { jwtConfig } from '../src/config/jwtConfig';

function createToken(userId: string, typ: 'access' | 'refresh' = 'access') {
  return jwt.sign(
    { userId, jti: `jti-${userId}-${Date.now()}`, typ },
    jwtConfig.privateKey,
    { algorithm: jwtConfig.algorithm, expiresIn: typ === 'access' ? '15m' : '7d' }
  );
}

describe('P0 Security & Authorization Regression Suite', () => {
  const hostUser = { id: 'host-1', name: 'Host User', username: 'host', role: 'participant', isActive: true };
  const participantUser = { id: 'part-1', name: 'Participant User', username: 'part', role: 'participant', isActive: true };
  const strangerUser = { id: 'stranger-1', name: 'Stranger User', username: 'stranger', role: 'participant', isActive: true };
  const removedUser = { id: 'removed-1', name: 'Removed User', username: 'removed', role: 'participant', isActive: true };

  const meetingActive = {
    id: '11111111-1111-1111-1111-111111111111',
    roomCode: 'ROOM100',
    title: 'Active Standup',
    hostId: hostUser.id,
    status: 'active',
    isLocked: false,
    scheduledDurationMins: 30,
  };

  const meetingLocked = {
    id: '22222222-2222-2222-2222-222222222222',
    roomCode: 'LOCKED100',
    title: 'Locked Meeting',
    hostId: hostUser.id,
    status: 'active',
    isLocked: true,
    scheduledDurationMins: 30,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (prisma.user.findUnique as any).mockImplementation(({ where }: any) => {
      if (where.id === hostUser.id) return Promise.resolve(hostUser);
      if (where.id === participantUser.id) return Promise.resolve(participantUser);
      if (where.id === strangerUser.id) return Promise.resolve(strangerUser);
      if (where.id === removedUser.id) return Promise.resolve(removedUser);
      return Promise.resolve(null);
    });
  });

  // 1. stranger gets 403 on summary, consent and token
  it('1. stranger gets 403 on summary, consent and token', async () => {
    (prisma.meeting.findFirst as any).mockResolvedValue(meetingActive);
    (prisma.participant.findFirst as any).mockResolvedValue(null);

    const strangerToken = createToken(strangerUser.id, 'access');

    // Summary
    const summaryRes = await request(app)
      .get(`/api/meetings/${meetingActive.id}/summary`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(summaryRes.status).toBe(403);

    // Consent
    const consentRes = await request(app)
      .post(`/api/meetings/${meetingActive.id}/consent`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(consentRes.status).toBe(403);

    // Token
    const tokenRes = await request(app)
      .get(`/api/meetings/room/${meetingActive.roomCode}/token`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(tokenRes.status).toBe(403);
  });

  // 2. participant gets 200 on summary
  it('2. participant gets 200 on summary', async () => {
    (prisma.meeting.findFirst as any).mockResolvedValue(meetingActive);
    (prisma.participant.findFirst as any).mockResolvedValue({
      id: 'p-1',
      meetingId: meetingActive.id,
      userId: participantUser.id,
      status: 'accepted',
    });
    (prisma.meetingSummary.findUnique as any).mockResolvedValue({
      id: 'sum-1',
      meetingId: meetingActive.id,
      status: 'COMPLETED',
      summaryText: 'Sprint goals met',
      decisions: ['Deploy to staging'],
      actionItems: [],
    });
    (prisma.transcription.findMany as any).mockResolvedValue([]);

    const partToken = createToken(participantUser.id, 'access');

    const res = await request(app)
      .get(`/api/meetings/${meetingActive.id}/summary`)
      .set('Authorization', `Bearer ${partToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.summaryText).toBe('Sprint goals met');
  });

  // 3. refresh token used as Bearer gets 401 (HTTP and socket handshake)
  it('3. refresh token used as Bearer gets 401 (HTTP and socket handshake)', async () => {
    const refreshToken = createToken(participantUser.id, 'refresh');

    // HTTP rejection
    const httpRes = await request(app)
      .get('/api/meetings')
      .set('Authorization', `Bearer ${refreshToken}`);

    expect(httpRes.status).toBe(401);
    expect(httpRes.body.error).toContain('Access token required');

    // Socket handshake rejection
    const testServer = http.createServer();
    const testIo = new SocketIOServer(testServer, { transports: ['websocket'] });
    setupMeetingHandler(testIo);

    await new Promise<void>((resolve) => testServer.listen(0, resolve));
    const port = (testServer.address() as any).port;

    const clientSocket: ClientSocketType = ClientSocket(`http://localhost:${port}`, {
      auth: { token: refreshToken },
      transports: ['websocket'],
      reconnection: false,
    });

    const errorReceived = await new Promise<boolean>((resolve) => {
      clientSocket.on('connect_error', (err) => {
        expect(err.message).toContain('Access token required');
        resolve(true);
      });
      clientSocket.on('auth-error', (data) => {
        expect(data.error).toContain('Access token required');
        resolve(true);
      });
      clientSocket.on('connect', () => {
        resolve(false);
      });
    });

    clientSocket.disconnect();
    testIo.close();
    testServer.close();

    expect(errorReceived).toBe(true);
  });

  // 4. removed user cannot get a token and cannot rejoin via join-room
  it('4. removed user cannot get a token and cannot rejoin via join-room', async () => {
    (prisma.meeting.findFirst as any).mockResolvedValue(meetingActive);
    (prisma.participant.findFirst as any).mockResolvedValue({
      id: 'p-removed',
      meetingId: meetingActive.id,
      userId: removedUser.id,
      status: 'removed',
    });

    const removedToken = createToken(removedUser.id, 'access');

    // Token rejection
    const tokenRes = await request(app)
      .get(`/api/meetings/room/${meetingActive.roomCode}/token`)
      .set('Authorization', `Bearer ${removedToken}`);
    expect(tokenRes.status).toBe(403);

    // Socket join-room rejection
    const testServer = http.createServer();
    const testIo = new SocketIOServer(testServer, { transports: ['websocket'] });
    setupMeetingHandler(testIo);

    await new Promise<void>((resolve) => testServer.listen(0, resolve));
    const port = (testServer.address() as any).port;

    const clientSocket: ClientSocketType = ClientSocket(`http://localhost:${port}`, {
      auth: { token: removedToken },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
    });

    const joinErrorPromise = new Promise<string>((resolve) => {
      clientSocket.on('join-error', (data: { error: string }) => {
        resolve(data.error);
      });
    });

    clientSocket.emit('join-room', { meetingId: meetingActive.id, roomCode: meetingActive.roomCode });
    const errorMsg = await joinErrorPromise;

    clientSocket.disconnect();
    testIo.close();
    testServer.close();

    expect(errorMsg).toContain('not authorized to join this meeting');
  });

  // 5. locked meeting rejects a non-host and allows host
  it('5. locked meeting rejects a non-host and allows host', async () => {
    (prisma.meeting.findFirst as any).mockResolvedValue(meetingLocked);

    // Non-host participant exists but meeting is locked
    (prisma.participant.findFirst as any).mockResolvedValue({
      id: 'p-part',
      meetingId: meetingLocked.id,
      userId: participantUser.id,
      status: 'accepted',
    });

    const nonHostToken = createToken(participantUser.id, 'access');
    const hostToken = createToken(hostUser.id, 'access');

    // Non-host token request -> 403
    const nonHostRes = await request(app)
      .get(`/api/meetings/room/${meetingLocked.roomCode}/token`)
      .set('Authorization', `Bearer ${nonHostToken}`);
    expect(nonHostRes.status).toBe(403);
    expect(nonHostRes.body.error).toContain('locked');

    // Host token request -> 200
    const hostRes = await request(app)
      .get(`/api/meetings/room/${meetingLocked.roomCode}/token`)
      .set('Authorization', `Bearer ${hostToken}`);
    expect(hostRes.status).toBe(200);
    expect(hostRes.body.token).toBeDefined();
    expect(hostRes.body.isHost).toBe(true);
  });

  // 6. giveConsent by a non-participant creates no Participant row
  it('6. giveConsent by a non-participant creates no Participant row', async () => {
    (prisma.meeting.findFirst as any).mockResolvedValue(meetingActive);
    (prisma.participant.findFirst as any).mockResolvedValue(null);

    const nonPartToken = createToken(strangerUser.id, 'access');

    const res = await request(app)
      .post(`/api/meetings/${meetingActive.id}/consent`)
      .set('Authorization', `Bearer ${nonPartToken}`);

    expect(res.status).toBe(403);
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });
});

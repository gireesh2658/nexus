import { prisma } from '../config/db';

export type MeetingStatus = 'scheduled' | 'waiting' | 'active' | 'ended' | 'cancelled' | 'expired';

export const VALID_STATUSES: MeetingStatus[] = ['scheduled', 'waiting', 'active', 'ended', 'cancelled', 'expired'];
export const TERMINAL_STATUSES: MeetingStatus[] = ['ended', 'cancelled', 'expired'];

/**
 * Evaluates whether a meeting's scheduled window has elapsed.
 * A meeting expires if it is in pre-start state ('waiting' or 'scheduled')
 * and the current time is past (scheduledAt + durationMins + 15min grace buffer).
 */
export const isMeetingExpired = (meeting: {
  status: string;
  scheduledAt?: Date | string | null;
  scheduledDurationMins?: number | null;
}): boolean => {
  if (meeting.status === 'expired') return true;
  if (meeting.status === 'ended' || meeting.status === 'cancelled') return false;

  if (meeting.status === 'waiting' || meeting.status === 'scheduled') {
    if (!meeting.scheduledAt) return false;
    const scheduledTime = new Date(meeting.scheduledAt).getTime();
    const durationMs = (meeting.scheduledDurationMins || 60) * 60 * 1000;
    // 15-minute grace buffer after scheduled end
    const expiryThreshold = scheduledTime + durationMs + 15 * 60 * 1000;
    return Date.now() > expiryThreshold;
  }

  return false;
};

/**
 * Validates allowed state transitions.
 * Terminal states ('ended', 'cancelled', 'expired') can NEVER be resurrected.
 */
export const isValidStatusTransition = (currentStatus: string, nextStatus: string): boolean => {
  if (currentStatus === nextStatus) return true;

  if (TERMINAL_STATUSES.includes(currentStatus as MeetingStatus)) {
    return false;
  }

  switch (currentStatus) {
    case 'scheduled':
    case 'waiting':
      return ['waiting', 'active', 'ended', 'cancelled', 'expired'].includes(nextStatus);
    case 'active':
      return ['ended'].includes(nextStatus);
    default:
      return false;
  }
};

/**
 * Idempotently sweeps all pre-start meetings past their scheduled window and updates them to 'expired'.
 * Returns the count of expired meetings.
 */
export const expireStaleMeetings = async (): Promise<number> => {
  try {
    const candidates = await prisma.meeting.findMany({
      where: {
        status: { in: ['waiting', 'scheduled'] },
        scheduledAt: { not: null },
      },
      select: {
        id: true,
        scheduledAt: true,
        scheduledDurationMins: true,
        status: true,
      },
    });

    const expiredIds: string[] = [];
    for (const m of candidates) {
      if (isMeetingExpired(m)) {
        expiredIds.push(m.id);
      }
    }

    if (expiredIds.length > 0) {
      const result = await prisma.meeting.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'expired' },
      });
      return result.count;
    }

    return 0;
  } catch (err: any) {
    console.error('[MeetingLifecycle] Expiration sweep warning:', err.message);
    return 0;
  }
};

/**
 * Periodic background task that marks stale meetings as expired.
 */
let sweepTimer: NodeJS.Timeout | null = null;

export const startLifecycleWorker = (intervalMs = 60000): void => {
  if (sweepTimer) return;
  // Run an immediate sweep on boot
  expireStaleMeetings().catch(() => {});

  sweepTimer = setInterval(() => {
    expireStaleMeetings().catch(() => {});
  }, intervalMs);

  // Unref so the worker doesn't keep node alive during graceful shutdown
  if (sweepTimer.unref) {
    sweepTimer.unref();
  }
};

export const stopLifecycleWorker = (): void => {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
};

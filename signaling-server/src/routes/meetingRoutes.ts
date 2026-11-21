import { Router } from 'express';
import {
  createMeeting,
  getMyMeetings,
  getMeetingById,
  getMeetingByRoomCode,
  updateMeetingStatus,
  respondToInvite,
  giveConsent,
  generateLiveKitToken,
  endMeeting,
  getMeetingSummary,
  cancelMeeting
} from '../controllers/meetingController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

router.post('/', createMeeting);
router.get('/', getMyMeetings);
router.get('/:id', getMeetingById);
router.get('/room/:roomCode', getMeetingByRoomCode);
router.get('/room/:roomCode/token', generateLiveKitToken);
router.patch('/:id/status', updateMeetingStatus);
router.post('/:id/respond', respondToInvite);
router.post('/:id/consent', giveConsent);
router.post('/:id/end', endMeeting);
router.post('/:id/cancel', cancelMeeting);
router.get('/:id/summary', getMeetingSummary);

export default router;

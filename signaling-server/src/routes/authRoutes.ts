import { Router } from 'express';
import { register, login, logout, refresh, getMe, updateProfile, searchUsers } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authMiddleware, logout);

// Protected routes
router.get('/me', authMiddleware, getMe);
router.put('/profile', authMiddleware, updateProfile);
router.patch('/profile', authMiddleware, updateProfile);
router.get('/search', authMiddleware, searchUsers);

export default router;

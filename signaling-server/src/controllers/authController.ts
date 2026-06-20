import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { AuthRequest } from '../middleware/authMiddleware';
import User from '../models/User';
import { jwtConfig } from '../config/jwtConfig';
import { redis1 } from '../config/redis';

const generateAccessToken = (userId: string, jti: string): string => {
  return jwt.sign({ userId, jti }, jwtConfig.privateKey, { expiresIn: '24h', algorithm: jwtConfig.algorithm });
};

const generateRefreshTokenPayload = (userId: string, jti: string): string => {
  return jwt.sign({ userId, jti }, jwtConfig.privateKey, { expiresIn: '7d', algorithm: jwtConfig.algorithm });
};

export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, username, email, password, role } = req.body;

    if (!name || typeof name !== 'string' || !username || typeof username !== 'string' || !email || typeof email !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ error: 'All fields are required and must be valid strings' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      res.status(400).json({ error: 'Username must be 3-30 characters, lowercase letters, numbers, and underscores only' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] });
    if (existingUser) {
      const field = existingUser.email === email.toLowerCase() ? 'email' : 'username';
      res.status(409).json({ error: `User with this ${field} already exists` });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const avatarColors = ['#6C5CE7', '#A855F7', '#00D2FF', '#3A7BD5', '#00E676', '#FFD600', '#FF5252', '#1A56DB', '#8B5CF6', '#EC4899'];
    const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    const user = await User.create({
      name,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role === 'host' ? 'host' : 'participant',
      avatarColor,
    });

    const jti = randomBytes(16).toString('hex');
    const refreshJti = randomBytes(16).toString('hex');
    const token = generateAccessToken(user._id.toString(), jti);
    const refreshToken = generateRefreshTokenPayload(user._id.toString(), refreshJti);

    await redis1.set(`rt_family:${user._id}`, JSON.stringify({ current: refreshToken, used: [] }), 'EX', 7 * 24 * 60 * 60);

    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('jwt', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });

    res.status(201).json({
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        avatarColor: user.avatarColor,
      },
      token
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required and must be valid strings' });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Account deactivated. Contact admin.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    user.lastSeen = new Date();
    await user.save();

    const jti = randomBytes(16).toString('hex');
    const refreshJti = randomBytes(16).toString('hex');
    const token = generateAccessToken(user._id.toString(), jti);
    const refreshToken = generateRefreshTokenPayload(user._id.toString(), refreshJti);

    await redis1.set(`rt_family:${user._id}`, JSON.stringify({ current: refreshToken, used: [] }), 'EX', 7 * 24 * 60 * 60);

    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('jwt', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });

    res.json({
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        avatarColor: user.avatarColor,
      },
      token
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Login failed' });
  }
};

export const refresh = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) {
      res.status(401).json({ error: 'No refresh token' });
      return;
    }

    const payload = jwt.verify(token, jwtConfig.publicKey, { algorithms: [jwtConfig.algorithm] }) as { userId: string, jti?: string };
    const familyData = await redis1.get(`rt_family:${payload.userId}`);
    
    if (!familyData) {
      res.status(401).json({ error: 'Token expired or revoked' });
      return;
    }

    const f = JSON.parse(familyData);

    if (f.used.includes(token)) {
      // Reuse attack detected!
      await redis1.del(`rt_family:${payload.userId}`);
      res.status(401).json({ error: 'Refresh token reuse detected. Re-login required.' });
      return;
    }

    if (f.current !== token) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const refreshJti = randomBytes(16).toString('hex');
    const newRefresh = generateRefreshTokenPayload(payload.userId, refreshJti);
    f.used.push(token);
    if (f.used.length > 5) f.used.shift();
    f.current = newRefresh;

    await redis1.set(`rt_family:${payload.userId}`, JSON.stringify(f), 'EX', 7 * 24 * 60 * 60);

    const jti = randomBytes(16).toString('hex');
    const newAccess = generateAccessToken(payload.userId, jti);

    res.cookie('refreshToken', newRefresh, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('jwt', newAccess, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });

    res.json({ token: newAccess });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.cookies.jwt;
    if (token) {
      const decoded = jwt.decode(token) as { jti?: string, exp?: number };
      if (decoded && decoded.jti && decoded.exp) {
        const remainingTime = decoded.exp - Math.floor(Date.now() / 1000);
        if (remainingTime > 0) {
          await redis1.set(`bl_${decoded.jti}`, '1', 'EX', remainingTime);
        }
      }
    }
    
    if (req.user) {
      await redis1.del(`rt_family:${req.user._id}`);
    }

    res.clearCookie('jwt');
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    res.json({
      user: {
        _id: req.user._id,
        name: req.user.name,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        avatarColor: req.user.avatarColor,
        createdAt: req.user.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get user profile' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { name, avatarColor, aiPreferences } = req.body;
    const updates: any = {};
    if (name) updates.name = name;
    if (avatarColor) updates.avatarColor = avatarColor;
    if (aiPreferences) updates.aiPreferences = aiPreferences;

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');

    res.json({ user });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const searchUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }

    // Sanitize regex special characters to prevent ReDoS
    const sanitized = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const users = await User.find({
      $and: [
        { _id: { $ne: req.user?._id } },
        { isActive: true },
        {
          $or: [
            { username: { $regex: sanitized, $options: 'i' } },
            { name: { $regex: sanitized, $options: 'i' } },
          ],
        },
      ],
    })
      .select('name username avatarColor role')
      .limit(20);

    res.json({ users });
  } catch (error: any) {
    res.status(500).json({ error: 'Search failed' });
  }
};

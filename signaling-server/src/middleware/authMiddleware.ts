import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwtConfig';
import { prisma } from '../config/db';
import { redis1 } from '../config/redis';

export interface AuthRequest extends Request {
  user?: any;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token = req.cookies?.jwt;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({ error: 'Access denied. No token provided.' });
      return;
    }

    const decoded = jwt.verify(token, jwtConfig.publicKey, {
      algorithms: [jwtConfig.algorithm],
    }) as { userId: string; jti?: string };

    if (decoded.jti) {
      const blacklisted = await redis1.get(`bl_${decoded.jti}`);
      if (blacklisted) {
        res.status(401).json({ error: 'Token has been revoked.' });
        return;
      }
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      res.status(401).json({ error: 'Invalid token. User not found.' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Account deactivated. Contact admin.' });
      return;
    }

    const { password, ...userWithoutPassword } = user;
    req.user = userWithoutPassword;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired. Please login again.' });
      return;
    }
    res.status(401).json({ error: 'Invalid token.' });
  }
};

import { Request, Response, NextFunction } from 'express';

export const errorMiddleware = (err: Error, req: Request, res: Response, _next: NextFunction): void => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  
  if (err.name === 'ValidationError') {
    res.status(400).json({ error: 'Validation failed', details: err.message });
    return;
  }

  if (err.name === 'CastError') {
    res.status(400).json({ error: 'Invalid ID format' });
    return;
  }

  if ((err as any).code === 11000) {
    const field = Object.keys((err as any).keyValue || {})[0] || 'field';
    res.status(409).json({ error: `Duplicate value for ${field}` });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
};

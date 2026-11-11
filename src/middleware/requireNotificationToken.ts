import { RequestHandler } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import config from '../configs/config';

export const requireNotificationToken: RequestHandler = (req, res, next) => {
  const secret = config.releaseNotificationToken;
  if (!secret) {
    res.status(503).json({ message: 'Release notifications are not configured' });
    return;
  }
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(hash(req.get('authorization') ?? ''), hash(`Bearer ${secret}`))) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  next();
};

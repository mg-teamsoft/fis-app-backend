import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/User';
import { JwtUtil } from '../utils/jwtUtil';

export const requireVerifiedEmail = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = await JwtUtil.extractUser(req);

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = await UserModel.findOne({ userId }).lean();

  if (!user || !user.emailVerified) {
    return res.status(403).json({
      message: 'Email address must be verified to use this feature.',
    });
  }

  next();
};

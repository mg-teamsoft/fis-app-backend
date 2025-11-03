import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { UserModel } from '../models/User';
import { hashPassword } from '../utils/password';
import { JwtUtil } from '../utils/jwtUtil';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
const safeProjection =
  '-passwordHash -verificationToken -verificationTokenExpires -passwordResetToken -passwordResetExpires -__v';

export async function listUsers(_req: Request, res: Response) {
  try {
    const users = await UserModel.find().select(safeProjection).sort({ createdAt: -1 }).lean();
    return res.json(users);
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to list users.', error: error?.message });
  }
}

export async function getUser(req: Request, res: Response) {
  try {
    const { userId: userId } = await JwtUtil.extractUser(req);
    const user = await UserModel.findOne({ userId: userId }).select(safeProjection).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.json(user);
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to fetch user.', error: error?.message });
  }
}

export async function createUser(req: Request, res: Response) {
  try {
    let { userId, userName, email, password, emailVerified } = req.body || {};

    if (!userName || !email || !password) {
      return res.status(400).json({ message: 'userName, email and password are required.' });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters, contain at least (1 uppercase & 1 lowercase & 1 number & 1 special) char.',
      });
    }

    if (!userId) {
      userId = uuidv4();
    }

    const passwordHash = await hashPassword(password);

    const user = await UserModel.create({
      userId,
      userName,
      email,
      passwordHash,
      emailVerified: typeof emailVerified === 'boolean' ? emailVerified : false,
    });

    res.locals.auditPayload = { userId: user.userId, email: user.email };
    res.locals.auditMessage = 'User created';

    const createdUser = await UserModel.findById(user._id).select(safeProjection).lean();
    return res.status(201).json(createdUser);
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'User with the same userId, userName, or email already exists.' });
    }
    return res.status(500).json({ message: 'Failed to create user.', error: error?.message });
  }
}

export async function updateUser(req: Request, res: Response) {
  try {
    const { userId: userId } = await JwtUtil.extractUser(req);
    const { userName, email, password, emailVerified } = req.body || {};

    const updates: Record<string, unknown> = {};

    if (typeof userName !== 'undefined') updates.userName = userName;
    if (typeof email !== 'undefined') updates.email = email;
    if (typeof emailVerified !== 'undefined') updates.emailVerified = emailVerified;

    if (typeof password !== 'undefined') {
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          message:
            'Password must be at least 8 characters, contain at least (1 uppercase & 1 lowercase & 1 number & 1 special) char.',
        });
      }
      updates.passwordHash = await hashPassword(password);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No fields provided for update.' });
    }

    const user = await UserModel.findOneAndUpdate({ userId }, updates, {
      new: true,
      runValidators: true,
      context: 'query',
      select: safeProjection,
    }).lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.locals.auditPayload = { userId: user.userId, email: user.email };
    res.locals.auditMessage = 'User updated';

    return res.json(user);
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'User with the same userName or email already exists.' });
    }
    return res.status(500).json({ message: 'Failed to update user.', error: error?.message });
  }
}

export async function deleteUser(req: Request, res: Response) {
  try {
    const { userId: userId } = await JwtUtil.extractUser(req);
    const user = await UserModel.findOneAndDelete({ userId: userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.locals.auditPayload = { userId: user.userId, email: user.email };
    res.locals.auditMessage = 'User deleted';

    return res.status(200).json({ message: 'User deleted successfully.' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to delete user.', error: error?.message });
  }
}

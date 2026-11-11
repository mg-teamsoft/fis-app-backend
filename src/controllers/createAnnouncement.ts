import { Request, Response } from 'express';
import { NotificationModel, NOTIFICATION_CATEGORIES } from '../models/NotificationModel';
import { nextNotificationMonth } from '../utils/notificationDates';

export async function createAnnouncement(req: Request, res: Response) {
  const { notificationId, category, title, subtitle, content, version, userId, startDate, endDate, actionType, screen } = req.body ?? {};
  if (![notificationId, title, subtitle, content].every(value => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ message: 'notificationId, title, subtitle and content are required strings' });
  }
  if (!NOTIFICATION_CATEGORIES.includes(category)) {
    return res.status(400).json({ message: 'category must be campaign, version, news or contactNotes' });
  }
  for (const [key, value] of Object.entries({ userId, version, actionType, screen })) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
      return res.status(400).json({ message: `${key} must be a nonempty string when provided` });
    }
  }
  const start = startDate === undefined ? new Date() : new Date(typeof startDate === 'string' ? startDate : NaN);
  const end = endDate === undefined ? nextNotificationMonth(start) : new Date(typeof endDate === 'string' ? endDate : NaN);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return res.status(400).json({ message: 'Valid dates with endDate > startDate are required' });
  }
  const id = notificationId.trim();
  try {
    const now = new Date();
    const result = await NotificationModel.updateOne({ notificationId: id }, {
      $setOnInsert: {
        notificationId: id, category, title: title.trim(), subtitle: subtitle.trim(), content: content.trim(),
        userId: userId === undefined ? null : userId.trim(),
        ...(version === undefined ? {} : { version: version.trim() }),
        ...(actionType === undefined ? {} : { actionType: actionType.trim() }),
        ...(screen === undefined ? {} : { screen: screen.trim() }),
        startDate: start, endDate: end, isUnread: true, time: start.toISOString(),
        createdAt: now, updatedAt: now,
      },
    }, { upsert: true, setDefaultsOnInsert: false, timestamps: false, runValidators: true });
    return res.status(result.upsertedCount ? 201 : 200).json({ notificationId: id, created: Boolean(result.upsertedCount) });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(200).json({ notificationId: id, created: false });
    return res.status(500).json({ message: 'Failed to create notification' });
  }
}

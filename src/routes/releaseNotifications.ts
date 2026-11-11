import { Router } from 'express';
import { requireNotificationToken } from '../middleware/requireNotificationToken';
import { NotificationModel } from '../models/NotificationModel';
import { nextNotificationMonth } from '../utils/notificationDates';

const router = Router();
router.post('/', requireNotificationToken, async (req, res) => {
  const { version, title, subtitle, content, startDate, endDate, userId } = req.body ?? {};
  // Announce X.Y.0 feature releases, including X.0.0; skip patch releases.
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.0$/.test(version)) {
    return res.status(400).json({ message: 'version must be X.Y.0 (patch releases are not announced)' });
  }
  if (![title, subtitle, content].every(value => typeof value === 'string' && value.trim().length > 0)) {
    return res.status(400).json({ message: 'title, subtitle and content are required strings' });
  }
  if (userId !== undefined && (typeof userId !== 'string' || !userId.trim())) {
    return res.status(400).json({ message: 'userId must be a nonempty string when provided' });
  }
  const targetUserId = userId === undefined ? null : userId.trim();
  const start = startDate === undefined ? new Date() : new Date(typeof startDate === 'string' ? startDate : NaN);
  const end = endDate === undefined ? nextNotificationMonth(start) : new Date(typeof endDate === 'string' ? endDate : NaN);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return res.status(400).json({ message: 'Valid dates with endDate > startDate are required' });
  }
  const notificationId = targetUserId
    ? `release-${version}-user-${targetUserId}`
    : `release-${version}`;
  try {
    const result = await NotificationModel.updateOne({ notificationId }, {
      $setOnInsert: {
        notificationId, userId: targetUserId, title, subtitle, content,
        version, category: 'version',
        createdAt: new Date(), updatedAt: new Date(),
        startDate: start, endDate: end, isUnread: true, time: start.toISOString(),
      },
    }, { upsert: true, setDefaultsOnInsert: false, timestamps: false });
    // Existing announcements and read states are preserved on retries.
    return res.status(result.upsertedCount ? 201 : 200).json({ notificationId, created: Boolean(result.upsertedCount) });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(200).json({ notificationId, created: false });
    return res.status(500).json({ message: 'Failed to create release notification' });
  }
});
export default router;

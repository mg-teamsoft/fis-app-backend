import { describe, expect, it } from '@jest/globals';
import { nextNotificationMonth, notificationVisibility } from './notificationDates';
import { NotificationModel } from '../models/NotificationModel';

describe('notification dates', () => {
  it('defaults start to now and end to one calendar month later', () => {
    const doc = new NotificationModel({ notificationId: 'test', title: 'title', subtitle: 'sub', time: 'now' });
    expect(doc.startDate).toBeInstanceOf(Date);
    expect(doc.endDate).toEqual(nextNotificationMonth(doc.startDate));
  });
  it('clamps month ends and retains UTC time', () => {
    expect(nextNotificationMonth(new Date('2028-01-31T12:30:00Z')).toISOString()).toBe('2028-02-29T12:30:00.000Z');
  });
  it('rejects an end before the start', () => {
    const doc = new NotificationModel({ notificationId: 'test', title: 'title', subtitle: 'sub', time: 'now', startDate: new Date('2026-11-10'), endDate: new Date('2026-11-09') });
    expect(doc.validateSync()?.errors.endDate).toBeDefined();
  });
  it('requires an active date window and excludes broadcasts predating registration', () => {
    const now = new Date();
    const registeredAt = new Date('2026-11-01');
    expect(notificationVisibility('user', registeredAt, now)).toEqual({ $and: [
      { $or: [{ userId: 'user' }, { userId: null }] },
      { startDate: { $lte: now }, endDate: { $gt: now } },
      { $or: [{ userId: 'user' }, { createdAt: { $gte: registeredAt } }] },
    ] });
  });
});

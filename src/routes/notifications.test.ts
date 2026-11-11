import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
jest.mock('../configs/config', () => ({ __esModule: true, default: { releaseNotificationToken: 'test-secret' } }));
jest.mock('../controllers/notificationController', () => ({ listNotifications: jest.fn(), insertReadNotifications: jest.fn(), createExcelUpdateNotification: jest.fn() }));
jest.mock('../middleware/authJwt', () => ({ requireAuth: () => (_req: any, res: any) => res.status(401).json({ message: 'JWT required' }) }));
jest.mock('../middleware/auditInterceptor', () => ({ auditInterceptor: () => (_req: any, _res: any, next: any) => next() }));
jest.mock('../models/NotificationModel', () => ({
  NOTIFICATION_CATEGORIES: ['campaign', 'version', 'news', 'contactNotes'],
  NotificationModel: { updateOne: jest.fn() },
}));
import router from './notifications';
import { NotificationModel } from '../models/NotificationModel';
const app = express().use(express.json()).use('/notifications', router);
const payload = { notificationId: 'news-test', category: 'news', title: 'Title', subtitle: 'Sub', content: 'Content' };
beforeEach(() => { jest.clearAllMocks(); });
describe('general notification creation', () => {
  it('requires the service token', async () => {
    expect((await request(app).post('/notifications').send(payload)).status).toBe(401);
    expect(NotificationModel.updateOne).not.toHaveBeenCalled();
  });
  it('keeps existing user endpoints behind JWT authentication', async () => {
    expect((await request(app).get('/notifications').set('Authorization', 'Bearer test-secret')).status).toBe(401);
    expect((await request(app).post('/notifications/read').set('Authorization', 'Bearer test-secret')).status).toBe(401);
  });
  it.each(['campaign', 'version', 'news', 'contactNotes'])('creates %s with date defaults', async category => {
    jest.mocked(NotificationModel.updateOne).mockResolvedValueOnce({ upsertedCount: 1 });
    const response = await request(app).post('/notifications').set('Authorization', 'Bearer test-secret').send({ ...payload, category });
    expect(response.status).toBe(201);
    expect(NotificationModel.updateOne).toHaveBeenCalledWith({ notificationId: 'news-test' }, { $setOnInsert: expect.objectContaining({ category, userId: null, startDate: expect.any(Date), endDate: expect.any(Date) }) }, expect.objectContaining({ upsert: true }));
  });
  it('accepts user targeting and optional metadata and preserves existing records', async () => {
    jest.mocked(NotificationModel.updateOne).mockResolvedValueOnce({ upsertedCount: 0 });
    const response = await request(app).post('/notifications').set('Authorization', 'Bearer test-secret').send({ ...payload, userId: 'user', version: '1.2.0', screen: '/news', actionType: 'NEWS', startDate: '2026-11-11T00:00:00Z', endDate: '2026-12-11T00:00:00Z' });
    expect(response.body.created).toBe(false);
    expect(NotificationModel.updateOne).toHaveBeenCalledWith(expect.anything(), { $setOnInsert: expect.objectContaining({ userId: 'user', version: '1.2.0', screen: '/news', actionType: 'NEWS' }) }, expect.anything());
  });
  it.each([{ category: 'invalid' }, { userId: '' }, { version: 1 }, { startDate: 'bad' }, { startDate: '2026-12-01', endDate: '2026-11-01' }, { notificationId: '' }])('rejects invalid input %j', async overrides => {
    expect((await request(app).post('/notifications').set('Authorization', 'Bearer test-secret').send({ ...payload, ...overrides })).status).toBe(400);
    expect(NotificationModel.updateOne).not.toHaveBeenCalled();
  });
});

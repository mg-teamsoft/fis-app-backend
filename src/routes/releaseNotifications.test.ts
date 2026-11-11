import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
jest.mock('../configs/config', () => ({ __esModule: true, default: { releaseNotificationToken: 'test-secret' } }));
jest.mock('../models/NotificationModel', () => ({ NotificationModel: { updateOne: jest.fn() } }));
import router from './releaseNotifications';
import { NotificationModel } from '../models/NotificationModel';
const app = express().use(express.json()).use('/release', router);
const payload = { version: '1.2.0', title: 'New', subtitle: 'Update', content: 'Details' };
beforeEach(() => { jest.clearAllMocks(); });
describe('release notifications', () => {
  it('rejects unauthorized requests', async () => {
    expect((await request(app).post('/release').send(payload)).status).toBe(401);
    expect(NotificationModel.updateOne).not.toHaveBeenCalled();
  });
  it('rejects patch releases and invalid date windows', async () => {
    for (const body of [{ ...payload, version: '1.2.1' }, { ...payload, startDate: '2026-12-01', endDate: '2026-11-01' }]) {
      expect((await request(app).post('/release').set('Authorization', 'Bearer test-secret').send(body)).status).toBe(400);
    }
    expect(NotificationModel.updateOne).not.toHaveBeenCalled();
  });
  it('targets one user without occupying the broadcast notification id', async () => {
    jest.mocked(NotificationModel.updateOne).mockResolvedValueOnce({ upsertedCount: 1 });
    const response = await request(app).post('/release').set('Authorization', 'Bearer test-secret').send({ ...payload, userId: 'test-user' });
    expect(response.status).toBe(201);
    expect(NotificationModel.updateOne).toHaveBeenCalledWith(
      { notificationId: 'release-1.2.0-user-test-user' },
      { $setOnInsert: expect.objectContaining({ userId: 'test-user' }) },
      expect.objectContaining({ upsert: true }),
    );
  });
  it.each(['', '   ', null, 123])('rejects invalid userId %s instead of broadcasting', async userId => {
    const response = await request(app).post('/release').set('Authorization', 'Bearer test-secret').send({ ...payload, userId });
    expect(response.status).toBe(400);
    expect(NotificationModel.updateOne).not.toHaveBeenCalled();
  });
  it('inserts once and preserves existing announcements on retries', async () => {
    jest.mocked(NotificationModel.updateOne).mockResolvedValueOnce({ upsertedCount: 1 }).mockResolvedValueOnce({ upsertedCount: 0 });
    expect((await request(app).post('/release').set('Authorization', 'Bearer test-secret').send(payload)).status).toBe(201);
    expect((await request(app).post('/release').set('Authorization', 'Bearer test-secret').send(payload)).body.created).toBe(false);
    expect(NotificationModel.updateOne).toHaveBeenCalledWith({ notificationId: 'release-1.2.0' }, { $setOnInsert: expect.objectContaining({ userId: null, version: '1.2.0', category: 'version', startDate: expect.any(Date), endDate: expect.any(Date) }) }, expect.objectContaining({ upsert: true, timestamps: false }));
  });
});

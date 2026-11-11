import { describe, expect, it } from '@jest/globals';
import { NotificationModel } from './NotificationModel';
const base = { notificationId: 'test', title: 'Title', subtitle: 'Subtitle', time: 'now' };
describe('optional notification metadata', () => {
  it('accepts notifications without version or category', () => {
    const doc = new NotificationModel(base);
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.version).toBeUndefined();
    expect(doc.category).toBeUndefined();
  });
  it.each(['campaign', 'version', 'news', 'contactNotes'])('accepts category %s', category => {
    const doc = new NotificationModel({ ...base, version: '1.2.0', category });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.version).toBe('1.2.0');
    expect(doc.category).toBe(category);
  });
  it('rejects unsupported categories', () => {
    expect(new NotificationModel({ ...base, category: 'other' }).validateSync()?.errors.category).toBeDefined();
  });
});

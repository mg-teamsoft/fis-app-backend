import { describe, expect, it, jest } from '@jest/globals';
import { JobQueue } from './jobQueue';
const flush = () => new Promise(resolve => setImmediate(resolve));

describe('JobQueue', () => {
  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid limit %s', limit => {
    expect(() => new JobQueue(limit)).toThrow('JOB_CONCURRENCY');
  });
  it('limits concurrency, preserves FIFO order, and releases slots after failures', async () => {
    const queue = new JobQueue(2);
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started: number[] = [];
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    queue.add(async () => { started.push(1); await blocked; throw new Error('failed'); });
    queue.add(async () => { started.push(2); await blocked; });
    queue.add(async () => { started.push(3); });
    await flush();
    expect(started).toEqual([1, 2]);
    release();
    await flush();
    expect(started).toEqual([1, 2, 3]);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

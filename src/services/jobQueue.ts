/** Process-local FIFO queue. Pending jobs do not survive a process restart. */
export class JobQueue {
  private active = 0;
  private pending: Array<() => Promise<void>> = [];

  constructor(private readonly concurrency: number) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new Error('JOB_CONCURRENCY must be a positive safe integer');
    }
  }

  add(task: () => Promise<void>): void {
    this.pending.push(task);
    this.drain();
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length) {
      const task = this.pending.shift()!;
      this.active++;
      void Promise.resolve().then(task).catch(error => {
        console.error('Job task failed:', error);
      }).finally(() => {
        this.active--;
        this.drain();
      });
    }
  }
}

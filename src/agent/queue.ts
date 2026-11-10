// In-process run queue — see docs/02-TRD.md §3.10. Every research goes through it, so at most
// MAX_CONCURRENT_RUNS agents run at once, in the order they were queued.

export const MAX_CONCURRENT_RUNS = 2;

export interface RunQueue {
  /** Queues a research; resolves when its run has finished (successfully or not). */
  enqueue(id: string): Promise<void>;
  readonly active: number;
  readonly waiting: number;
}

export function createRunQueue(run: (id: string) => Promise<void>, maxConcurrent = MAX_CONCURRENT_RUNS): RunQueue {
  const waiting: Array<{ id: string; done: () => void }> = [];
  let active = 0;

  function pump() {
    while (active < maxConcurrent && waiting.length > 0) {
      const job = waiting.shift()!;
      active++;
      run(job.id)
        .catch((error) => console.error(`[queue] research ${job.id} failed`, error))
        .finally(() => {
          active--;
          job.done();
          pump();
        });
    }
  }

  return {
    enqueue: (id) =>
      new Promise<void>((done) => {
        waiting.push({ id, done });
        pump();
      }),
    get active() {
      return active;
    },
    get waiting() {
      return waiting.length;
    },
  };
}

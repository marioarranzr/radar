import { describe, expect, it, vi } from "vitest";
import { createRunQueue } from "@/agent/queue";

/** A runner whose runs finish only when the test says so. */
function controllableRunner() {
  const started: string[] = [];
  const finishers = new Map<string, (error?: Error) => void>();
  const run = (id: string) =>
    new Promise<void>((resolve, reject) => {
      started.push(id);
      finishers.set(id, (error) => (error ? reject(error) : resolve()));
    });
  const finish = async (id: string, error?: Error) => {
    finishers.get(id)!(error);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { run, started, finish };
}

describe("createRunQueue", () => {
  it("runs at most the configured number of jobs at once, in order", async () => {
    const runner = controllableRunner();
    const queue = createRunQueue(runner.run, 2);

    ["a", "b", "c", "d"].forEach((id) => void queue.enqueue(id));
    expect(runner.started).toEqual(["a", "b"]);
    expect([queue.active, queue.waiting]).toEqual([2, 2]);

    await runner.finish("a");
    expect(runner.started).toEqual(["a", "b", "c"]);
    await runner.finish("b");
    expect(runner.started).toEqual(["a", "b", "c", "d"]);
  });

  it("resolves each enqueue when its own run finishes", async () => {
    const runner = controllableRunner();
    const queue = createRunQueue(runner.run, 1);
    const done = vi.fn();

    void queue.enqueue("a");
    void queue.enqueue("b").then(done);
    await runner.finish("a");
    expect(done).not.toHaveBeenCalled();
    await runner.finish("b");
    expect(done).toHaveBeenCalledOnce();
  });

  it("keeps going after a run fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const runner = controllableRunner();
    const queue = createRunQueue(runner.run, 1);

    const first = queue.enqueue("a");
    void queue.enqueue("b");
    await runner.finish("a", new Error("boom"));

    await expect(first).resolves.toBeUndefined();
    expect(runner.started).toEqual(["a", "b"]);
    expect(queue.active).toBe(1);
  });
});

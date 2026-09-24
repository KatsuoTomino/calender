export type LatestWriteResult = "applied" | "superseded" | "failed";

/**
 * Serialize writes per key and keep only the latest requested value.
 * An older in-flight write must not be the value left in storage when a
 * newer request was already made.
 */
export function createLatestWriteQueue<T>(
  write: (key: string, value: T) => Promise<boolean>
): (key: string, value: T) => Promise<LatestWriteResult> {
  const chains = new Map<string, Promise<void>>();
  const latestSeq = new Map<string, number>();
  const desired = new Map<string, T>();
  let seq = 0;

  return (key, value) => {
    const mySeq = ++seq;
    latestSeq.set(key, mySeq);
    desired.set(key, value);

    const prev = chains.get(key) ?? Promise.resolve();
    const task = prev.then(async (): Promise<LatestWriteResult> => {
      if (latestSeq.get(key) !== mySeq) return "superseded";
      const current = desired.get(key) as T;
      let ok = false;
      try {
        ok = await write(key, current);
      } catch {
        ok = false;
      }
      if (latestSeq.get(key) !== mySeq) return "superseded";
      if (!ok) return "failed";
      desired.delete(key);
      return "applied";
    });

    chains.set(
      key,
      task.then(
        () => undefined,
        () => undefined
      )
    );
    return task;
  };
}

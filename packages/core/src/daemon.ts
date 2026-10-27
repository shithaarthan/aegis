// Daemon skeleton pieces owned by Core (P3-T01): ingest queue, stateless stage exec.
export interface QueuedEvent {
  id: string;
  at: string;
  kind: "sensor" | "webhook" | "manual";
  payload: unknown;
  attempts: number;
}

export class IngestQueue {
  private q: QueuedEvent[] = [];
  enqueue(e: Omit<QueuedEvent, "attempts">): void {
    if (!this.q.some((x) => x.id === e.id)) this.q.push({ ...e, attempts: 0 });
  }
  dequeue(): QueuedEvent | null {
    const e = this.q.shift() ?? null;
    if (e) e.attempts += 1;
    return e;
  }
  size(): number { return this.q.length; }
  /** Daemon survives restart without duplicate effects: re-queue un-acked work. */
  requeue(e: QueuedEvent): void {
    if (e.attempts < 3) this.q.unshift(e);
  }
}

/**
 * Polls `predicate` until it resolves truthy or `timeoutMs` elapses. Integration
 * flows are async (events round-trip through RabbitMQ), so never assert state
 * immediately after a publish — poll with this instead.
 */
export async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 3000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  for (;;) {
    try {
      if (await predicate()) return;
    } catch (e) {
      last = e;
    }
    if (Date.now() >= deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms${last ? `; last error: ${String(last)}` : ""}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

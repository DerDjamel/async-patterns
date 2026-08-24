export class TimeoutError extends Error {
  readonly ms: number;

  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
    this.ms = ms;
  }
}

export function isTimeout(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError || (error instanceof Error && error.name === "TimeoutError");
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout"; timeoutMs: number }
  | { ok: false; reason: "error"; error: unknown };

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  timeout.catch(() => {}); // silence unhandled rejection if promise wins
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}

export async function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<Result<T>> {
  try {
    return { ok: true, value: await withTimeout(promise, ms) };
  } catch (error) {
    return isTimeout(error)
      ? { ok: false, reason: "timeout", timeoutMs: ms }
      : { ok: false, reason: "error", error };
  }
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  ms: number = 3000,
): Promise<Response> {
  const signal = AbortSignal.any([AbortSignal.timeout(ms), ...(init.signal ? [init.signal] : [])]);
  return fetch(input, { ...init, signal });
}

interface User {
  id: number;
  name: string;
  email: string;
}

const API_BASE = "https://jsonplaceholder.typicode.com";

async function fetchUser(
  userId: number,
  {
    attempts = 3,
    timeoutMs = 1500,
    signal,
  }: {
    attempts?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<User> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE}/users/${userId}`,
        { headers: { Accept: "application/json" }, signal },
        timeoutMs,
      );

      if (!response.ok) {
        // 4xx are client errors — retrying won't help, fail fast.
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        throw new RetryableError(`HTTP ${response.status}`);
      }

      return (await response.json()) as User;
    } catch (error) {
      lastError = error;

      // Caller aborted — stop immediately, do not retry.
      if (signal?.aborted) throw error;
      // Client errors — no point retrying.
      if (!(error instanceof RetryableError) && !isTimeout(error)) throw error;
      // Out of attempts.
      if (attempt === attempts) break;

      const backoffMs = 2 ** (attempt - 1) * 500; // 500ms, 1s, 2s...
      console.warn(
        `attempt ${attempt}/${attempts} failed (${String(error)}), retrying in ${backoffMs}ms`,
      );
      await sleep(backoffMs, signal);
    }
  }

  throw lastError;
}

class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timerId = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timerId);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function main() {
  // 1. Success path
  const userResult = await raceWithTimeout(fetchUser(1), 5000);
  if (userResult.ok) {
    console.log("user:", userResult.value.name, `<${userResult.value.email}>`);
  } else if (userResult.reason === "timeout") {
    console.error(`gave up after ${userResult.timeoutMs}ms`);
  } else {
    console.error("failed:", userResult.error);
  }

  // 2. Timeout path: absurdly low timeout forces TimeoutError + retries
  const slowResult = await raceWithTimeout(fetchUser(2, { timeoutMs: 1 }), 5000);
  console.log("slow request:", slowResult);

  // 3. Manual cancellation from the caller
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException("user navigated away", "AbortError")), 100);
  try {
    await fetchUser(3, { signal: controller.signal });
  } catch (error) {
    console.error("cancelled:", (error as Error).name); // AbortError
  }
}

main();

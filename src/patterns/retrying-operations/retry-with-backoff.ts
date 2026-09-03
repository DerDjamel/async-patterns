const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const maybeFail = (
  successProbability: number,
  result: string,
  error: Error,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (Math.random() < successProbability) {
      resolve(result);
    } else {
      reject(error);
    }
  });
};

const maybeFailingOperation = async (): Promise<string> => {
  await wait(300);
  return maybeFail(0.4, "result", new Error("operation failed"));
};

const DEFAULT_IS_RETRYABLE = () => true;

const callWithRetries = async <T>(
  fn: () => Promise<T>,
  {
    maxAttempts = 3,
    baseDelayMs = 1000,
    isRetryable = DEFAULT_IS_RETRYABLE,
    onRetry,
  }: {
    maxAttempts?: number;
    baseDelayMs?: number;
    isRetryable?: (error: unknown) => boolean;
    onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  } = {},
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryable(error)) throw error;

      // exponential backoff with jitter: ~1s, ~2s, ~4s...
      const delayMs = baseDelayMs * 2 ** (attempt - 1) + Math.random() * 250;
      onRetry?.(error, attempt, delayMs);
      await wait(delayMs);
    }
  }

  throw lastError; // unreachable, satisfies TS
};

const result = await callWithRetries(maybeFailingOperation, {
  maxAttempts: 10,
  onRetry: (error, attempt, delayMs) =>
    console.log(
      `attempt ${attempt} failed (${String(error)}), retrying in ${Math.round(delayMs)}ms`,
    ),
});
console.log(result);

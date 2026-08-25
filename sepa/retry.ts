export type RetryError = Error & {
  attemptNumber: number;
  retriesLeft: number;
};

type RetryOptions = {
  retries: number;
  minTimeout: number;
  maxTimeout: number;
  shouldRetry?: (error: RetryError) => boolean | Promise<boolean>;
  onFailedAttempt?: (error: RetryError) => void | Promise<void>;
};

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let attemptNumber = 1;

  while (true) {
    try {
      return await operation();
    } catch (caught) {
      const error = (
        caught instanceof Error
          ? caught
          : new TypeError(`Non-error was thrown: ${String(caught)}`)
      ) as RetryError;
      error.attemptNumber = attemptNumber;
      error.retriesLeft = Math.max(0, options.retries - attemptNumber + 1);

      if (options.shouldRetry && !(await options.shouldRetry(error))) {
        throw error;
      }

      await options.onFailedAttempt?.(error);

      if (error.retriesLeft === 0) {
        throw error;
      }

      const timeout = Math.min(
        options.maxTimeout,
        options.minTimeout * 2 ** (attemptNumber - 1)
      );
      await delay(timeout);
      attemptNumber += 1;
    }
  }
}

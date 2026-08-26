import { describe, expect, test } from "bun:test";
import { shouldRetryB2Error } from "./b2";
import type { RetryError } from "../retry";

const retryError = (properties: Partial<RetryError>) =>
  Object.assign(new Error("B2 request failed"), properties) as RetryError;

describe("shouldRetryB2Error", () => {
  test("retries Bun socket errors", () => {
    expect(
      shouldRetryB2Error(retryError({ name: "TypeError", code: "ERR_SOCKET_CLOSED" } as Partial<RetryError>))
    ).toBe(true);
  });

  test("does not retry missing objects", () => {
    expect(shouldRetryB2Error(retryError({ name: "NotFound" }))).toBe(false);
    expect(shouldRetryB2Error(retryError({ name: "NoSuchKey" }))).toBe(false);
  });

  test("does not retry permanent HTTP errors", () => {
    const error = retryError({});
    Object.assign(error, { $metadata: { httpStatusCode: 403 } });
    expect(shouldRetryB2Error(error)).toBe(false);
  });
});

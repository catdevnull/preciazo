import { describe, expect, test } from "bun:test";
import { retry } from "./retry";

describe("retry", () => {
  test("retries Bun socket-closed TypeErrors", async () => {
    let attempts = 0;

    const result = await retry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = new TypeError("Socket is closed");
          Object.assign(error, { code: "ERR_SOCKET_CLOSED" });
          throw error;
        }
        return "ok";
      },
      { retries: 4, minTimeout: 0, maxTimeout: 0 }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  test("honors shouldRetry", async () => {
    let attempts = 0;

    await expect(
      retry(
        async () => {
          attempts += 1;
          throw Object.assign(new Error("missing"), { name: "NotFound" });
        },
        {
          retries: 4,
          minTimeout: 0,
          maxTimeout: 0,
          shouldRetry: (error) => error.name !== "NotFound",
        }
      )
    ).rejects.toHaveProperty("name", "NotFound");

    expect(attempts).toBe(1);
  });
});

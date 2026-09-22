import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiError,
  customFetch,
  setBaseUrl,
  setUnauthorizedHandler,
} from "../src/custom-fetch.ts";

test("keeps a 401 as a request error without invoking global session cleanup", async () => {
  const originalFetch = globalThis.fetch;
  let unauthorizedCalls = 0;

  setBaseUrl(null);
  setUnauthorizedHandler(() => {
    unauthorizedCalls += 1;
  });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: "Session expired." }), {
      status: 401,
      statusText: "Unauthorized",
      headers: { "content-type": "application/problem+json" },
    });

  try {
    await assert.rejects(
      customFetch("/api/auth/me", { responseType: "json" }),
      (error: unknown) => {
        if (!(error instanceof ApiError)) return false;
        assert.equal(error.status, 401);
        assert.deepEqual(error.data, { detail: "Session expired." });
        return true;
      },
    );
    assert.equal(unauthorizedCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    setUnauthorizedHandler(null);
  }
});
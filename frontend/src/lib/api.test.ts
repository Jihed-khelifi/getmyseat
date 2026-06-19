import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getSelection, getVisitorId, saveSelection } from "@/lib/api";

const VISITOR_KEY = "getmyseat:visitorId";

function mockFetch(impl: typeof fetch) {
  vi.stubGlobal("fetch", vi.fn(impl));
  return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getVisitorId", () => {
  it("generates and persists a stable handle", () => {
    const first = getVisitorId();
    expect(first).toBeTruthy();
    expect(window.localStorage.getItem(VISITOR_KEY)).toContain(first);
    expect(getVisitorId()).toBe(first);
  });
});

describe("api client", () => {
  it("attaches the visitor handle to every request", async () => {
    const fetchMock = mockFetch(async () => {
      return new Response(
        JSON.stringify({
          visitorId: "v1",
          venueId: "getmyseat-arena",
          seatIds: [],
          updatedAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    await getSelection();

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["X-Visitor-Id"]).toBe(getVisitorId());
  });

  it("parses a success response body", async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            visitorId: "v1",
            venueId: "getmyseat-arena",
            seatIds: ["sec-a-A-1"],
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const record = await saveSelection("getmyseat-arena", ["sec-a-A-1"]);
    expect(record.seatIds).toEqual(["sec-a-A-1"]);
  });

  it("throws an ApiError carrying the server error shape on non-2xx", async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            error: "Selection rejected",
            details: { issues: [] },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
    );

    await expect(saveSelection("x", ["bad"])).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "Selection rejected",
    });
    await expect(saveSelection("x", ["bad"])).rejects.toBeInstanceOf(ApiError);
  });

  it("persists a server-minted visitor handle from the response header", async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            visitorId: "minted",
            venueId: null,
            seatIds: [],
            updatedAt: null,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Visitor-Id": "minted",
            },
          },
        ),
    );

    await getSelection();
    expect(window.localStorage.getItem(VISITOR_KEY)).toContain("minted");
  });
});

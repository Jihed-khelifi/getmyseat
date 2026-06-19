import { describe, expect, it } from "vitest";

import { AdminAuthService } from "../src/services/admin-auth.service.js";

const CREDS = {
  email: "admin@test.local",
  password: "secret-pw",
  tokenTtlMs: 1000,
};

describe("AdminAuthService", () => {
  it("issues a token for valid credentials", () => {
    const auth = new AdminAuthService(CREDS);
    const result = auth.login(CREDS.email, CREDS.password);
    expect(result).not.toBeNull();
    expect(result!.token).toMatch(/^[0-9a-f]{64}$/);
    expect(auth.verify(result!.token)).toBe(true);
  });

  it("rejects invalid credentials", () => {
    const auth = new AdminAuthService(CREDS);
    expect(auth.login(CREDS.email, "wrong")).toBeNull();
    expect(auth.login("nope@test.local", CREDS.password)).toBeNull();
  });

  it("rejects unknown and expired tokens", () => {
    let now = 0;
    const auth = new AdminAuthService(CREDS, () => now);
    const result = auth.login(CREDS.email, CREDS.password)!;
    expect(auth.verify(result.token)).toBe(true);
    expect(auth.verify("not-a-real-token")).toBe(false);
    expect(auth.verify(undefined)).toBe(false);

    now = CREDS.tokenTtlMs; // token has now expired
    expect(auth.verify(result.token)).toBe(false);
  });

  it("revokes a token", () => {
    const auth = new AdminAuthService(CREDS);
    const result = auth.login(CREDS.email, CREDS.password)!;
    auth.revoke(result.token);
    expect(auth.verify(result.token)).toBe(false);
  });
});

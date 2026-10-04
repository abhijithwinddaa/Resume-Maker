import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRemoteJWKSetMock, jwtVerifyMock } = vi.hoisted(() => ({
  createRemoteJWKSetMock: vi.fn(() => ({})),
  jwtVerifyMock: vi.fn(),
}));

vi.mock("jose", () => {
  class JOSEError extends Error {}
  class JWTExpired extends JOSEError {}
  class JWTClaimValidationFailed extends JOSEError {}
  class JWSSignatureVerificationFailed extends JOSEError {}

  return {
    createRemoteJWKSet: createRemoteJWKSetMock,
    jwtVerify: jwtVerifyMock,
    errors: {
      JOSEError,
      JWTExpired,
      JWTClaimValidationFailed,
      JWSSignatureVerificationFailed,
    },
  };
});

import { errors } from "jose";
import { authenticateClerkRequest } from "../server/requestAuth";

type EnvMap = Record<string, string | undefined>;

function setEnv(patch: EnvMap): void {
  const processEnv = (globalThis as { process?: { env?: EnvMap } }).process
    ?.env;
  if (!processEnv) return;

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete processEnv[key];
      continue;
    }
    processEnv[key] = value;
  }
}

describe("authenticateClerkRequest", () => {
  beforeEach(() => {
    jwtVerifyMock.mockReset();
    createRemoteJWKSetMock.mockClear();

    setEnv({
      CLERK_JWT_ISSUER: "https://issuer.example",
      CLERK_JWKS_URL: "https://issuer.example/.well-known/jwks.json",
    });
  });

  it("returns 401 when authorization header is missing", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
    });

    const result = await authenticateClerkRequest(request);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  it("returns 500 when auth configuration is missing", async () => {
    setEnv({
      CLERK_JWT_ISSUER: undefined,
      CLERK_JWKS_URL: undefined,
    });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
      },
    });

    const result = await authenticateClerkRequest(request);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
    }
  });

  it("returns authenticated user when jwt verification succeeds", async () => {
    jwtVerifyMock.mockResolvedValue({ payload: { sub: "user_123" } });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    const result = await authenticateClerkRequest(request);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.userId).toBe("user_123");
    }
  });

  it("returns 401 for expired tokens", async () => {
    jwtVerifyMock.mockRejectedValue(new errors.JWTExpired("expired", {}));

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        Authorization: "Bearer expired-token",
      },
    });

    const result = await authenticateClerkRequest(request);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.message.toLowerCase()).toContain("expired");
    }
  });

  it("derives the issuer from the Clerk publishable key when none is set", async () => {
    // pk_test_ + base64("clerk.example.accounts.dev$") — Clerk's own encoding.
    const publishableKey = `pk_test_${btoa("clerk.example.accounts.dev$")}`;
    setEnv({
      CLERK_JWT_ISSUER: undefined,
      CLERK_JWKS_URL: undefined,
      VITE_CLERK_PUBLISHABLE_KEY: publishableKey,
    });
    jwtVerifyMock.mockResolvedValue({ payload: { sub: "user_123" } });

    const result = await authenticateClerkRequest(
      new Request("http://localhost/api/test", {
        method: "POST",
        headers: { Authorization: "Bearer good-token" },
      }),
    );

    expect(result.ok).toBe(true);
    expect(createRemoteJWKSetMock).toHaveBeenCalledWith(
      new URL("https://clerk.example.accounts.dev/.well-known/jwks.json"),
    );
    expect(jwtVerifyMock.mock.calls[0][2]).toMatchObject({
      issuer: "https://clerk.example.accounts.dev",
    });

    setEnv({ VITE_CLERK_PUBLISHABLE_KEY: undefined });
  });

  it("ignores a publishable key that does not decode to a Clerk host", async () => {
    setEnv({
      CLERK_JWT_ISSUER: undefined,
      CLERK_JWKS_URL: undefined,
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_not-base64!!",
    });

    const result = await authenticateClerkRequest(
      new Request("http://localhost/api/test", {
        method: "POST",
        headers: { Authorization: "Bearer good-token" },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);

    setEnv({ VITE_CLERK_PUBLISHABLE_KEY: undefined });
  });

  describe("local development sign-in", () => {
    const localRequest = () =>
      new Request("http://localhost/api/test", {
        method: "POST",
        headers: { Authorization: "Bearer local-dev-token" },
      });

    it("accepts the local token on the Vite dev server", async () => {
      setEnv({ RESUME_MAKER_LOCAL_API: "1", VERCEL: undefined });

      const result = await authenticateClerkRequest(localRequest());

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.user.userId).toBe("local_dev_user");
      expect(jwtVerifyMock).not.toHaveBeenCalled();
      setEnv({ RESUME_MAKER_LOCAL_API: undefined });
    });

    it("rejects the local token anywhere but the dev server", async () => {
      setEnv({ RESUME_MAKER_LOCAL_API: undefined });
      jwtVerifyMock.mockRejectedValue(new errors.JOSEError("bad token"));

      const result = await authenticateClerkRequest(localRequest());

      expect(result.ok).toBe(false);
    });

    it("rejects the local token on Vercel even if the dev flag leaks into its env", async () => {
      setEnv({ RESUME_MAKER_LOCAL_API: "1", VERCEL: "1" });
      jwtVerifyMock.mockRejectedValue(new errors.JOSEError("bad token"));

      const result = await authenticateClerkRequest(localRequest());

      expect(result.ok).toBe(false);
      setEnv({ RESUME_MAKER_LOCAL_API: undefined, VERCEL: undefined });
    });
  });
});

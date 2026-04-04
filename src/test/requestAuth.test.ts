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
});

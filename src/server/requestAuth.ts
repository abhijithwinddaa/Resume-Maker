import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose";

type EnvMap = Record<string, string | undefined>;

export interface AuthenticatedRequestUser {
  userId: string;
  token: string;
  payload: JWTPayload;
}

export type RequestAuthResult =
  | {
      ok: true;
      user: AuthenticatedRequestUser;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

const AUTH_HEADER_PATTERN = /^Bearer\s+(.+)$/i;
const CLOCK_TOLERANCE_SECONDS = 5;
const remoteJwksCache = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

function getEnvMap(): EnvMap {
  return (
    (
      globalThis as typeof globalThis & {
        process?: { env?: EnvMap };
      }
    ).process?.env || {}
  );
}

function readEnv(...keys: string[]): string {
  const env = getEnvMap();
  for (const key of keys) {
    const value = env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function getAuthConfig():
  | { issuer: string; jwksUrl: string }
  | { issuer: ""; jwksUrl: string }
  | null {
  const issuer = normalizeUrl(readEnv("CLERK_JWT_ISSUER", "CLERK_ISSUER"));
  const explicitJwksUrl = readEnv("CLERK_JWKS_URL");

  if (explicitJwksUrl) {
    return { issuer, jwksUrl: explicitJwksUrl };
  }

  if (!issuer) {
    return null;
  }

  return {
    issuer,
    jwksUrl: `${issuer}/.well-known/jwks.json`,
  };
}

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization") || "";
  const match = AUTH_HEADER_PATTERN.exec(authHeader);
  return match?.[1]?.trim() || null;
}

function getRemoteJwks(jwksUrl: string) {
  const existing = remoteJwksCache.get(jwksUrl);
  if (existing) return existing;

  const remote = createRemoteJWKSet(new URL(jwksUrl));
  remoteJwksCache.set(jwksUrl, remote);
  return remote;
}

export async function authenticateClerkRequest(
  request: Request,
): Promise<RequestAuthResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      message: "Unauthorized: Missing authentication token.",
    };
  }

  const config = getAuthConfig();
  if (!config) {
    return {
      ok: false,
      status: 500,
      message:
        "Server authentication is not configured. Set CLERK_JWKS_URL or CLERK_JWT_ISSUER.",
    };
  }

  try {
    const verifyOptions = {
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      ...(config.issuer ? { issuer: config.issuer } : {}),
    };

    const { payload } = await jwtVerify(
      token,
      getRemoteJwks(config.jwksUrl),
      verifyOptions,
    );

    const userId = payload.sub;
    if (!userId || typeof userId !== "string") {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized: Token is missing a user identifier.",
      };
    }

    return {
      ok: true,
      user: {
        userId,
        token,
        payload,
      },
    };
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized: Token expired.",
      };
    }

    if (
      error instanceof errors.JWSSignatureVerificationFailed ||
      error instanceof errors.JWTClaimValidationFailed ||
      error instanceof errors.JOSEError
    ) {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized: Invalid authentication token.",
      };
    }

    return {
      ok: false,
      status: 500,
      message: "Authentication verification failed due to a server error.",
    };
  }
}

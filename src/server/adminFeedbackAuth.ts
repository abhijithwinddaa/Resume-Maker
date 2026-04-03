import { createClerkClient, verifyToken } from "@clerk/backend";

export interface AdminActor {
  userId: string;
  email: string;
}

type EnvMap = Record<string, string | undefined>;

const ADMIN_EMAILS = new Set([
  "abhijithyadav786@gmail.com",
  "abhijithwinddaa@gmail.com",
]);

let cachedClient: ReturnType<typeof createClerkClient> | null = null;

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

function getClerkClient(secretKey: string) {
  if (!cachedClient) {
    cachedClient = createClerkClient({ secretKey });
  }
  return cachedClient;
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getPrimaryEmail(user: {
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
}): string {
  if (!user.emailAddresses || user.emailAddresses.length === 0) {
    return "";
  }

  if (user.primaryEmailAddressId) {
    const primary = user.emailAddresses.find(
      (item) => item.id === user.primaryEmailAddressId,
    );
    if (primary?.emailAddress) {
      return primary.emailAddress;
    }
  }

  return user.emailAddresses[0]?.emailAddress || "";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function requireAdminActor(
  request: Request,
): Promise<{ actor: AdminActor | null; response?: Response }> {
  const secretKey = readEnv("CLERK_SECRET_KEY");
  if (!secretKey) {
    return {
      actor: null,
      response: jsonResponse(
        { error: "Server is missing CLERK_SECRET_KEY." },
        500,
      ),
    };
  }

  const token = getBearerToken(request);
  if (!token) {
    return {
      actor: null,
      response: jsonResponse({ error: "Missing admin auth token." }, 401),
    };
  }

  const verification = await verifyToken(token, { secretKey });
  const tokenData = verification.data as { sub?: string } | undefined;
  const userId = tokenData?.sub?.trim();

  if (!userId) {
    return {
      actor: null,
      response: jsonResponse({ error: "Invalid admin auth token." }, 401),
    };
  }

  try {
    const clerkClient = getClerkClient(secretKey);
    const user = await clerkClient.users.getUser(userId);
    const email = getPrimaryEmail(user).trim().toLowerCase();

    if (!email || !ADMIN_EMAILS.has(email)) {
      return {
        actor: null,
        response: jsonResponse({ error: "Forbidden." }, 403),
      };
    }

    return {
      actor: {
        userId,
        email,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to verify admin identity.";
    return {
      actor: null,
      response: jsonResponse({ error: message }, 500),
    };
  }
}

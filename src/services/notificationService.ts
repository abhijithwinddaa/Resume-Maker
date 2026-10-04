import { authedJsonRequest } from "../utils/authedApi";
import { LOCAL_DEV_AUTH } from "../auth/devAuth";

interface SyncSignedInUserRequest {
  firstName?: string;
}

interface SyncSignedInUserResponse {
  synced: boolean;
  welcomeSent: boolean;
}

export async function syncSignedInUser(
  firstName?: string,
  signal?: AbortSignal,
): Promise<SyncSignedInUserResponse> {
  // The local test user has no real inbox to send a welcome email to.
  if (LOCAL_DEV_AUTH) return { synced: false, welcomeSent: false };

  return authedJsonRequest<SyncSignedInUserRequest, SyncSignedInUserResponse>(
    "/api/notifications/sync-user",
    {
      firstName: firstName?.trim() || undefined,
    },
    signal,
  );
}

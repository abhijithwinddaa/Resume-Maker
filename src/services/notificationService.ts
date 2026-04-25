import { authedJsonRequest } from "../utils/authedApi";

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
  return authedJsonRequest<SyncSignedInUserRequest, SyncSignedInUserResponse>(
    "/api/notifications/sync-user",
    {
      firstName: firstName?.trim() || undefined,
    },
    signal,
  );
}

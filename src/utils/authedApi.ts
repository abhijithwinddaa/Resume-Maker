let authedApiTokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthedApiTokenGetter(
  getter: (() => Promise<string | null>) | null,
): void {
  authedApiTokenGetter = getter;
}

export async function authedJsonRequest<TRequest, TResponse>(
  path: string,
  payload: TRequest,
  signal?: AbortSignal,
): Promise<TResponse> {
  if (!authedApiTokenGetter) {
    throw new Error("Please sign in to continue.");
  }

  const token = await authedApiTokenGetter();
  if (!token) {
    throw new Error("Please sign in to continue.");
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  const bodyText = await response.text();
  const parsed = bodyText.trim()
    ? (JSON.parse(bodyText) as { error?: string; message?: string })
    : null;

  if (!response.ok) {
    throw new Error(
      parsed?.error?.trim() ||
        parsed?.message?.trim() ||
        `Request failed with status ${response.status}.`,
    );
  }

  return parsed as TResponse;
}

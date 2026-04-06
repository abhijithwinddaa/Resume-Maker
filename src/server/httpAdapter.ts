type NodeLikeRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  url?: string;
};

type NodeLikeResponse = {
  status: (code: number) => NodeLikeResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
};

function normalizeBody(method: string, body: unknown): BodyInit | undefined {
  if (method === "GET" || method === "HEAD") {
    return undefined;
  }

  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body === "string") {
    return body;
  }

  if (body instanceof Uint8Array) {
    const copied = new Uint8Array(body.byteLength);
    copied.set(body);
    return copied.buffer;
  }

  return JSON.stringify(body);
}

function normalizeHeaders(
  headers: NodeLikeRequest["headers"],
  body: unknown,
): Headers {
  const normalized = new Headers();

  for (const [key, value] of Object.entries(headers || {})) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      normalized.set(key, value.join(", "));
      continue;
    }

    normalized.set(key, value);
  }

  if (body !== undefined && !normalized.has("content-type")) {
    normalized.set("content-type", "application/json");
  }

  return normalized;
}

export function toWebRequest(request: Request | NodeLikeRequest): Request {
  if (request instanceof Request) {
    return request;
  }

  const method = (request.method || "GET").toUpperCase();
  const body = normalizeBody(method, request.body);
  const headers = normalizeHeaders(request.headers, request.body);
  const url = request.url || "https://local.invalid/api";
  const absoluteUrl = url.startsWith("http") ? url : `https://local.invalid${url}`;

  return new Request(absoluteUrl, {
    method,
    headers,
    body,
  });
}

export function isNodeResponse(value: unknown): value is NodeLikeResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<NodeLikeResponse>;
  return (
    typeof candidate.status === "function" &&
    typeof candidate.setHeader === "function" &&
    typeof candidate.send === "function"
  );
}

export async function sendNodeResponse(
  response: NodeLikeResponse,
  webResponse: Response,
): Promise<void> {
  response.status(webResponse.status);

  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-length") {
      return;
    }
    response.setHeader(key, value);
  });

  response.send(await webResponse.text());
}
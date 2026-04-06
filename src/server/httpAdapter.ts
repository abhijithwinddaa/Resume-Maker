type NodeLikeRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  rawBody?: unknown;
  url?: string;
};

type NodeLikeResponse = {
  status?: (code: number) => NodeLikeResponse | unknown;
  statusCode?: number;
  setHeader?: (name: string, value: string) => void;
  send?: (body: string) => void;
  end?: (body?: string) => void;
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
  if (typeof Request !== "undefined" && request instanceof Request) {
    return request;
  }

  const nodeRequest = request as NodeLikeRequest;
  const method = (nodeRequest.method || "GET").toUpperCase();
  const requestBody = nodeRequest.body ?? nodeRequest.rawBody;
  const body = normalizeBody(method, requestBody);
  const headers = normalizeHeaders(nodeRequest.headers, requestBody);
  const url = nodeRequest.url || "https://local.invalid/api";
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
    typeof candidate.status === "function" ||
    typeof candidate.setHeader === "function" ||
    typeof candidate.send === "function" ||
    typeof candidate.end === "function" ||
    typeof candidate.statusCode === "number"
  );
}

export async function sendNodeResponse(
  response: NodeLikeResponse,
  webResponse: Response,
): Promise<void> {
  if (typeof response.status === "function") {
    response.status(webResponse.status);
  } else {
    response.statusCode = webResponse.status;
  }

  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-length") {
      return;
    }
    response.setHeader?.(key, value);
  });

  const textBody = await webResponse.text();
  if (typeof response.send === "function") {
    response.send(textBody);
    return;
  }

  response.end?.(textBody);
}
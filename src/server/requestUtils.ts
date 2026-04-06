type HeaderRecordValue = string | string[] | undefined;

type HeaderSource =
  | Headers
  | Record<string, HeaderRecordValue>
  | undefined
  | null;

function normalizeHeaderValue(value: HeaderRecordValue): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(", ");
  }

  return "";
}

export function getHeaderValue(headers: HeaderSource, name: string): string {
  if (!headers) return "";

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) || "";
  }

  const headerMap = headers as Record<string, HeaderRecordValue>;
  const loweredName = name.toLowerCase();

  const direct =
    headerMap[name] || headerMap[loweredName] || headerMap[name.toUpperCase()];
  if (direct !== undefined) {
    return normalizeHeaderValue(direct);
  }

  for (const [key, value] of Object.entries(headerMap)) {
    if (key.toLowerCase() === loweredName) {
      return normalizeHeaderValue(value);
    }
  }

  return "";
}

export function isRequestTooLarge(
  request: Request,
  maxRequestBytes: number,
): boolean {
  const contentLengthHeader = getHeaderValue(
    (
      request as Request & {
        headers?: HeaderSource;
      }
    ).headers,
    "content-length",
  );

  if (!contentLengthHeader) {
    return false;
  }

  const contentLength = Number(contentLengthHeader);
  return Number.isFinite(contentLength) && contentLength > maxRequestBytes;
}

export class InvalidRequest extends Error {
  readonly status: number;

  constructor(status: number) {
    super();
    this.status = status;
  }
}

export function jsonResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
      ...(status === 405 ? { Allow: "POST" } : {})
    }
  });
}

export function assertSameOrigin(request: Request, url: URL) {
  const site = request.headers.get("sec-fetch-site");
  return request.headers.get("origin") === url.origin && ["same-origin", "none", null].includes(site);
}

export async function readJsonBody(request: Request, maxBytes: number) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new InvalidRequest(413);
  }
  if (!request.body) throw new InvalidRequest(400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new InvalidRequest(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return { text, value: value as Record<string, unknown> };
  } catch {
    throw new InvalidRequest(400);
  }
}

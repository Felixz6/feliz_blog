import { assertSameOrigin, InvalidRequest, jsonResponse, readJsonBody } from "./http.ts";

// shortcut: cap request bodies at 16 MiB; raise if combined attachment payloads need more.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

export async function sendResend(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/send") return jsonResponse(404);
  if (request.method !== "POST") return jsonResponse(405);
  if (!assertSameOrigin(request, url)) return jsonResponse(403);
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get("content-type") || "")) return jsonResponse(415);
  const key = request.headers.get("x-api-key") || "";
  if (!key || key.length > 512 || /[\u0000-\u001f\u007f]/.test(key)) return jsonResponse(401, { message: "A valid API Key is required" });
  try {
    const { text: body } = await readJsonBody(request, MAX_BODY_BYTES);
    const upstream = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body,
      redirect: "manual"
    });
    if (upstream.status >= 300 && upstream.status < 400) return jsonResponse(502, { message: "Resend API unavailable" });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": upstream.headers.get("content-type") || "application/json"
      }
    });
  } catch (error) {
    const invalid = error instanceof InvalidRequest;
    return jsonResponse(invalid ? error.status : 502, invalid ? undefined : { message: "Resend API unavailable" });
  }
}

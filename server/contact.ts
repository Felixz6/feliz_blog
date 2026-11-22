import { assertSameOrigin, InvalidRequest, jsonResponse, readJsonBody } from "./http.ts";

export interface ContactEnvironment {
  RESEND_API_KEY?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
}

const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;

function isEmail(value: string) {
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
}

function decodedBase64Bytes(value: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return -1;
  return value.length * 3 / 4 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
}

export async function sendContactMessage(request: Request, env: ContactEnvironment, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/message") return jsonResponse(404, { message: "Not found" });
  if (request.method !== "POST") return jsonResponse(405);
  if (!assertSameOrigin(request, url)) return jsonResponse(403, { message: "Forbidden" });
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get("content-type") || "")) {
    return jsonResponse(415, { message: "JSON required" });
  }

  try {
    const { value: payload } = await readJsonBody(request, MAX_REQUEST_BYTES);
    if (typeof payload.website === "string" && payload.website.trim()) return jsonResponse(200, { ok: true });

    const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
    const body = typeof payload.body === "string" ? payload.body : "";
    const mode = payload.mode;
    const subjectInvalid = !subject || subject.length > 120 || /[\u0000-\u001f\u007f]/.test(subject);
    const bodyInvalid = !body.trim() || body.length > 10000;
    const modeInvalid = !["html", "text"].includes(String(mode));
    if (subjectInvalid || bodyInvalid || modeInvalid) {
      return jsonResponse(400, { message: "请检查主题和正文内容" });
    }

    const rawAttachments = payload.attachments === undefined ? [] : payload.attachments;
    if (!Array.isArray(rawAttachments) || rawAttachments.length > MAX_ATTACHMENTS) {
      return jsonResponse(400, { message: "附件格式无效" });
    }

    const attachments: { filename: string; content: string }[] = [];
    let totalAttachmentBytes = 0;
    for (const item of rawAttachments) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return jsonResponse(400, { message: "附件格式无效" });
      }
      const filename = typeof item.filename === "string" ? item.filename : "";
      const content = typeof item.content === "string" ? item.content : "";
      const bytes = decodedBase64Bytes(content);
      if (!filename || filename.length > 128 || /[\u0000-\u001f\u007f]/.test(filename) || bytes < 0) {
        return jsonResponse(400, { message: "附件格式无效" });
      }
      totalAttachmentBytes += bytes;
      if (totalAttachmentBytes > MAX_ATTACHMENT_BYTES) {
        return jsonResponse(413, { message: "附件总大小不能超过 3 MB" });
      }
      attachments.push({ filename: filename.replace(/[\\/]/g, "_"), content });
    }

    const apiKey = env.RESEND_API_KEY || "";
    const to = env.CONTACT_TO_EMAIL || "";
    const from = env.CONTACT_FROM_EMAIL || "";
    const keyInvalid = !apiKey || apiKey.length > 512 || /[\u0000-\u001f\u007f]/.test(apiKey);
    if (keyInvalid || !isEmail(to) || !isEmail(from)) {
      return jsonResponse(503, { message: "留言服务尚未配置" });
    }

    const email = {
      from,
      to: [to],
      subject,
      [mode === "html" ? "html" : "text"]: body,
      ...(attachments.length ? { attachments } : {})
    };
    // shortcut: origin checks and a honeypot are the current spam controls; add an edge rate limit if abuse appears.
    const upstream = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(email),
      redirect: "manual"
    });
    if (upstream.ok) return jsonResponse(200, { ok: true });

    const providerError: unknown = await upstream.clone().json().catch(() => null);
    const rawType = providerError && typeof providerError === "object" ? (providerError as Record<string, unknown>).name : null;
    const errorType = typeof rawType === "string" && /^[a-z\d_-]{1,64}$/i.test(rawType) ? rawType : "unknown";
    console.error("[contact] Resend rejected request", { status: upstream.status, errorType });
    return jsonResponse(502, { message: `Resend 拒绝请求：HTTP ${upstream.status}（${errorType}）` });
  } catch (error) {
    if (error instanceof InvalidRequest) return jsonResponse(error.status, { message: "请求格式无效" });
    console.error("[contact] Resend request failed", error instanceof Error ? error.name : "unknown");
    return jsonResponse(502, { message: "连接 Resend 失败，请查看 Cloudflare Functions 日志" });
  }
}

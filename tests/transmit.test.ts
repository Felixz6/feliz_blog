import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../public/tools/transmit/index.html");
const script = read("../public/tools/transmit/transmit.js");
const mail = read("../public/tools/transmit/mail.js");
const source = `${page}\n${script}\n${mail}`;

test("mail terminal stays a static /tools/transmit/ page with external assets", () => {
  assert.match(page, /<link rel="stylesheet" href="\/tools\/transmit\/transmit\.css">/);
  assert.match(page, /<script src="\/tools\/transmit\/mail\.js"><\/script>/);
  assert.match(page, /<script src="\/tools\/transmit\/transmit\.js"><\/script>/);
  assert.doesNotMatch(page, /<style[\s>]/);
  assert.match(page, /昼 \/ 夜/);
  assert.match(page, /id="ccToggle">\+ CC \/ BCC/);
  assert.match(page, /id="eye" type="button">SHOW/);
  assert.match(read("../src/themes/fuyukawa-kagari/pages/AboutPage.astro"), /href="\/tools\/transmit\/index\.html"/);
});

test("mail terminal permits attachment-only mail with a visually blank Resend body", () => {
  assert.match(source, /if\(!body\.trim\(\)&&!atts\.length\)return toast\('请填写正文或添加附件'/);
  assert.match(source, /payload\[mode\]=body\.trim\(\)\?body:\(mode==='html'\?'&nbsp;':'\\u00a0'\)/);
  assert.match(source, /if\(atts\.length\)payload\.attachments=atts\.map/);
});

test("mail payload keeps attachment-only bodies blank and drops empty copies", () => {
  const context: { buildMailPayload: (input: Record<string, unknown>) => Record<string, unknown> } = { buildMailPayload: () => ({}) };
  vm.runInNewContext(mail, context);
  const build = (input: Record<string, unknown>) => JSON.parse(JSON.stringify(context.buildMailPayload(input))) as Record<string, unknown>;
  const attachment = { filename: "note.txt", content: "aGk=", size: 2 };
  assert.deepEqual(build({
    from: "me@example.com", to: ["you@example.com"], cc: [], bcc: [], replyTo: "", subject: "files", mode: "html", body: "  ", atts: [attachment]
  }), {
    from: "me@example.com", to: ["you@example.com"], subject: "files", html: "&nbsp;", attachments: [{ filename: "note.txt", content: "aGk=" }]
  });
  assert.equal(build({
    from: "me@example.com", to: ["you@example.com"], cc: [], bcc: [], replyTo: "", subject: "files", mode: "text", body: "", atts: [attachment]
  }).text, "\u00a0");
  assert.deepEqual(build({
    from: "me@example.com", to: ["you@example.com"], cc: ["cc@example.com"], bcc: ["bcc@example.com"], replyTo: "reply@example.com",
    subject: "hello", mode: "html", body: "<p>你好</p>", atts: []
  }), {
    from: "me@example.com", to: ["you@example.com"], subject: "hello", cc: ["cc@example.com"], bcc: ["bcc@example.com"],
    reply_to: "reply@example.com", html: "<p>你好</p>"
  });
});

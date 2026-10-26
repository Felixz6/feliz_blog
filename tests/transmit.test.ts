import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("mail terminal permits attachment-only mail with a visually blank Resend body", () => {
  const page = readFileSync(new URL("../public/tools/transmit/index.html", import.meta.url), "utf8");
  assert.match(page, /if\(!body\.trim\(\)&&!atts\.length\)return toast\('请填写正文或添加附件'/);
  assert.match(page, /payload\[mode\]=body\.trim\(\)\?body:\(mode==='html'\?'&nbsp;':'\\u00a0'\);/);
  assert.match(page, /if\(atts\.length\)payload\.attachments=atts\.map/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("mail terminal permits attachment-only mail and omits an empty body", () => {
  const page = readFileSync(new URL("../public/tools/transmit/index.html", import.meta.url), "utf8");
  assert.match(page, /if\(!body\.trim\(\)&&!atts\.length\)return toast\('请填写正文或添加附件'/);
  assert.match(page, /if\(body\.trim\(\)\)payload\[mode\]=body;/);
  assert.match(page, /if\(atts\.length\)payload\.attachments=atts\.map/);
});

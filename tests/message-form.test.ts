import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("ME places the guest-message link below recent activity and points to the composer", () => {
  const about = read("src/themes/fuyukawa-kagari/pages/AboutPage.astro");
  const section = about.slice(about.indexOf('aria-labelledby="now-doing-title"'));
  assert.ok(section.indexOf("about-activity-grid") < section.indexOf("about-message-link"));
  assert.match(section, /class="about-message-link" href="\/message\/index\.html"/);
  assert.match(section, /访客给我留言/);
});

test("guest page submits the payload composer to the contact endpoint", () => {
  const page = read("public/message/index.html");
  assert.match(page, /<input[^>]+id="subject"/);
  assert.match(page, /<textarea[^>]+id="body"/);
  assert.match(page, /data-mode="html"/);
  assert.match(page, /type="file" id="attachments"/);
  assert.match(page, /fetch\("\/api\/message"/);
  assert.match(page, /form\.elements\.website/);
  assert.match(page, /CONTACT|API Key 不会暴露/);
  assert.doesNotMatch(page, /api[_-]?key|\/api\/send/i);
});

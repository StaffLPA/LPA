import assert from "node:assert/strict";
import { test } from "node:test";
import { announcementPlainText, sanitizeAnnouncementHtml } from "../src/lib/announcementContent";

test("announcement sanitizer removes executable markup while preserving the formatting allowlist", () => {
  const sanitized = sanitizeAnnouncementHtml(
    `<h2 style="color: #123456; position: fixed">Practice update</h2><p><strong>Bring water</strong> <em>and cleats</em>.</p>` +
    `<script>alert("xss")</script><img src=x onerror="alert(1)">` +
    `<a href="javascript:alert(1)" onclick="alert(2)">unsafe link</a>` +
    `<a href="https://example.com" style="color: red; background-image: url(https://bad)">safe link</a>`,
  );

  assert.match(sanitized, /<h2 style="color: #123456">Practice update<\/h2>/);
  assert.match(sanitized, /<strong>Bring water<\/strong>/);
  assert.match(sanitized, /<em>and cleats<\/em>/);
  assert.match(sanitized, /<a>unsafe link<\/a>/);
  assert.match(sanitized, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer" style="color: red">safe link<\/a>/);
  assert.doesNotMatch(sanitized, /script|onerror|onclick|javascript:|position:|url\(/i);
});

test("announcement plain text preview removes markup, decodes basic entities, and truncates", () => {
  assert.equal(
    announcementPlainText("<p>Practice&nbsp;<strong>today</strong><br>Bring &amp; drink water.</p>"),
    "Practice today Bring & drink water.",
  );
  assert.equal(announcementPlainText(`<p>${"x".repeat(120)}</p>`).length, 100);
});
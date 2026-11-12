// Tests for assets/js/markdown.js:  node --test scripts/test-markdown.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { render } = createRequire(import.meta.url)("../assets/js/markdown.js");

test("escapes raw HTML and scripts", () => {
  const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">');
  assert.ok(!html.includes("<script"), html);
  assert.ok(!html.includes("<img"), html);
  assert.ok(html.includes("&lt;script&gt;"));
});

test("only keeps http(s) and anchor links", () => {
  assert.equal(render("[x](javascript:alert(1))"), "<p>x</p>");
  assert.equal(render("[x](data:text/html,hi)"), "<p>x</p>");
  assert.match(render("[docs](https://example.com/a?b=1&c=2)"), /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2" rel="noopener">docs<\/a>/);
  assert.match(render("[top](#install)"), /href="#install"/);
});

test("link URLs cannot break out of the attribute", () => {
  const html = render('[x](https://a.com"onmouseover="alert(1))');
  assert.ok(!/"onmouseover=/.test(html), html);
});

test("code spans, including double-backtick ones, are literal", () => {
  assert.equal(render("press `<C-s>` now"), "<p>press <code>&lt;C-s&gt;</code> now</p>");
  assert.equal(render("`` Ctrl+Shift+` `` opens it"), "<p><code>Ctrl+Shift+`</code> opens it</p>");
  assert.equal(render("`**not bold**`"), "<p><code>**not bold**</code></p>");
});

test("headings, emphasis, lists and quotes", () => {
  const html = render("## Fixed\n\n- **Space p** opens the *palette*\n- second\n\n1. one\n2. two\n\n> note");
  assert.match(html, /<h4>Fixed<\/h4>/);
  assert.match(html, /<ul><li><strong>Space p<\/strong> opens the <em>palette<\/em><\/li><li>second<\/li><\/ul>/);
  assert.match(html, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(html, /<blockquote>note<\/blockquote>/);
});

test("fenced code keeps content verbatim", () => {
  const html = render("```bash\ncurl -LO https://x/y && tar -xzf y <z>\n```");
  assert.equal(html, '<pre class="md-code" data-lang="bash"><code>curl -LO https://x/y &amp;&amp; tar -xzf y &lt;z&gt;</code></pre>');
});

test("tables like the ones in WraithVim release notes", () => {
  const html = render("| Before | Now |\n|---|---|\n| `<leader>gP` | **Space g Shift+P** |\n| `:WraithUpdate` | `:Update` |");
  assert.match(html, /<thead><tr><th>Before<\/th><th>Now<\/th><\/tr><\/thead>/);
  assert.match(html, /<td><code>&lt;leader&gt;gP<\/code><\/td><td><strong>Space g Shift\+P<\/strong><\/td>/);
  assert.equal((html.match(/<tr>/g) || []).length, 3);
});

test("bare <https://…> links become links", () => {
  assert.match(render("Website: <https://cachewraith.github.io/wraithvim-site/>"), /<a href="https:\/\/cachewraith\.github\.io\/wraithvim-site\/"/);
});

test("URLs may contain balanced parentheses", () => {
  assert.match(render("[w](https://en.wikipedia.org/wiki/Vim_(text_editor))"), /href="https:\/\/en\.wikipedia\.org\/wiki\/Vim_\(text_editor\)"/);
});

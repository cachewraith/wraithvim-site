// Minimal, safe Markdown renderer for GitHub release notes.
//
// Supports what WraithVim's notes use: ## / ### headings, paragraphs, - / *
// and 1. lists, fenced code blocks, tables, > quotes, **bold**, *italic*,
// `code` and ``code with ` inside``, and [links](https://…).
// Everything is HTML-escaped first; only http(s) and #anchor links survive,
// so a release note can never inject markup or scripts into the page.
(function (root) {
  "use strict";

  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function inline(text) {
    const codes = [];
    // Code spans first (``…`` before `…`), protected from further formatting.
    let s = text.replace(/``\s?(.+?)\s?``|`([^`]+)`/g, (_, a, b) => {
      codes.push(`<code>${esc(a !== undefined ? a : b)}</code>`);
      return `\u0000${codes.length - 1}\u0000`;
    });
    s = esc(s);
    // URL may contain one level of balanced parentheses, e.g. wiki/Foo_(bar).
    s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (m, label, url) => {
      const raw = url.replace(/&amp;/g, "&");
      if (!/^(https?:\/\/|#)/i.test(raw)) return label; // drop javascript:, data:, relative…
      return `<a href="${esc(raw)}" rel="noopener">${label}</a>`;
    });
    s = s.replace(/(^|[^\w])&lt;(https?:\/\/[^\s&]+)&gt;/g, (m, pre, url) => `${pre}<a href="${url}" rel="noopener">${url}</a>`);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
  }

  function table(rows) {
    const cells = (r) => r.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => inline(c.trim()));
    const [head, , ...body] = rows;
    return (
      "<div class=\"md-table\"><table><thead><tr>" + cells(head).map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>" +
      body.map((r) => "<tr>" + cells(r).map((c) => `<td>${c}</td>`).join("") + "</tr>").join("") +
      "</tbody></table></div>"
    );
  }

  function render(md) {
    const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {
        const lang = line.slice(3).trim();
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre class="md-code"${lang ? ` data-lang="${esc(lang)}"` : ""}><code>${esc(buf.join("\n"))}</code></pre>`);
        continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        const level = Math.min(6, h[1].length + 2); // ## -> h4 inside a release
        out.push(`<h${level}>${inline(h[2])}</h${level}>`);
        i++;
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
        out.push(table(rows));
        continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const items = [];
        while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
          if (/^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
          else items[items.length - 1] += " " + lines[i].trim();
          i++;
        }
        const tag = ordered ? "ol" : "ul";
        out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`);
        continue;
      }
      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
        out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
        continue;
      }
      if (!line.trim()) { i++; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,6}\s|>|\s*([-*]|\d+\.)\s|\s*\|)/.test(lines[i])) buf.push(lines[i++].trim());
      if (!buf.length) buf.push(lines[i++].trim());
      out.push(`<p>${inline(buf.join(" "))}</p>`);
    }
    return out.join("\n");
  }

  const api = { render, inline };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WraithMarkdown = api;
})(typeof window !== "undefined" ? window : globalThis);

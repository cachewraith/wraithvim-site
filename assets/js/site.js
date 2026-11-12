// WraithVim site behaviour. No dependencies; everything degrades to a plain
// page without JavaScript.
(() => {
  "use strict";

  const REPO = "cachewraith/wraithvim";
  const API = `https://api.github.com/repos/${REPO}`;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------------------------------------------------------- */
  /* Statusline, mode and messages */

  const sl = {
    mode: $("[data-sl-mode]"),
    file: $("[data-sl-file]"),
    msg: $("[data-sl-msg]"),
    pct: $("[data-sl-pct]"),
    ln: $("[data-sl-ln]"),
  };
  let msgTimer;
  function setMode(mode) {
    document.body.dataset.mode = mode;
    sl.mode.textContent = mode.toUpperCase();
  }
  function message(text) {
    sl.msg.textContent = text;
    sl.msg.classList.add("is-on");
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => sl.msg.classList.remove("is-on"), 2200);
  }
  setMode("normal");

  document.addEventListener("focusin", (e) => {
    if (e.target instanceof Element && e.target.matches("input, textarea")) setMode(e.target.closest("[data-cmdline]") ? "command" : "insert");
  });
  document.addEventListener("focusout", () => setTimeout(() => {
    if (!document.activeElement || !document.activeElement.matches("input, textarea")) setMode("normal");
  }, 0));
  document.addEventListener("selectionchange", () => {
    if (document.body.dataset.mode === "insert" || document.body.dataset.mode === "command") return;
    const sel = window.getSelection();
    setMode(sel && String(sel).trim() ? "visual" : "normal");
  });

  /* ---------------------------------------------------------------- */
  /* Gutter (relative line numbers) + scroll position */

  const gutter = document.createElement("div");
  gutter.className = "gutter";
  gutter.setAttribute("aria-hidden", "true");
  document.body.appendChild(gutter);
  let lineH = 26;
  function buildGutter() {
    gutter.innerHTML = "";
    const probe = document.createElement("span");
    gutter.appendChild(probe);
    lineH = probe.getBoundingClientRect().height || 26;
    gutter.innerHTML = "";
    const rows = Math.ceil(gutter.clientHeight / lineH) + 1;
    for (let i = 0; i < rows; i++) gutter.appendChild(document.createElement("span"));
  }

  const sections = $$("main > section");
  const tabs = new Map($$(".tab").map((t) => [t.dataset.section, t]));
  let currentId = "";

  function onScroll() {
    const top = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    // Gutter: first visible "line" and the cursor line in the middle.
    const spans = gutter.children;
    const first = Math.floor(top / lineH) + 1;
    const offset = -(top % lineH);
    gutter.style.paddingTop = "0";
    gutter.style.transform = `translateY(${offset}px)`;
    const mid = Math.floor(spans.length / 2);
    for (let i = 0; i < spans.length; i++) {
      const n = first + i;
      const rel = Math.abs(i - mid);
      spans[i].textContent = rel === 0 ? String(n) : String(rel);
      spans[i].className = rel === 0 ? "is-cursor" : "";
    }
    sl.ln.textContent = `${first + mid}:1`;
    sl.pct.textContent = top <= 2 ? "Top" : top >= max - 2 ? "Bot" : `${Math.round((top / max) * 100)}%`;

    // Active buffer = last section whose top passed 35% of the viewport.
    let active = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= window.innerHeight * 0.35) active = s;
    if (active.id !== currentId) {
      currentId = active.id;
      tabs.forEach((t, id) => t.classList.toggle("is-active", id === currentId));
      tabs.get(currentId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      sl.file.textContent = active.dataset.title || active.id;
    }
  }
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => { onScroll(); ticking = false; });
    }
  }, { passive: true });
  window.addEventListener("resize", () => { buildGutter(); onScroll(); });
  buildGutter();
  onScroll();

  /* ---------------------------------------------------------------- */
  /* Reveal on scroll */

  if (!reduceMotion && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach((el) => io.observe(el));
  } else {
    $$(".reveal").forEach((el) => el.classList.add("is-in"));
  }

  /* ---------------------------------------------------------------- */
  /* Copy buttons ("yank") */

  $$("[data-copy]").forEach((box) => {
    const btn = $(".copy", box);
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const text = box.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = Object.assign(document.createElement("textarea"), { value: text });
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      const lines = text.split("\n").length;
      btn.textContent = "copied";
      btn.classList.add("is-done");
      message(`${lines} line${lines > 1 ? "s" : ""} yanked`);
      setTimeout(() => { btn.textContent = "copy"; btn.classList.remove("is-done"); }, 1600);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Tabs */

  $$("[data-tabs]").forEach((group) => {
    const buttons = $$("[role=tab]", group);
    const select = (btn) => {
      buttons.forEach((b) => {
        const on = b === btn;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        document.getElementById(b.getAttribute("aria-controls")).hidden = !on;
      });
    };
    buttons.forEach((b, i) => {
      b.addEventListener("click", () => select(b));
      b.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        const next = buttons[(i + d + buttons.length) % buttons.length];
        select(next);
        next.focus();
      });
    });
    // Pre-select the reader's distribution where it is obvious.
    if (group.querySelector("#t-deb") && /ubuntu|debian/i.test(navigator.userAgent)) select($("#t-deb"));
    if (group.querySelector("#t-fed") && /fedora/i.test(navigator.userAgent)) select($("#t-fed"));
  });

  /* ---------------------------------------------------------------- */
  /* Live GitHub stats (cached 30 min to respect API limits) */

  const CACHE = "wraithvim-stats-v2"; // v2 adds release notes
  function countUp(el, value) {
    if (reduceMotion || value < 10) { el.textContent = value.toLocaleString(); return; }
    const start = performance.now();
    const dur = 900;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(value * (1 - Math.pow(1 - t, 3))).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function applyStats(s) {
    $$("[data-stat=downloads]").forEach((el) => countUp(el, s.downloads));
    $$("[data-stat=version]").forEach((el) => { el.textContent = s.version; });
    $$("[data-stat=stars]").forEach((el) => { el.textContent = `★ ${s.stars.toLocaleString()}`; });
    renderReleases(s.releases);
  }

  /* Release notes ("What's new"), rendered from GitHub release bodies. */
  const releasesEl = $("[data-releases]");
  const dateFmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
  function ago(iso) {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return months < 12 ? `${months} month${months > 1 ? "s" : ""} ago` : `${Math.floor(months / 12)} year${months >= 24 ? "s" : ""} ago`;
  }
  function renderReleases(list) {
    if (!releasesEl) return;
    if (!list || !list.length) {
      releasesEl.innerHTML = `<li class="log__loading">Could not load release notes right now — <a href="https://github.com/${REPO}/releases">read them on GitHub</a>.</li>`;
      return;
    }
    const md = window.WraithMarkdown;
    releasesEl.innerHTML = list.map((r, i) => {
      // "WraithVim v0.5.0 — git graph & easier keys" -> "git graph & easier keys"
      const fromName = r.name.replace(/^wraithvim\s+v?[\d.]+\s*[—–-]?\s*/i, "");
      // No subtitle in the release name? Use the notes' first heading.
      const title = fromName || ((r.body.match(/^#{1,6}\s+(.+)$/m) || [])[1] || "").replace(/[`*]/g, "");
      const body = md ? md.render(r.body) : `<pre>${esc(r.body)}</pre>`;
      return `<li class="rel${i === 0 ? " is-latest" : ""}">
        <details${i === 0 ? " open" : ""}>
          <summary>
            <span class="rel__tag">${esc(r.tag)}</span>
            <span class="rel__title">${esc(title)}</span>
            ${i === 0 ? '<span class="rel__badge">latest</span>' : ""}
            <time datetime="${esc(r.date)}" title="${esc(dateFmt.format(new Date(r.date)))}">${esc(ago(r.date))}</time>
          </summary>
          <div class="rel__body md">${body}</div>
          <a class="rel__link" href="${esc(r.url)}" rel="noopener">${esc(r.tag)} on GitHub →</a>
        </details>
      </li>`;
    }).join("");
  }
  async function loadStats() {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE) || "null"); } catch { /* ignore */ }
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) return applyStats(cached);
    // While loading, show stale notes if we have any.
    if (cached) renderReleases(cached.releases);
    try {
      const [repo, releases] = await Promise.all([
        fetch(API).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch(`${API}/releases?per_page=100`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      ]);
      const published = releases.filter((r) => !r.draft && !r.prerelease);
      const downloads = published.reduce(
        (sum, r) => sum + r.assets.filter((a) => a.name.endsWith(".tar.gz")).reduce((n, a) => n + a.download_count, 0),
        0,
      );
      const stats = {
        at: Date.now(),
        downloads,
        stars: repo.stargazers_count,
        version: published[0]?.tag_name || "latest",
        releases: published.slice(0, 10).map((r) => ({
          tag: r.tag_name, name: r.name || "", date: r.published_at, body: r.body || "", url: r.html_url,
        })),
      };
      try { localStorage.setItem(CACHE, JSON.stringify(stats)); } catch { /* private mode */ }
      applyStats(stats);
    } catch {
      if (cached) applyStats(cached); // stale is better than nothing
      else renderReleases(null);
    }
  }
  loadStats();

  /* ---------------------------------------------------------------- */
  /* Key reference */

  const KEYS = window.WRAITH_KEYS || { keys: [], groups: [], version: "" };
  const rowsEl = $("[data-key-rows]");
  const searchEl = $("[data-key-search]");
  const groupsEl = $("[data-key-groups]");
  const emptyEl = $("[data-key-empty]");
  let group = "All";
  $$("[data-keys-version]").forEach((el) => { el.textContent = KEYS.version ? `v${KEYS.version}` : ""; });

  function renderCombo(keys) {
    return keys.split(" ").map((token) => {
      const parts = token === "+" ? ["+"] : token.split("+");
      return `<span class="combo">${parts.map((p) => `<kbd>${esc(p)}</kbd>`).join("<i>+</i>")}</span>`;
    }).join("");
  }
  function mark(text, q) {
    if (!q) return esc(text);
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }
  function renderKeys() {
    if (!rowsEl) return;
    const q = (searchEl.value || "").trim().toLowerCase();
    const list = KEYS.keys.filter((k) => {
      if (group !== "All" && k.group !== group) return false;
      if (!q) return true;
      return `${k.keys} ${k.action} ${k.group} ${k.vim}`.toLowerCase().includes(q);
    });
    rowsEl.innerHTML = list.map((k) =>
      `<tr><td>${renderCombo(k.keys)}</td><td>${mark(k.action, q)}</td><td>${esc(k.group)}</td></tr>`,
    ).join("");
    emptyEl.hidden = list.length > 0;
  }
  if (groupsEl) {
    const names = ["All", ...KEYS.groups.filter((g) => KEYS.keys.some((k) => k.group === g))];
    groupsEl.innerHTML = names.map((g) =>
      `<button class="chip" type="button" aria-pressed="${g === group}" data-group="${esc(g)}">${esc(g)}</button>`,
    ).join("");
    groupsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-group]");
      if (!btn) return;
      group = btn.dataset.group;
      $$(".chip", groupsEl).forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
      renderKeys();
    });
    searchEl.addEventListener("input", renderKeys);
    renderKeys();
  }

  /* ---------------------------------------------------------------- */
  /* Vim-style keyboard: j/k, gg/G, /, :, Space menu, dashboard keys */

  const cmdline = $("[data-cmdline]");
  const cmdInput = $("#cmd-input");
  const siteWk = $("[data-site-wk]");
  const routes = { i: "#install", f: "#first-steps", k: "#keys", w: "#features", c: "#config", n: "#changelog" };
  const commands = {
    install: "#install", steps: "#first-steps", "first-steps": "#first-steps", keys: "#keys",
    features: "#features", config: "#config", top: "#dashboard", dashboard: "#dashboard",
    changelog: "#changelog", news: "#changelog", new: "#changelog",
  };
  let pendingG = false;

  const go = (hash) => {
    document.querySelector(hash)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    history.replaceState(null, "", hash);
  };
  const openCmd = () => { cmdline.hidden = false; cmdInput.value = ""; cmdInput.focus(); };
  const closeCmd = () => { cmdline.hidden = true; cmdInput.blur(); };
  const toggleWk = (show) => { siteWk.hidden = !show; };

  cmdline.addEventListener("submit", (e) => {
    e.preventDefault();
    const c = cmdInput.value.trim().replace(/^:/, "");
    closeCmd();
    if (!c) return;
    if (commands[c]) return go(commands[c]);
    if (c === "github" || c === "gh") return window.open(`https://github.com/${REPO}`, "_blank", "noopener");
    if (c === "help" || c === "h") return message("commands: install steps keys features config changelog top github");
    if (/^q(uit|a|all)?!?$/.test(c)) return message("Nothing to save. Close the tab when you're done ;)");
    if (/^\d+$/.test(c)) return window.scrollTo({ top: (Number(c) - 1) * lineH, behavior: reduceMotion ? "auto" : "smooth" });
    message(`E492: Not an editor command: ${c}`);
  });
  cmdInput.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCmd(); });

  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target instanceof Element ? e.target : document.body;
    if (t.matches("input, textarea, select, [contenteditable]")) {
      if (e.key === "Escape") t.blur();
      return;
    }
    if (!siteWk.hidden) {
      e.preventDefault();
      toggleWk(false);
      if (routes[e.key]) go(routes[e.key]);
      else if (e.key === "g") window.open(`https://github.com/${REPO}`, "_blank", "noopener");
      else if (e.key === "/") { go("#keys"); setTimeout(() => searchEl.focus({ preventScroll: true }), 350); }
      else if (e.key === ":") openCmd();
      return;
    }
    const k = e.key;
    if (k === " " && !t.closest("button, a")) { e.preventDefault(); toggleWk(true); return; }
    if (k === "Escape") { toggleWk(false); return; }
    if (k === "j") { window.scrollBy({ top: lineH * 3 }); return; }
    if (k === "k" && window.scrollY > 0 && currentId !== "dashboard") { window.scrollBy({ top: -lineH * 3 }); return; }
    if (k === "G") { e.preventDefault(); window.scrollTo({ top: document.documentElement.scrollHeight }); return; }
    if (k === "g") {
      if (pendingG) { window.scrollTo({ top: 0 }); pendingG = false; } else { pendingG = true; setTimeout(() => { pendingG = false; }, 600); }
      return;
    }
    if (k === "/") { e.preventDefault(); go("#keys"); setTimeout(() => searchEl.focus({ preventScroll: true }), 350); return; }
    if (k === ":") { e.preventDefault(); openCmd(); return; }
    // Like the real dashboard: single keys work while it is on screen.
    if (currentId === "dashboard" && routes[k]) { e.preventDefault(); go(routes[k]); }
  });
  document.addEventListener("click", (e) => { if (!siteWk.hidden && !e.target.closest("[data-site-wk]")) toggleWk(false); });

  /* ---------------------------------------------------------------- */
  /* Demo player: replays real WraithVim keystrokes in a mock window */

  const demo = $("[data-demo]");
  if (!demo) return;
  const ui = {
    pressed: $("[data-pressed]", demo),
    caption: $("[data-caption]", demo),
    typed: $("[data-typed]", demo),
    q: $("[data-q]", demo),
    results: $("[data-results]", demo),
    term: $("[data-term]", demo),
    mode: $("[data-mode]", demo),
    file: $("[data-file]", demo),
  };
  const lessons = $$(".lesson", document);
  const FILES = ["src/app.ts", "src/routes.ts", "src/server.ts", "package.json", "README.md", "tsconfig.json"];
  const ACTIONS = [
    ["Git: Graph (all branches)", "Space g g"], ["Git: Pull", "Space g Shift+P"], ["Git: Status", "Space g s"],
    ["Code: Format", "Space c f"], ["Terminal", "Space t"], ["Find file", "Space Space"],
  ];
  let run = 0; // increments to cancel the running scene

  const show = (...names) => { demo.dataset.show = names.join(" "); };
  const mode = (m) => { demo.dataset.mode = m; ui.mode.textContent = m.toUpperCase(); };
  function reset() {
    show();
    mode("normal");
    demo.dataset.tree = "open";
    ui.typed.textContent = "";
    ui.q.textContent = "";
    ui.results.innerHTML = "";
    ui.term.textContent = "";
    ui.pressed.innerHTML = "";
    ui.file.textContent = "src/app.ts";
  }
  function check(id) { if (id !== run) throw new Error("cancelled"); }
  async function wait(id, ms) { await sleep(reduceMotion ? 0 : ms); check(id); }
  async function press(id, ...keys) {
    for (const key of keys) {
      ui.pressed.insertAdjacentHTML("beforeend", renderCombo(key));
      await wait(id, 380);
    }
  }
  async function type(id, el, text, speed = 70) {
    for (const ch of text) { el.textContent += ch; await wait(id, speed); }
  }
  function renderPicks(items, q, sel = 0) {
    const lq = q.toLowerCase();
    const list = items.filter(([label]) => label.toLowerCase().includes(lq)).slice(0, 5);
    ui.results.innerHTML = list.map(([label, keys], i) =>
      `<div class="pick${i === sel ? " is-sel" : ""}"><span>${mark(label, lq)}</span><span class="kk">${esc(keys || "")}</span></div>`,
    ).join("");
  }
  const caption = (text) => { ui.caption.textContent = text; };

  const scenes = {
    async modes(id) {
      caption("i to type · Esc to stop");
      await press(id, "i"); mode("insert");
      await type(id, ui.typed, "  // ready to ship", 55);
      await wait(id, 400);
      await press(id, "Esc"); mode("normal");
      await wait(id, 900);
    },
    async space(id) {
      demo.dataset.tree = "closed";
      caption("Space shows what you can press next");
      await wait(id, 500);
      await press(id, "Space"); show("wk");
      await wait(id, 1600);
      await press(id, "e"); show(); demo.dataset.tree = "open";
      caption("Space e — explorer");
      await wait(id, 1100);
    },
    async find(id) {
      caption("Space Space — find a file by name");
      await press(id, "Space", "Space"); show("picker");
      renderPicks(FILES.map((f) => [f]), "");
      await wait(id, 300);
      for (const ch of "rout") { ui.q.textContent += ch; renderPicks(FILES.map((f) => [f]), ui.q.textContent); await wait(id, 160); }
      await wait(id, 500);
      await press(id, "Enter"); show();
      ui.file.textContent = "src/routes.ts";
      await wait(id, 900);
    },
    async terminal(id) {
      caption("Ctrl+Shift+` — terminal at the bottom");
      await press(id, "Ctrl+Shift+`"); show("term"); mode("terminal");
      await wait(id, 400);
      await type(id, ui.term, "npm run dev", 75);
      await wait(id, 700);
      await press(id, "Esc", "Esc"); mode("normal");
      caption("Esc Esc to scroll · click Hide to tuck it away");
      await wait(id, 1100);
      show();
      await wait(id, 500);
    },
    async palette(id) {
      caption("Space p — search every action by name");
      await press(id, "Space", "p"); show("picker");
      renderPicks(ACTIONS, "");
      await wait(id, 300);
      for (const ch of "graph") { ui.q.textContent += ch; renderPicks(ACTIONS, ui.q.textContent); await wait(id, 150); }
      await wait(id, 500);
      await press(id, "Enter"); show("graph");
      await wait(id, 1600);
    },
    async graph(id) {
      caption("Space g g — every branch at a glance");
      await press(id, "Space", "g", "g"); show("graph");
      await wait(id, 1800);
      await press(id, "g", "q"); show();
      await wait(id, 600);
    },
  };
  const order = lessons.map((l) => l.dataset.scene);

  async function play(name, loop) {
    const id = ++run;
    let i = order.indexOf(name);
    try {
      do {
        const scene = order[i];
        lessons.forEach((l) => l.classList.toggle("is-playing", l.dataset.scene === scene));
        reset();
        await scenes[scene](id);
        i = (i + 1) % order.length;
      } while (loop && !reduceMotion);
    } catch { /* cancelled by another play() */ }
  }

  lessons.forEach((l) => {
    l.tabIndex = 0;
    l.setAttribute("role", "button");
    const start = () => play(l.dataset.scene, !reduceMotion);
    l.addEventListener("click", start);
    l.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); start(); } });
  });
  $("[data-replay]", demo).addEventListener("click", () => {
    const current = lessons.find((l) => l.classList.contains("is-playing"));
    play(current ? current.dataset.scene : order[0], !reduceMotion);
  });

  // Play while visible; pause (cancel) when scrolled away to save CPU.
  reset();
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const current = lessons.find((l) => l.classList.contains("is-playing"));
          play(current ? current.dataset.scene : order[0], !reduceMotion);
        } else {
          run++;
        }
      }
    }, { threshold: 0.35 }).observe(demo);
  }
})();

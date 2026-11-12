#!/usr/bin/env node
// Screenshot the site section by section through the Chrome DevTools
// Protocol, and report JavaScript errors. No dependencies (Node >= 22).
//
//   node scripts/shoot.mjs [--width 1440 --height 900] [--out .shots] [--eval "js"]

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const width = Number(args.width || 1440);
const height = Number(args.height || 900);
const out = resolve(args.out || ".shots");
const chrome = process.env.CHROME || "google-chrome-stable";
const sections = (args.sections || "dashboard,install,first-steps,keys,features,config").split(",");
const port = 9300 + Math.floor(Math.random() * 500);
const page = args.url || pathToFileURL(resolve("index.html")).href;
mkdirSync(out, { recursive: true });

const proc = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "wv-shot-"))}`, `--window-size=${width},${height}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === "page");
  } catch { await sleep(100); }
}
if (!target) { proc.kill(); throw new Error("Chrome did not start"); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") errors.push(msg.params.entry.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
await send("Page.enable");
await send("Page.navigate", { url: page });
await sleep(2500); // fonts, GitHub stats, first paint

async function shot(name) {
  const { result } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(out, `${name}.png`), Buffer.from(result.data, "base64"));
  console.log(`saved ${name}.png`);
}

if (args.eval) console.log("eval:", JSON.stringify(await evaluate(args.eval)));
for (const s of sections) {
  await evaluate(`document.getElementById(${JSON.stringify(s)}).scrollIntoView({ behavior: "instant" })`);
  await sleep(Number(args.wait || 1400));
  await shot(`${width}-${s}`);
}
console.log(errors.length ? `JS errors:\n- ${errors.join("\n- ")}` : "no JS errors");
ws.close();
proc.kill();

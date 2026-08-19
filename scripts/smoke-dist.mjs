/* 実行時スモーク — dist の全ページを headless Chrome で実際に開き、
   未捕捉のJS例外（pageerror）が1件でもあれば非0で終了する（デプロイ中止）。
   背景（2026-08-19 の障害）: define:vars の渡し漏れは型チェックもビルドも通り、
   実行して初めて ReferenceError で My Page 全体が死んだ。「ページがある」検査
   （safe-deploy §3）だけでは足りず、「JSが動く」までを機械で確認する。
   - 対象: dist 配下の index.html 全ページ（抜き取りにしない・発注者指示「徹底的に」）
   - 失敗条件: pageerror（未捕捉例外）のみ。console.error や外部リソースの失敗は
     警告として出すが止めない（ネットワーク起因のブレでデプロイを塞がないため）
   - 依存: puppeteer-core ＋ ローカルの Google Chrome */
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = new URL("../dist/", import.meta.url).pathname;
const CHROME = process.env.SMOKE_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CONCURRENCY = 8;
const SETTLE_MS = 1800;   // load 後にJSが走り切るのを待つ時間

if (!existsSync(ROOT)) { console.error("✗ dist がありません（先にビルド）"); process.exit(1); }
if (!existsSync(CHROME)) { console.error(`✗ Chrome が見つかりません: ${CHROME}（SMOKE_CHROME で指定可）`); process.exit(1); }

// ── dist の全ページを列挙 ──
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : e.name === "index.html" ? [`/${dir ? dir + "/" : ""}`] : []);
const pages = walk("").map((p) => p.replaceAll("\\", "/"));

// ── dist を配信する最小サーバー ──
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".json": "application/json",
  ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff" };
const server = createServer((req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    let file = join(ROOT, path);
    if (!existsSync(file)) file = join(ROOT, path, "index.html");
    const body = readFileSync(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ["--no-first-run", "--disable-extensions", "--mute-audio"] });

const failures = [];   // { path, errors: [] }
const warnings = [];
async function check(path) {
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).split("\n")[0].slice(0, 160)));
  page.on("console", (msg) => { if (msg.type() === "error") warnings.push(`${path} console: ${msg.text().slice(0, 120)}`); });
  try {
    await page.goto(base + path, { waitUntil: "load", timeout: 30000 });
    await new Promise((r) => setTimeout(r, SETTLE_MS));
  } catch (e) {
    errs.push(`load失敗: ${String(e).slice(0, 120)}`);
  }
  await page.close();
  return errs;
}

let done = 0;
const queue = [...pages];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const path = queue.shift();
    let errs = await check(path);
    if (errs.length) errs = await check(path);   // ネットワーク起因のブレ対策に1回だけ再試行
    if (errs.length) failures.push({ path, errs });
    done++;
    if (done % 40 === 0) console.log(`  …${done}/${pages.length}`);
  }
}));
await browser.close();
server.close();

if (warnings.length) {
  console.log(`⚠ console.error ${warnings.length}件（デプロイは止めない・多発するなら要調査）`);
  [...new Set(warnings)].slice(0, 8).forEach((w) => console.log("  - " + w));
}
if (failures.length) {
  console.error(`\n✗ JSエラーのあるページ ${failures.length}/${pages.length}`);
  failures.forEach((f) => { console.error(`  ${f.path}`); f.errs.forEach((e) => console.error(`    - ${e}`)); });
  process.exit(1);
}
console.log(`✓ 実行時スモーク: ${pages.length}ページすべてJSエラーなし`);

/* テンプレートに台帳の数字を埋める（2026-09-03・design_report_from_ledger_20260903.md）
 * 使い方: node tools/report-build.mjs [name ...]   （省略時は reports/*.tpl.html すべて）
 * 出力:   reports/out/<name>.html  ＋ 末尾に「この文書の数字の出どころ」表 */
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { values } from "./report-values.mjs";

const yen = (n) => "¥" + Math.round(Number(n)).toLocaleString("en-US");
const fmt = (raw, mode) => {
  if (mode === "raw" || typeof raw === "string") return String(raw);
  if (mode === "pct") return (Number(raw) * 100).toFixed(2).replace(/\.00$/, "") + "%";
  if (mode === "num") return Math.round(Number(raw)).toLocaleString("en-US");
  return yen(raw);
};


/* 章から結論文を引く（2026-09-03 発注者指示「要約カードはコピーすら、各章のコピーを
   SSoTとして引っ張ってくるように」）。
   章のテンプレート側に <span data-copy="キー">…</span> を置き、
   要約側は {{copy:キー}} と書く。文を2箇所に書かないための仕組み。 */
async function collectCopy() {
  const map = new Map();
  for (const t of await readdir("../reports")) {
    if (!t.endsWith(".tpl.html") || t.startsWith("summary")) continue;
    const s = await readFile(`../reports/${t}`, "utf8");
    for (const m of s.matchAll(/<span\s+data-copy="([^"]+)"[^>]*>([\s\S]*?)<\/span>/g)) {
      if (map.has(m[1])) {
        console.error(`✗ data-copy="${m[1]}" が複数の章にあります（${map.get(m[1]).from} と ${t}）`);
        process.exit(1);
      }
      map.set(m[1], { text: m[2].trim(), from: t.replace(".tpl.html", "") });
    }
  }
  return map;
}
const COPY = await collectCopy();

const V = await values();
await mkdir("../reports/out", { recursive: true });
const only = process.argv.slice(2);
const tpls = (await readdir("../reports")).filter((f) => f.endsWith(".tpl.html"))
  .filter((f) => !only.length || only.includes(f.replace(".tpl.html", "")));
if (!tpls.length) { console.error("テンプレートが見つかりません"); process.exit(1); }

let failed = 0;
for (const t of tpls) {
  const name = t.replace(".tpl.html", "");
  const src = await readFile(`../reports/${t}`, "utf8");
  const used = new Set(); const missing = new Set(); const usedCopy = new Map();
  const missingCopy = new Set();
  let out = src.replace(/\{\{copy:([A-Za-z0-9_.-]+)\}\}/g, (_, key) => {
    const c = COPY.get(key);
    if (!c) { missingCopy.add(key); return `{{copy:${key}}}`; }
    usedCopy.set(key, c);
    return c.text;
  });
  out = out.replace(/\{\{([A-Za-z0-9_.]+)(?:\|(raw|pct|num))?\}\}/g, (_, key, mode) => {
    const e = V[key];
    if (!e) { missing.add(key); return `{{${key}}}`; }
    used.add(key);
    return fmt(e.v, mode);
  });
  if (missingCopy.size) {
    console.error(`✗ ${t}: 章に無い data-copy キー ${[...missingCopy].join(", ")}`);
    failed++; continue;
  }
  if (missing.size) {
    console.error(`✗ ${t}: 定義のないキー ${[...missing].join(", ")}`);
    console.error("   → tools/report-values.mjs に追加してください（src 必須）");
    failed++; continue;
  }
  /* 出どころの表を末尾に付ける。今日の訂正6回は、これがあれば発注者が即座に見抜けた */
  const rows = [...used].sort().map((k) =>
    `<tr><td><code>${k}</code></td><td class="num">${fmt(V[k].v)}</td><td class="dim">${V[k].src}</td></tr>`).join("\n");
  const copyRows = [...usedCopy].sort().map(([k, c]) =>
    `<tr><td><code>copy:${k}</code></td><td class="dim">—</td><td class="dim">${c.from}.tpl.html の data-copy="${k}"</td></tr>`).join("\n");
  const foot = `
<h2 id="src"><span class="n">SRC</span>この文書の数字の出どころ</h2>
<p class="dim">この表と本文の数字は <code>node tools/report-build.mjs</code> が台帳から生成した。
<strong>テンプレートに金額は書かれていない</strong>（<code>tools/reportcheck.mjs</code> がCIで検査）。</p>
<div class="tbl"><table>
<thead><tr><th>キー</th><th class="num">値</th><th>出どころ</th></tr></thead>
<tbody>
${rows}
${copyRows}
</tbody></table></div>
<p class="dim">生成 ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC ／ 基準日 ${V["asOf"].v}</p>
`;
  const final = out.includes("<footer") ? out.replace("<footer", foot + "<footer") : out + foot;
  await writeFile(`../reports/out/${name}.html`, final);
  console.log(`✓ reports/out/${name}.html  （${used.size}個の数字を台帳から埋めた）`);
}
process.exit(failed ? 1 : 0);

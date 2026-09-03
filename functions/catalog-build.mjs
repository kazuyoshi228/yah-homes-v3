/* カタログを ①Firestore の catalog コレクション ②docs/catalog.md に出す（2026-09-03）
 * 使い方: node catalog-build.mjs         … md だけ生成（書き込みなし）
 *         node catalog-build.mjs --write … Firestore にも書く */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writeFile } from "node:fs/promises";
import { CATALOG, DERIVED } from "./catalog-def.mjs";

if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: "yah-homes" });
const db = getFirestore("agency");
const write = process.argv.includes("--write");

/* 実測を添える。件数と主なフィールドは台帳から取る——手で書くと必ずずれる */
const live = {};
for (const c of Object.keys(CATALOG)) {
  const s = await db.collection(c).get();
  const f = new Map();
  for (const d of s.docs) for (const k of Object.keys(d.data())) f.set(k, (f.get(k) ?? 0) + 1);
  live[c] = { count: s.size,
    fields: [...f].filter(([, n]) => n / Math.max(1, s.size) >= 0.5).map(([k]) => k).sort() };
}

/* 台帳に無いコレクションを見つける（カタログの取りこぼし） */
const all = (await db.listCollections()).map((c) => c.id).filter((c) => !c.startsWith("_"));
const uncatalogued = all.filter((c) => !CATALOG[c] && c !== "catalog");

const md = [];
md.push("# 台帳のカタログ（どの数字がどこにあるか）", "");
md.push("**自動生成**: `node functions/catalog-build.mjs`。手で編集しない——定義は `functions/catalog-def.mjs`。", "");
md.push("台帳を探す前にここを読む。**とくに「ここには無い」の欄**——", "");
md.push("> 2026-09-03、AIが「土地の取得原価は台帳にない」と断言した。実際は `items` の `kind=\"acquisition\"` に27件あった。", "");
md.push("## 数字を探すときの入口", "");
md.push("| 探しているもの | どこにあるか |", "|---|---|");
const INDEX = [
  ["土地の取得原価（簿価）", "`items` の `kind=\"acquisition\"`"],
  ["建物・家具の取得原価と簿価", "`depreciation` の `cost` / `bookValue`"],
  ["借入の元本", "`finance` の `principal`（`entity` で法人と個人を分ける）"],
  ["借入の残債", "保存されていない。`loanState()` が計算する"],
  ["30年の資金繰り・企業価値", "保存されていない。`cashflow()` が計算する"],
  ["月ごとの売上", "`revenue`"],
  ["光熱費", "契約は `utilities`、実際の請求は `utilityBills`（拠点ごと。棟への按分は `derive.ts`）"],
  ["公示地価", "`landComps` の `unitPrice`"],
  ["還元利回り・税率・NOIの定義", "`assumptions`（`status` を必ず見る）"],
];
for (const [q, a] of INDEX) md.push(`| ${q} | ${a} |`);
md.push("");
md.push("## コレクション", "");
for (const [id, c] of Object.entries(CATALOG)) {
  const L = live[id] ?? { count: 0, fields: [] };
  md.push(`### \`${id}\` — ${c.label}`, "");
  md.push(`**${L.count}件**${c.amountField ? ` ／ 金額の列: \`${c.amountField}\`` : " ／ 金額なし"}`, "");
  for (const h of c.holds ?? []) md.push(`- ${h}`);
  if (c.notHere) md.push("", `> **ここには無い**: ${c.notHere}`);
  if (c.caution) md.push("", `> ⚠️ ${c.caution}`);
  if (c.relatedTo?.length) md.push("", `関連: ${c.relatedTo.map((r) => `\`${r}\``).join(" / ")}`);
  md.push("", `<sub>主なフィールド: ${L.fields.join(", ") || "—"}</sub>`, "");
}
md.push("## 保存していない数字（計算で出す）", "");
for (const [k, v] of Object.entries(DERIVED)) {
  md.push(`### ${k}`, "", `**${v.where}**`, "");
  if (v.caution) md.push(`> ⚠️ ${v.caution}`, "");
}
if (uncatalogued.length) {
  md.push("## カタログに載っていないコレクション", "");
  md.push("運用ログ・キャッシュ・外部データの取り込みなど。**金額の一次事実はここには無い。**", "");
  md.push(uncatalogued.map((c) => `\`${c}\``).join(" / "), "");
}
md.push("---", "", `<sub>生成 ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC ／ 対象 ${Object.keys(CATALOG).length}コレクション（台帳全体は ${all.length}）</sub>`);
await writeFile("../docs/catalog.md", md.join("\n"));
console.log(`✓ docs/catalog.md（${Object.keys(CATALOG).length}コレクション・カタログ外 ${uncatalogued.length}）`);

if (write) {
  const batch = db.batch();
  for (const [id, c] of Object.entries(CATALOG)) {
    batch.set(db.collection("catalog").doc(id), {
      kind: "catalog", ...c, count: live[id].count, fields: live[id].fields,
      generatedFrom: "functions/catalog-def.mjs", updatedAt: new Date().toISOString(),
      updatedBy: "kazuyoshi.yamada@bonfire.co.jp",
    });
  }
  batch.set(db.collection("catalog").doc("_derived"), {
    kind: "catalog", label: "保存していない数字（計算で出す）", derived: DERIVED,
    uncatalogued, updatedAt: new Date().toISOString(),
  });
  await batch.commit();
  console.log(`✓ Firestore catalog に ${Object.keys(CATALOG).length + 1}件を書き込み`);
}

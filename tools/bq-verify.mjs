/* BigQuery の数字が、アプリの数字と一致しているかを見る（2026-09-03）。
 *
 * なぜ要るか: 2026-09-02 に NOI が4か所で違う数字を指していた。式は derive.ts に集約し
 * derivecheck.mjs がCIで見張るようにしたが、【SQL側は守れていなかった】。
 * 実際、初回の VIEW は光熱費を引き忘れて 高砂 +¥513,996 ずれていた（2026-09-03）。
 * 名前だけ同じで中身が違う数字は、いちばん危ない。だから突き合わせる。
 *
 * あわせて【同期の鮮度】も見る。エクスポートが止まっても画面は出てしまうので、
 * 古い数字を分析に使う事故が起きうる（2026-09-02 融資カードが落ちても画面が出た件と同じ形）。
 *
 * 使い方: node tools/bq-verify.mjs
 * 前提: gcloud auth login 済み・bq が使えること・GOOGLE_APPLICATION_CREDENTIALS
 */
import { execFileSync } from "node:child_process";
import admin from "firebase-admin";

const PROJECT = "yah-homes";
const DATASET = "agency";
const MAX_AGE_HOURS = 36;          // 日次同期なので、36時間を超えたら遅れとみなす

const bq = (sql) => JSON.parse(execFileSync("bq", [
  `--project_id=${PROJECT}`, "--location=asia-northeast1", "--format=json",
  "query", "--use_legacy_sql=false", "--quiet", sql,
], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));

const yen = (n) => "¥" + Math.round(Number(n)).toLocaleString();
let bad = 0;

/* ── 1. 鮮度 ── いつのデータを見ているか */
console.log("── 同期の鮮度 ──");
const fresh = bq(`SELECT table_id,
  TIMESTAMP_MILLIS(last_modified_time) AS updated,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), TIMESTAMP_MILLIS(last_modified_time), HOUR) AS age_h
  FROM \`${PROJECT}.${DATASET}.__TABLES__\`
  WHERE type = 1 ORDER BY last_modified_time LIMIT 3`);
for (const r of fresh) {
  const age = Number(r.age_h);
  const mark = age > MAX_AGE_HOURS ? "✗" : "✓";
  if (age > MAX_AGE_HOURS) bad++;
  console.log(`  ${mark} ${r.table_id.padEnd(22)} ${age} 時間前`);
}
if (bad) console.log(`  → ${MAX_AGE_HOURS}時間を超えています。エクスポートが止まっているかもしれません`);

/* ── 2. 数字の一致 ── アプリの式（derive.ts）と BigQuery を突き合わせる */
console.log("\n── アプリと BigQuery の突き合わせ ──");
admin.initializeApp({ projectId: PROJECT });
const { propertyNoi } = await import("../functions/lib/agency/derive.js");
const propsMod = await import("../functions/lib/agency/props.js");
const propsFn = Object.values(propsMod).find((f) => typeof f === "function");
const app = await propsFn();
const appRows = (app.rows ?? app.props ?? []).filter((r) => r.noi != null);

const sqlRows = bq(`SELECT prop, label, stay_payout_y, other_income_y, tax_y, ins_y, reserve_y
  FROM \`${PROJECT}.${DATASET}.v_property_revenue\``);

for (const s of sqlRows) {
  const a = appRows.find((r) => r.id === s.prop || r.label === s.label);
  if (!a) { console.log(`  ? ${s.label}: アプリ側に見当たりません`); bad++; continue; }
  /* SQLは光熱費を持たない（均等割りで places と稼働棟数に依存するため再現しない）。
     アプリの光熱費を借りて、同じ式に入れて比べる——式そのものは derive.ts の1本 */
  const rebuilt = propertyNoi({
    stayPayout: Number(s.stay_payout_y), otherIncome: Number(s.other_income_y),
    utilities: Number(a.utilities ?? 0), tax: Number(s.tax_y), insurance: Number(s.ins_y),
  });
  const diff = rebuilt - Number(a.noi);
  const ok = Math.abs(diff) <= 1;      // 円未満の丸めは許す
  if (!ok) bad++;
  console.log(`  ${ok ? "✓" : "✗"} ${String(s.label).padEnd(6)} アプリ ${yen(a.noi).padStart(13)}` +
    `  BQの部品で組み直し ${yen(rebuilt).padStart(13)}` + (ok ? "" : `  差 ${yen(diff)}`));
}

console.log(bad
  ? `\n✗ ${bad}件の食い違い。derive.ts と bq-views.sql のどちらかがずれています`
  : "\n✓ 一致しています（同期も新しい）");
process.exit(bad ? 1 : 0);

/* Firestore と BigQuery の件数を突き合わせる（2026-09-03）
 * 1件でも違えば exit 1。「同期は動いているが中身が欠けている」を止める */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { execSync } from "node:child_process";

if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: "yah-homes" });
const db = getFirestore("agency");
const cols = process.argv.slice(2);
if (!cols.length) { console.error("コレクション名を渡してください"); process.exit(2); }

const bq = Object.fromEntries(
  execSync('bq --project_id=yah-homes query --nouse_legacy_sql --format=csv ' +
    '"SELECT table_id, row_count FROM agency.__TABLES__"', { maxBuffer: 1e7 })
    .toString().split("\n").slice(1).filter(Boolean)
    .map((l) => { const [a, b] = l.split(","); return [a.trim(), Number(b)]; }));

let bad = 0;
for (const c of cols) {
  const f = (await db.collection(c).count().get()).data().count;
  const b = bq[c] ?? 0;
  if (f !== b) { console.error(`   ✗ ${c.padEnd(22)} Firestore ${String(f).padStart(6)} / BigQuery ${String(b).padStart(6)}`); bad++; }
}
console.log(bad ? `\n   不一致 ${bad}件 — 同期をやり直してください` : `   全${cols.length}テーブル一致`);

/* 同期の結果を台帳に残す。止まっても画面は出るのが、いちばん危ない——
   health がこれを見て、古ければ赤にする（2026-09-03 design_agency_db_review D案） */
await db.collection("catalog").doc("_sync").set({
  kind: "catalog", label: "BigQuery 同期の状態",
  syncedAt: new Date().toISOString(),
  collections: cols.length, mismatched: bad, ok: bad === 0,
  note: "tools/bq-sync.sh が書く。health が鮮度を見て、古ければカードのドットを落とす",
});
console.log(`   catalog/_sync を更新（${bad === 0 ? "一致" : "不一致あり"}）`);
process.exit(bad ? 1 : 0);

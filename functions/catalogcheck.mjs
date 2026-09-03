/* カタログの取りこぼしを止める（2026-09-03・design_agency_db_review_20260903.md A案）
 * 台帳へ接続せず静的に検査する（CIで回すため）
 * ① 金額の一次事実を持つコレクションが catalog-def.mjs に載っているか
 * ② 各エントリに notHere があるか（「ここには無い」が要点なので、空を許さない）
 * ③ relatedTo の相手がカタログに存在するか */
import { CATALOG, DERIVED } from "./catalog-def.mjs";

/* 金額の一次事実を持つコレクション。増えたらここに足す——足し忘れたらCIが落ちる */
const MONEY_COLLECTIONS = [
  "items", "depreciation", "bsAdjustments", "finance", "properties", "landComps",
  "revenue", "utilities", "utilityBills", "buildPayments", "construction",
  "reserves", "taxes", "insurance", "personalAssets", "equipment", "contracts",
  "cash", "bankBalances",
];

let bad = 0;
for (const c of MONEY_COLLECTIONS) {
  if (!CATALOG[c]) { console.error(`✗ ${c}: 金額を持つのに catalog-def.mjs に無い`); bad++; }
}
for (const [id, c] of Object.entries(CATALOG)) {
  if (!c.label) { console.error(`✗ ${id}: label が無い`); bad++; }
  if (!c.notHere && !c.caution) {
    console.error(`✗ ${id}: notHere（ここには無い）も caution も無い`);
    console.error("    → 探している側が「無い」を確かめられない。カタログの要点はここ");
    bad++;
  }
  for (const r of c.relatedTo ?? []) {
    if (!CATALOG[r]) { console.error(`✗ ${id}.relatedTo: "${r}" がカタログに無い`); bad++; }
  }
}
for (const [k, v] of Object.entries(DERIVED)) {
  if (!v.where) { console.error(`✗ 導出「${k}」: where が無い`); bad++; }
}
console.log(bad ? `\nカタログの検査: ${bad}件`
  : `カタログの検査: 違反なし（${Object.keys(CATALOG).length}コレクション・導出 ${Object.keys(DERIVED).length}）`);
process.exit(bad ? 1 : 0);

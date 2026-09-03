/* assumptions に status を入れる（2026-09-03・design_agency_db_review C案）
 *
 * なぜ: 24件のうち status があるのは family-fund と target-model の2件だけだった。
 * 残り22件は「決定なのか検討中なのか」が読めない。
 * 2026-09-03、cap-rate 6.0%（＝収益仲介1件の回答）を確定した数字として扱った。
 *
 *   confirmed   … 発注者が決めた／申告書や契約書の確定値
 *   provisional … 暫定。根拠はあるが、確認待ち（税理士・仲介・見積）
 *   proposed    … 提案。承認を取っていない
 *
 * 使い方: node status-backfill.mjs         … 変更内容を出すだけ
 *         node status-backfill.mjs --write … 台帳へ書く */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/* 分類の根拠は各行のコメントに書く。迷ったら provisional に倒す——
   確定として扱われるほうが危ないため */
const STATUS = {
  "corporate-tax":        ["confirmed",   "段階税率は発注者決定（2026-09-01）。繰越欠損金は申告書の確定値"],
  "noi-definition":       ["confirmed",   "発注者決定（2026-09-01）。derive.ts が実装の正本"],
  "reserve-plan":         ["confirmed",   "発注者決定。月額は台帳の値"],
  "management-fee":       ["confirmed",   "運営委託契約の条件"],
  "officer-comp":         ["confirmed",   "役員報酬0円は発注者の方針"],
  "overhead":             ["confirmed",   "会社維持経費の実績"],
  "revenue-lag":          ["confirmed",   "入金サイトの実績"],
  "portfolio-plan":       ["confirmed",   "取得済み・計画中の棟の一覧"],
  "nomura-web-loan":      ["confirmed",   "証券会社の契約条件"],
  "lifecycle":            ["confirmed",   "発注者決定の耐用年数"],
  "valuation":            ["confirmed",   "企業価値の式は発注者決定（2026-09-01）"],
  "insurance-units":      ["confirmed",   "保険会社の単価表"],

  "cap-rate":             ["provisional", "収益仲介【1件】の回答。複数社に確認するまで暫定（2026-09-03）"],
  "consumption-tax":      ["provisional", "税込経理は暫定。税理士の確認が要る（2026-09-03）"],
  "personal-income":      ["provisional", "分配金の見込み。実績を追う必要がある"],
  "repair-placeholder":   ["provisional", "設備が未登録の棟の仮置き"],
  "land-screening":       ["provisional", "採点の閾値。実績 n=0"],
  "teiten-baseline":      ["provisional", "定点の基準値。運用しながら調整する"],
  "teiten-freshness":     ["provisional", "同上"],
  "succession-readiness": ["provisional", "事業承継の準備状況。未確認の項目を含む"],
  "social-contribution":  ["provisional", "候補の検討段階"],
  "strategy-doc":         ["provisional", "提案書へのリンク。中身は検討中"],

  "family-fund":          ["proposed",    "年4%への切替。発注者の承認は未取得（2026-09-03）"],
  "target-model":         ["proposed",    "20%削減シナリオ。見積は1本も取っていない（2026-09-03）"],
};

if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: "yah-homes" });
const db = getFirestore("agency");
const write = process.argv.includes("--write");
const snap = await db.collection("assumptions").get();

let n = 0, skip = 0;
const missing = [];
for (const d of snap.docs) {
  const cur = d.data().status;
  const want = STATUS[d.id];
  if (!want) { missing.push(d.id); continue; }
  if (cur === want[0]) { skip++; continue; }
  console.log(`  ${d.id.padEnd(24)} ${String(cur ?? "—").padEnd(12)} → ${want[0].padEnd(12)} ${want[1]}`);
  if (write) {
    await d.ref.set({ status: want[0], statusReason: want[1],
      updatedAt: new Date().toISOString(), updatedBy: "kazuyoshi.yamada@bonfire.co.jp",
      updatedByKind: "human" }, { merge: true });
  }
  n++;
}
if (missing.length) {
  console.error(`\n✗ 分類が無い assumptions: ${missing.join(", ")}`);
  console.error("   → status-backfill.mjs の STATUS に足してください（迷ったら provisional）");
}
console.log(`\n${write ? "書き込み" : "変更予定"} ${n}件 ／ 変更なし ${skip}件${missing.length ? ` ／ 未分類 ${missing.length}件` : ""}`);
process.exit(missing.length ? 1 : 0);

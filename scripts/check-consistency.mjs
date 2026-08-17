#!/usr/bin/env node
/**
 * 公開表記の整合チェック（docs/plan_refactor_and_conversion_202608.md §7-3）
 *
 * 2026-08-16、チェックアウト時刻が日本語だけ 10:00・英韓繁タイは 11:00 という
 * 事故が長期間気づかれずに残っていた。5言語×2物件×複数箇所に散らばる数値は
 * 人間のレビューでは検出できない。機械的に落とす以外に再発を防ぐ方法がない。
 *
 * 実行: node scripts/check-consistency.mjs   （終了コード 1 で失敗）
 */
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** コメントを除いた本文。経緯を書いたコメント内の旧数値を誤検出しないため。 */
const readCode = (p) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const errors = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);

// ── SSoT を読む（Firestore property_facts）──
// propertyFacts.ts の DEFAULTS は廃止した（Firestore とズレる影のコピーだったため）。
// ここでも同じ Firestore を見るので、検査の基準と本番の表示が必ず一致する。
const facts = read("src/lib/propertyFacts.ts");
const PROJECT = (facts.match(/const PROJECT = ["`]([^"`]+)["`]/) ?? [])[1];
if (!PROJECT) { console.error("✗ propertyFacts.ts から Firebase プロジェクトIDを読めませんでした"); process.exit(1); }
const REST = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/property_facts`;
const fsVal = (v) => v?.stringValue ?? v?.integerValue ?? String(v?.doubleValue ?? "");
let ssot;
try {
  const json = await fetch(REST, { signal: AbortSignal.timeout(8000) }).then((r) => r.json());
  ssot = {};
  for (const doc of json.documents ?? []) {
    const key = doc.name.split("/").pop();
    if (key !== "kiyokawa" && key !== "takasago") continue;
    const f = doc.fields ?? {};
    ssot[key] = {
      capacity: fsVal(f.capacity), rating: fsVal(f.rating), reviewCount: fsVal(f.reviewCount),
      checkinTime: fsVal(f.checkinTime), checkoutTime: fsVal(f.checkoutTime),
    };
  }
  if (!ssot.kiyokawa || !ssot.takasago) throw new Error("property_facts が揃っていません");
} catch (e) {
  console.error(`✗ SSoT（Firestore）を読めませんでした: ${String(e).slice(0, 100)}`);
  console.error("  表記の整合を検査できないため中止します。\n");
  process.exit(1);
}

const PROP_FILES = { kiyokawa: "src/data/kiyokawaData.ts", takasago: "src/data/takasagoData.ts" };

// ── 1. 提供していない決済手段を書いていないか ──
// 実際は Stripe のカード決済のみ・全額前払い・現地払いなし（2026-08-16 発注者確認）
const FORBIDDEN = [
  ["銀行振込", "銀行振込は提供していない"],
  ["bank transfer", "銀行振込は提供していない"],
  ["銀行轉帳", "銀行振込は提供していない"],
  ["계좌이체", "銀行振込は提供していない"],
  ["โอนเงิน", "銀行振込は提供していない"],
];
for (const [file, path] of [...Object.entries(PROP_FILES), ["faq", "src/data/faqData.ts"]]) {
  const src = read(path);
  for (const [term, why] of FORBIDDEN) {
    if (src.includes(term)) fail(path, `禁止語「${term}」を検出（${why}）`);
  }
}

// ── 2. チェックイン/チェックアウト時刻が全言語で SSoT と一致するか ──
// 落とし穴が2つある。初版はどちらも踏んだので、対策をコードに残す。
//  (1) 「Check-in: 4:00 PM – 10:00 PM. Check-out: by 11:00 AM.」のように1行に両方入る。
//      行全体を見ると誤って合格するので、キーワードより後ろだけを見る。
//  (2) 「チェックイン日の8日前」「抵達前 24 小時」を時刻と誤読する。
//      コロン付き・AM/PM・時/시/點 のいずれかを伴うものだけを時刻とみなす。
const KEYWORDS = {
  in:  /(check-?in|チェックイン|체크인|入住|เช็คอิน)/i,
  out: /(check-?out|チェックアウト|체크아웃|退房|เช็คเอา)/i,
};
const TIME_TOKEN = /(\d{1,2})\s*(?::\s*\d{2}|\s*(?:AM|PM)\b|\s*[時시點点])/i;
/** テキスト先頭から最初の「時刻」を24時間制の時で返す。時刻が無ければ null。 */
function firstHour(text) {
  const m = text.match(TIME_TOKEN);
  if (!m) return null;
  let h = Number(m[1]);
  const before = text.slice(Math.max(0, (m.index ?? 0) - 6), (m.index ?? 0) + m[0].length + 4);
  if (/PM|오후|下午|晚上/i.test(before) && h < 12) h += 12;
  return h;
}
// 時刻を宣言している構造化フィールドだけを見る（自由文のFAQは対象外＝誤検出の元）
const TIME_FIELDS = /(^\s*time:\s*"|^\s*checkout:\s*"|icon:\s*"checkin-time")/;
for (const [key, path] of Object.entries(PROP_FILES)) {
  const wantIn = Number(ssot[key].checkinTime.split(":")[0]);
  const wantOut = Number(ssot[key].checkoutTime.split(":")[0]);
  read(path).split("\n").forEach((line, i) => {
    if (!TIME_FIELDS.test(line)) return;
    if (line.includes("{ci}") || line.includes("{co}")) return;   // SSoT差し込み済み＝ズレようがない
    for (const [kind, re] of Object.entries(KEYWORDS)) {
      const m = line.match(re);
      if (!m) continue;
      const h = firstHour(line.slice((m.index ?? 0) + m[0].length));
      if (h === null) continue;
      const want = kind === "in" ? wantIn : wantOut;
      if (h !== want) {
        fail(path, `L${i + 1} ${kind === "in" ? "チェックイン" : "チェックアウト"}が SSoT(${want}時) と不一致（検出 ${h}時）: ${line.trim().slice(0, 80)}`);
      }
    }
  });
}

// ── 3. 評価・レビュー件数が SSoT と一致するか ──
// 4.xx 形式の数値は評価とみなす。SSoT にない値が出たら落とす。
const allowedRatings = new Set(Object.values(ssot).map((v) => v.rating));
const allowedCounts = new Set(Object.values(ssot).map((v) => v.reviewCount));
for (const path of ["src/data/properties.ts", "src/lib/seo.ts", ...Object.values(PROP_FILES)]) {
  const src = readCode(path);
  for (const m of src.matchAll(/\b4\.\d{2}\b/g)) {
    if (!allowedRatings.has(m[0])) fail(path, `SSoTに無い評価値 ${m[0]}`);
  }
  for (const m of src.matchAll(/(?:reviewCount|count):\s*"(\d+)(?:\D|$)/g)) {
    if (!allowedCounts.has(m[1])) fail(path, `SSoTに無いレビュー件数 ${m[1]}`);
  }
}

// ── 4. 定員が SSoT と一致するか ──
for (const [key, path] of Object.entries(PROP_FILES)) {
  const cap = ssot[key].capacity;
  const src = read(path);
  if (src.includes("{cap}")) { /* 定員も差し込み化済み。プレーンな数値だけ検査する */ }
  for (const m of src.matchAll(/最大\s*(\d+)\s*名/g)) {
    if (m[1] !== cap) fail(path, `定員表記 ${m[1]}名 が SSoT(${cap}名) と不一致`);
  }
}

// ── 結果 ──
if (errors.length) {
  console.error(`\n✗ 表記の不整合 ${errors.length} 件\n`);
  errors.forEach((e) => console.error("  - " + e));
  console.error("\nSSoT: src/lib/propertyFacts.ts（本番値は /admin/properties）\n");
  process.exit(1);
}
console.log("✓ 表記の整合チェック: 問題なし");
console.log(`  SSoT: ${Object.entries(ssot).map(([k, v]) => `${k}(定員${v.capacity}・★${v.rating}/${v.reviewCount}件・IN ${v.checkinTime}/OUT ${v.checkoutTime})`).join(" / ")}`);

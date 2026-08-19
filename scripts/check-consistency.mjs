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
      freeCancelDays: fsVal(f.freeCancelDays), zip: fsVal(f.zip),
      bedrooms: fsVal(f.bedrooms),
    };
  }
  if (!ssot.kiyokawa || !ssot.takasago) throw new Error("property_facts が揃っていません");
} catch (e) {
  console.error(`✗ SSoT（Firestore）を読めませんでした: ${String(e).slice(0, 100)}`);
  console.error("  表記の整合を検査できないため中止します。\n");
  process.exit(1);
}

/* 2026-08-18 監査で発覚: §7-2 の言語分割後も旧バレル（11行の re-export）を検査し続けており、
   §1/§2/§4 が空振りしていた。実文言ファイル（5言語×2棟）を直接見る。 */
const LANGS5 = ["ja", "en", "ko", "zh", "th"];
const PROP_FILES = {
  kiyokawa: LANGS5.map((l) => `src/data/kiyokawa/${l}.ts`),
  takasago: LANGS5.map((l) => `src/data/takasago/${l}.ts`),
};

// ── 1. 提供していない決済手段を書いていないか ──
// 実際は Stripe のカード決済のみ・全額前払い・現地払いなし（2026-08-16 発注者確認）
const FORBIDDEN = [
  ["銀行振込", "銀行振込は提供していない"],
  ["bank transfer", "銀行振込は提供していない"],
  ["銀行轉帳", "銀行振込は提供していない"],
  ["계좌이체", "銀行振込は提供していない"],
  ["โอนเงิน", "銀行振込は提供していない"],
];
for (const path of [...Object.values(PROP_FILES).flat(), "src/data/faqData.ts"]) {
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
for (const [key, paths] of Object.entries(PROP_FILES)) {
  const wantIn = Number(ssot[key].checkinTime.split(":")[0]);
  const wantOut = Number(ssot[key].checkoutTime.split(":")[0]);
  for (const path of paths)
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
for (const path of ["src/data/properties.ts", "src/lib/seo.ts", ...Object.values(PROP_FILES).flat()]) {
  const src = readCode(path);
  for (const m of src.matchAll(/\b4\.\d{2}\b/g)) {
    if (!allowedRatings.has(m[0])) fail(path, `SSoTに無い評価値 ${m[0]}`);
  }
  for (const m of src.matchAll(/(?:reviewCount|count):\s*"(\d+)(?:\D|$)/g)) {
    if (!allowedCounts.has(m[1])) fail(path, `SSoTに無いレビュー件数 ${m[1]}`);
  }
}

// ── 4. 定員が SSoT と一致するか（5言語の言い回しすべて） ──
const CAP_RES = [
  /最大\s*(\d+)\s*名/g, /最多\s*(\d+)\s*人/g, /최대\s*(\d+)\s*인/g,
  /up to (\d+) guests/gi, /(\d+) guests \(max\)/gi, /sleeps (\d+)/gi, /สูงสุด\s*(\d+)\s*คน/g,
];
function checkCap(path, src, allowed) {
  for (const line of src.split("\n")) {
    // 「基本料金に含む人数（5名まで込み・以降追加料金）」は定員ではない
    if (/extraGuest|additional guest|추가|加收|เพิ่ม/.test(line)) continue;
    for (const re of CAP_RES) for (const m of line.matchAll(re)) {
      if (!allowed.has(m[1])) fail(path, `定員表記 ${m[1]} が SSoT(${[...allowed].join("/")}) と不一致: …${m[0]}…`);
    }
  }
}
for (const [key, paths] of Object.entries(PROP_FILES)) {
  for (const path of paths) checkCap(path, read(path), new Set([ssot[key].capacity]));
}
const anyCap = new Set([ssot.kiyokawa.capacity, ssot.takasago.capacity]);
for (const path of ["src/data/faqData.ts", "src/i18n/uiStrings.ts", "src/i18n/translations.ts", "src/lib/seo.ts",
                    "src/pages/ja/partners.astro", "src/pages/ko/partners.astro", "src/pages/zh/partners.astro",
                    "src/data/llms.template.txt", "src/data/llms-full.template.txt"]) {
  checkCap(path, read(path), anyCap);
}

// ── 5. 無料キャンセル日数（返金額を決める値・2026-08-18 監査で25箇所の直書きが発覚） ──
// キャンセル文脈の行にある「N日前 / N days / N일 / N天 / N วัน」を SSoT と突き合わせる。
// パートナー制度（7日前・別ポリシー）は対象外。
const FCD = ssot.kiyokawa.freeCancelDays;
if (ssot.takasago.freeCancelDays !== FCD)
  fail("property_facts", `freeCancelDays が棟間で不一致（${FCD} vs ${ssot.takasago.freeCancelDays}）。FAQ等は共通文のため揃える運用`);
const CANCEL_WORD = /(キャンセル|取消|cancel|취소|ยกเลิก)/i;
const FCD_RES = [/(\d+)\s*日前/g, /(\d+)\+?\s*days?/gi, /(\d+)\s*일\s*전/g, /(\d+)\s*天前/g, /(\d+)\s*วัน/g];
for (const path of [...Object.values(PROP_FILES).flat(), "src/data/faqData.ts",
                    "src/pages/[...locale]/legal/terms.astro", "src/pages/[...locale]/legal/tokushoho.astro",
                    "src/data/llms.template.txt", "src/data/llms-full.template.txt"]) {
  read(path).split("\n").forEach((line, i) => {
    if (!CANCEL_WORD.test(line)) return;
    if (line.includes("{d}") || line.includes("{{FREE_DAYS}}")) return;   // 差し込み済み
    for (const re of FCD_RES) for (const m of line.matchAll(re)) {
      if (m[1] !== FCD) fail(path, `L${i + 1} キャンセル期限 ${m[1]} が SSoT(${FCD}日) と不一致: ${line.trim().slice(0, 70)}`);
    }
  });
}

// ── 6. llms テンプレに事実の直書きが復活していないか ──
// 値は renderLlms が SSoT から注入する。裸の数値・郵便番号はビルドを落とす。
for (const path of ["src/data/llms.template.txt", "src/data/llms-full.template.txt"]) {
  const src = read(path);
  for (const [re, why] of [
    [/up to \d+ guests/i, "定員は {{K_CAP}}/{{T_CAP}}"],
    [/\b\d\s*bedrooms/i, "寝室数は {{K_ROOMS}}/{{T_ROOMS}}"],
    [/810-\d{4}/, "郵便番号は {{K_ZIP}}/{{T_ZIP}}"],
    [/check-?out is by \d/i, "時刻は {{CO}}"],
    [/\d\+ days before check-?in/i, "日数は {{FREE_DAYS}}"],
  ]) {
    const m = src.match(re);
    if (m) fail(path, `事実の直書き「${m[0]}」（${why} を使う）`);
  }
}

// ── 7. 郵便番号の直書き制限 ──
// 許可: 運営会社の登記住所を書く文書のみ。物件の郵便番号は SSoT（zip）から。
const ZIP_ALLOW = new Set([
  "src/lib/seo.ts",                              // COMPANY（登記住所 810-0011）
  "src/pages/[...locale]/about.astro",
  "src/pages/[...locale]/legal/terms.astro",
  "src/pages/[...locale]/legal/tokushoho.astro",
  "src/data/pressData.ts",                       // プレス原文
  "src/pages/admin/properties/[prop].astro",     // 入力欄の placeholder（例示）のみ
]);
{
  const { execSync } = await import("node:child_process");
  const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.astro' 'src/**/*.txt'", { encoding: "utf8" })
    .split("\n").filter(Boolean);
  for (const path of files) {
    if (ZIP_ALLOW.has(path)) continue;
    const src = read(path);
    const m = src.match(/810-\d{4}/);
    if (m) fail(path, `物件の郵便番号らしき直書き ${m[0]}（SSoT の zip を使う）`);
  }
}

// ── 8. トップFAQ の前提（2棟の時刻が同一） ──
// FAQSection は kiyokawa の時刻で全FAQを埋める。棟間でズレたら前提が崩れるので落とす。
if (ssot.kiyokawa.checkinTime !== ssot.takasago.checkinTime || ssot.kiyokawa.checkoutTime !== ssot.takasago.checkoutTime)
  fail("property_facts", "2棟の時刻が不一致。FAQSection/faqData は共通文のため、棟別文への分岐が必要");

// ── 9. 約款の版番号（3箇所・2表記の手動同期を機械検査に） ──
{
  const fns = read("functions/src/index.ts");
  const v1 = (fns.match(/TERMS_VERSION_CURRENT = "([^"]+)"/) ?? [])[1];
  const v2 = (read("src/pages/[...locale]/book/checkout.astro").match(/TERMS_VERSION = "([^"]+)"/) ?? [])[1];
  const eff = (read("src/pages/[...locale]/legal/terms.astro").match(/EFFECTIVE = "(\d+)年(\d+)月(\d+)日"/) ?? []);
  const v3 = eff.length ? `${eff[1]}-${String(eff[2]).padStart(2, "0")}-${String(eff[3]).padStart(2, "0")}` : undefined;
  if (!v1 || !v2 || !v3) fail("約款版数", `版番号を読めません（functions:${v1} checkout:${v2} terms:${v3}）`);
  else if (v1 !== v2 || v1 !== v3) fail("約款版数", `三重管理がズレています functions:${v1} / checkout:${v2} / terms:${v3}`);
}


// ── 10. 集約先以外での直書き禁止（URL・電話・SDKバージョン） ──
{
  const { execSync } = await import("node:child_process");
  const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.astro' 'src/**/*.js'", { encoding: "utf8" })
    .split("\n").filter(Boolean);
  const adminCfg = read("src/lib/adminConfig.ts");
  const sdkVer = (adminCfg.match(/firebasejs\/([\d.]+)/) ?? [])[1];
  const RULES = [
    [/asia-northeast1-yah-homes\.cloudfunctions\.net/, new Set(["src/lib/adminConfig.ts"]), "FunctionsのURLは adminConfig.ts の ENDPOINTS"],
    [/chat\.yah\.homes/, new Set(["src/lib/chatLinks.ts"]), "チャットURLは chatLinks.ts の chatUrlFor"],
    [/050-1721-4419|\+815017214419/, new Set(["src/lib/seo.ts"]), "電話番号は seo.ts の OPERATOR_PHONE"],
  ];
  for (const path of files) {
    const src = read(path);
    for (const [re, allow, why] of RULES) {
      if (allow.has(path)) continue;
      if (re.test(src)) fail(path, `直書き禁止: ${String(re).slice(1, 40)}…（${why}を使う）`);
    }
    // Firebase SDK のバージョンは adminConfig の FB_SDK と一致させる（41箇所の直書きが逸脱しない）
    for (const m of src.matchAll(/gstatic\.com\/firebasejs\/([\d.]+)\//g)) {
      if (sdkVer && m[1] !== sdkVer) fail(path, `Firebase SDK ${m[1]} が FB_SDK(${sdkVer}) と不一致`);
    }
  }
}


// ── §11 define:vars の渡し漏れ（2026-08-19 の My Page 全停止の再発防止） ──
// <script define:vars={{...}}> は素のJSとして出力され、front-matter の import が見えない。
// import した識別子をスクリプト内で使うなら必ず vars に渡す。型チェックもビルドも通り、
// 実行時に初めて ReferenceError で死ぬクラスのバグを、ここで機械的に止める。
{
  const { readdirSync } = await import("node:fs");
  const walk = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".astro") ? [`${dir}/${e.name}`] : []);
  for (const path of walk("src")) {
    const src = read(path);
    const fm = (src.match(/^---\n([\s\S]*?)\n---/) ?? [])[1] ?? "";
    const importNames = [];
    for (const m of fm.matchAll(/import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))\s+from/g)) {
      if (m[2]) importNames.push(m[2]);
      if (m[1]) for (const part of m[1].split(",")) {
        const name = (part.includes(" as ") ? part.split(" as ")[1] : part).trim();
        if (/^\w+$/.test(name)) importNames.push(name);
      }
    }
    if (!importNames.length) continue;
    for (const m of src.matchAll(/<script\s+define:vars=\{\{([\s\S]*?)\}\}\s*>([\s\S]*?)<\/script>/g)) {
      const passed = m[1].split(",").map((x) => x.split(":")[0].trim()).filter(Boolean);
      const body = m[2];
      for (const name of importNames) {
        if (passed.includes(name)) continue;
        if (new RegExp(`(?:const|let|var|function|class)\\s+${name}\\b`).test(body)) continue;   // ローカル定義があるなら別物
        if (new RegExp(`\\b${name}\\b`).test(body)) {
          fail(path, `define:vars に ${name} が渡っていないのにスクリプトが参照（実行時 ReferenceError で全停止する）`);
        }
      }
    }
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

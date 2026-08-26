#!/usr/bin/env node
/**
 * チャット導線QRの生成 — 実体はここだけ（2026-08-18 発注者承認の仕様）
 *
 * 施設の一覧はコードに持たない。チャット側の施設マスタ（Firestore データベース "chat" の
 * chat_facilities・isActive）を正本として読む。chat 側で施設を公開すれば、次のデプロイで
 * 自動的にQRが増える。公開をやめた施設のファイルは消す（古いQRを配り続けない）。
 *
 * 出力（すべて https://yah.homes/qr/… で配信・メールの <img> が参照できる唯一の場所）:
 *   public/qr/chat-{施設}.png             360px   メール4通・使い方ガイド
 *   public/qr/print/chat-{施設}-print.png 2048px  現地掲示・MANUAL本
 *   public/qr/print/chat-{施設}-card-a6.svg/.png  A6印刷カード
 *   public/qr/print/chat-{施設}-card-97.svg/.png/.pdf  97×97mm カード（現地掲示・2026-08-19 発注者仕様）
 *   public/qr/print/chat-{施設}-card-a4.svg/.png/.pdf  A4横 297×210mm カード（2026-08-27 発注者仕様）
 *
 * 実行: pnpm qr                （認証が要る。読めなければ止まる）
 *       pnpm qr --if-possible  （ビルド用。施設マスタを読めない環境では既存ファイルのまま
 *                               続行する。ただし既存が1枚も無い、または生成から30日を
 *                               超えて古い場合は止める＝欠けた/古すぎるQRで公開しない）
 *       pnpm qr --no-pdf       （PDFは既存があれば作り直さない。Chromeが生成日時を埋めるため
 *                               毎ビルドでバイナリ差分が出るのを避ける。ビルドで併用する）
 */
import QRCode from "qrcode";
import sharp from "sharp";
import { mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";

const SOFT = process.argv.includes("--if-possible");
const NO_PDF = process.argv.includes("--no-pdf");
const BASE = "https://chat.yah.homes";
const OUT = "public/qr";
const PRINT = `${OUT}/print`;

/* 施設マスタは Firestore REST で読む（サイト側に firebase-admin を足さないため）。
   認証は ADC（gcloud auth application-default login）またはサービスアカウント鍵。 */
async function accessToken() {
  const { readFileSync } = await import("node:fs");
  const { homedir } = await import("node:os");
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    `${homedir()}/.config/gcloud/application_default_credentials.json`;
  const c = JSON.parse(readFileSync(path, "utf8"));
  const SCOPE = "https://www.googleapis.com/auth/datastore";

  if (c.type === "service_account") {
    const { createSign } = await import("node:crypto");
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const claim = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
      iss: c.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
    const sig = createSign("RSA-SHA256").update(claim).end().sign(c.private_key).toString("base64url");
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${claim}.${sig}` }) });
    const j = await r.json();
    if (!j.access_token) throw new Error(`トークンを取得できません: ${JSON.stringify(j).slice(0, 120)}`);
    return j.access_token;
  }
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token",
      client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`トークンを取得できません: ${JSON.stringify(j).slice(0, 120)}`);
  return j.access_token;
}

/** チャット側の施設マスタ（正本）。公開中の施設キーを返す。 */
async function activeFacilities() {
  const token = await accessToken();
  // チャットは既定DBではなくデータベース "chat" を使う
  const url = "https://firestore.googleapis.com/v1/projects/yah-homes/databases/chat/documents/chat_facilities";
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Firestore ${res.status}`);
  const { documents = [] } = await res.json();
  return documents
    .filter((d) => d.fields?.isActive?.booleanValue !== false)
    .map((d) => d.name.split("/").pop());
}

/* A6カード（105×148mm＝1050×1480）。清川の既存カードと同じ体裁。 */
/* ロゴのパス（transform を変えて A6・97mm の両方で使う＝写しを持たない） */
const LOGO_PATHS = `<path fill="#1A1A1A" d="M458.73,338.34c-1.92,7.08-8.7,10.92-15.64,9-7.08-1.92-10.92-8.56-9-15.49,1.92-7.08,8.56-11.07,15.49-9.15,7.08,1.92,11.07,8.7,9.15,15.64Z"/><path fill="#1A1A1A" d="M388.75,256.62c-9.68-2.3-18.46-.21-26.01,7.3l9.18-39.58-11.09-2.56-4.53-1.03-23.05,100.65,15.49,3.57,7.77-33.95c3.83-16.53,11.98-23.62,24.34-20.82,9.53,2.16,13.49,9.69,10.95,21.01l-9.56,41.39,15.93,3.55,9.94-43.33c4.46-19.36-2.51-32.39-19.33-36.21Z"/><path fill="#1A1A1A" d="M285.52,266.22c20.46,2.49,29.43,13.3,27.05,32.4l-5.7,46.39-15.77-1.96,1.11-10.14c-5.88,6.94-14.5,10.23-24.66,8.98-14.85-1.79-23.65-12.47-21.97-25.97,1.65-12.6,11.61-20.26,26.27-19.78l20.61.38c3.15.15,4.36-.76,4.66-2.89l.23-1.52c.62-6.2-4.15-10.44-13.41-11.67-9.99-1.13-17.26,2.28-20.01,9.22l-11.64-9.69c5.18-10.86,16.71-15.76,33.23-13.76ZM273.84,309.28c-6.86-.08-11.07,2.9-11.81,8.21-.66,5.9,3.36,10.11,10.93,10.98,11.08,1.42,20.56-5.27,21.73-14.98l.45-4.23-21.3.02Z"/><path fill="#1A1A1A" d="M131.33,274.68l-12.28-9.35c26.11-34.28,66.79-62.74,114.54-80.12,47.76-17.38,97.21-21.74,139.25-12.25l-3.39,15.05c-39.19-8.84-85.56-4.69-130.58,11.7-45.01,16.38-83.21,43.01-107.54,74.97Z"/><polygon fill="#1A1A1A" points="206.16 289.84 197.84 338.78 165.77 300.96 152.24 311.03 194.63 358.87 187.86 398.87 203.42 398.87 221.81 289.84 206.16 289.84"/>`;
const LOGO = `<g transform="translate(385,60) scale(0.28)">${LOGO_PATHS}</g>`;
const QR_BOX = 700, QR_X = 175, QR_Y = 420;   // カード中央に配置（1050幅の中央）

/* 97×97mm カード（2026-08-19 発注者仕様・現地掲示用）。
   版面 1000×1000 で作り、PDF/PNG で 97mm に縮尺する。
   構成: 見出し（上部センター）／QR（版面センター・約57.5mm角）／
         URL と ロゴ（下部・両者の視覚中心を揃える）。
   QRは整数グリッドで描く（小数座標だと印刷時ににじみ、読み取りが落ちる）。 */
const S97 = 1000;
async function card97Svg(key, url) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = qr.modules.size, data = qr.modules.data;
  const m = Math.floor(600 / size);
  const box = m * size;
  const x0 = Math.round((S97 - box) / 2), y0 = Math.round((S97 - box) / 2);
  let rects = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (data[r * size + c]) rects += `<rect x="${x0 + c * m}" y="${y0 + r * m}" width="${m}" height="${m}"/>`;
    }
  }
  const F = "Helvetica, Arial, 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  // ロゴ中心 889.7 に URL の視覚中心を合わせる（ベースライン 901）
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S97} ${S97}" width="${S97}" height="${S97}">
<rect width="${S97}" height="${S97}" fill="#FFFFFF"/>
<g transform="translate(801,816) scale(0.26)">${LOGO_PATHS}</g>
<text x="500" y="145" text-anchor="middle" font-family="${F}" font-weight="600" font-size="42" fill="#1A1A1A">24/7 AI chat support</text>
<g fill="#000000">${rects}</g>
<text x="500" y="901" text-anchor="middle" font-family="${F}" font-size="31" fill="#1A1A1A">${url.replace("https://", "")}</text>
</svg>`;
}

/* SVG → 指定サイズの PDF。ローカルの Chrome で印刷出力する（97mm角・A4横で共用）。
   Chrome が無い環境（CI等）では PDF を飛ばして続行する（SVG・PNG は必ず出る）。 */
async function cardPdf(svg, outPath, w, h, tag) {
  const CHROME = process.env.SMOKE_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!existsSync(CHROME)) return false;
  let puppeteer;
  try { puppeteer = (await import("puppeteer-core")).default; } catch { return false; }
  const html = `<!doctype html><meta charset="utf-8"><style>@page{size:${w} ${h};margin:0}html,body{margin:0;padding:0}svg{display:block;width:${w};height:${h}}</style>${svg.replace(/<\?xml[^>]*\?>/, "")}`;
  const tmp = `${PRINT}/.card-${tag}.tmp.html`;
  writeFileSync(tmp, html);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run"] });
  const page = await browser.newPage();
  await page.goto(`file://${process.cwd()}/${tmp}`, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 400));
  await page.pdf({ path: outPath, width: w, height: h, printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await browser.close();
  rmSync(tmp);
  return true;
}

/* A4横カード（297×210mm・2026-08-27 発注者仕様）。現地掲示・遠目に見せる用途。
   左にQR（約92mm角＝125mmの75%）、右に見出し・URL・ロゴ。QR＋情報の塊を版面中央に置く。 */
const A4W = 2970, A4H = 2100;
async function cardA4Svg(key, url) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = qr.modules.size, data = qr.modules.data;
  const m = Math.floor(1250 * 0.75 / size);   // 整数グリッド（にじみ防止）
  const box = m * size;
  const GAP = 220, TEXT_W = 1000;
  const qx = Math.round((A4W - (box + GAP + TEXT_W)) / 2), qy = Math.round((A4H - box) / 2);
  let rects = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (data[r * size + c]) rects += `<rect x="${qx + c * m}" y="${qy + r * m}" width="${m}" height="${m}"/>`;
    }
  }
  const tx = qx + box + GAP;
  const F = "Helvetica, Arial, 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${A4W} ${A4H}" width="${A4W}" height="${A4H}">
<rect width="${A4W}" height="${A4H}" fill="#FFFFFF"/>
<g fill="#000000">${rects}</g>
<text x="${tx}" y="905" font-family="${F}" font-weight="600" font-size="104" fill="#1A1A1A">24/7 AI chat support</text>
<text x="${tx}" y="1030" font-family="${F}" font-size="62" fill="#777777">Scan the QR code to chat with us</text>
<text x="${tx}" y="1180" font-family="${F}" font-size="72" fill="#1A1A1A">${url.replace("https://", "")}</text>
<g transform="translate(${tx - 25},1265) scale(0.52)">${LOGO_PATHS}</g>
</svg>`;
}

async function cardSvg(key, url) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = qr.modules.size, data = qr.modules.data;
  const m = QR_BOX / size;
  let rects = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!data[r * size + c]) continue;
      rects += `<rect x="${(QR_X + c * m).toFixed(2)}" y="${(QR_Y + r * m).toFixed(2)}" width="${m.toFixed(2)}" height="${m.toFixed(2)}"/>\n`;
    }
  }
  /* 多言語の1行があるため、日本語・韓国語・中国語・タイ語の字体まで指定する。
     XML宣言が無いと、閲覧・印刷ソフトが UTF-8 と判断できず文字化けする
     （2026-08-18 発注者報告・清川の旧カードも同じ状態だった）。 */
  const F = "Helvetica, Arial, 'Hiragino Sans', 'Noto Sans JP', 'Noto Sans KR', " +
    "'Noto Sans SC', 'Noto Sans Thai', 'Apple SD Gothic Neo', sans-serif";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1050 1480">
<rect width="1050" height="1480" fill="#FFFFFF"/>
${LOGO}
<text x="525" y="298" text-anchor="middle" font-family="${F}" font-weight="600" font-size="44" fill="#1A1A1A">yah.${key}</text>
<text x="525" y="352" text-anchor="middle" font-family="${F}" font-size="30" fill="#777777">24/7 AI chat support</text>
<g fill="#000000">${rects}</g>
<text x="525" y="1225" text-anchor="middle" font-family="${F}" font-size="34" fill="#1A1A1A">${url.replace("https://", "")}</text>
<text x="525" y="1290" text-anchor="middle" font-family="${F}" font-size="26" fill="#777777">Scan to chat — English / 日本語 / 한국어 / 中文 / ไทย / Tiếng Việt</text>
</svg>`;
}

let keys;
try {
  keys = await activeFacilities();
} catch (err) {
  const known = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.startsWith("chat-")).map((f) => f.slice(5, -4)) : [];
  if (SOFT && known.length) {
    // 世代チェック: 30日以上再生成できていなければ、公開停止施設の削除も
    // 新施設の追加も反映されていない可能性が高い。継続を打ち切って気づかせる。
    const { statSync } = await import("node:fs");
    const newest = Math.max(...readdirSync(OUT).filter((f) => f.startsWith("chat-")).map((f) => statSync(`${OUT}/${f}`).mtimeMs));
    const ageDays = (Date.now() - newest) / 86400000;
    if (ageDays > 30) {
      console.error(`[gen-qr] 施設マスタを読めず、既存QRも生成から${Math.floor(ageDays)}日経過。中止します（gcloud auth application-default login で認証して pnpm qr を実行）`);
      process.exit(1);
    }
    console.warn(`[gen-qr] 施設マスタを読めませんでした（${err.message}）。既存のQR ${known.length}件（${Math.floor(ageDays)}日前生成）のまま続行します。`);
    process.exit(0);
  }
  console.error(`[gen-qr] 施設マスタ（chat_facilities）を読めません: ${err.message}`);
  process.exit(1);
}
if (!keys.length) { console.error("[gen-qr] 公開中の施設が0件です。中止します。"); process.exit(1); }

mkdirSync(PRINT, { recursive: true });
for (const key of keys) {
  const url = `${BASE}/${key}`;
  await QRCode.toFile(`${OUT}/chat-${key}.png`, url, { width: 360, margin: 2, errorCorrectionLevel: "M" });
  await QRCode.toFile(`${PRINT}/chat-${key}-print.png`, url, { width: 2048, margin: 4, errorCorrectionLevel: "H" });
  const svg = await cardSvg(key, url);
  writeFileSync(`${PRINT}/chat-${key}-card-a6.svg`, svg);
  await sharp(Buffer.from(svg), { density: 300 }).png().toFile(`${PRINT}/chat-${key}-card-a6.png`);
  const svg97 = await card97Svg(key, url);
  writeFileSync(`${PRINT}/chat-${key}-card-97.svg`, svg97);
  await sharp(Buffer.from(svg97), { density: 300 }).png().toFile(`${PRINT}/chat-${key}-card-97.png`);
  // PDF は Chrome が生成日時を埋めるため、中身が同じでもビルドのたびにバイナリ差分が出る。
  // ビルド（--no-pdf）では既存を維持し、git にノイズを出さない。デザインやURLを変えたときは
  // pnpm qr で明示的に作り直す。ただし新規施設でまだ無い場合は --no-pdf でも作る（配布物を欠かさない）。
  const pdfPath = `${PRINT}/chat-${key}-card-97.pdf`;
  const keptPdf = NO_PDF && existsSync(pdfPath);
  const pdfOk = keptPdf ? false : await cardPdf(svg97, pdfPath, "97mm", "97mm", "97");
  // A4横カード（297×210mm・現地掲示用）。PDF の扱いは 97mm と同じ方針（--no-pdf で既存維持）
  const svgA4 = await cardA4Svg(key, url);
  writeFileSync(`${PRINT}/chat-${key}-card-a4.svg`, svgA4);
  await sharp(Buffer.from(svgA4), { density: 200 }).png().toFile(`${PRINT}/chat-${key}-card-a4.png`);
  const a4Path = `${PRINT}/chat-${key}-card-a4.pdf`;
  const keptA4 = NO_PDF && existsSync(a4Path);
  const a4Ok = keptA4 ? false : await cardPdf(svgA4, a4Path, "297mm", "210mm", "a4");
  const pdfNote = (keptPdf && keptA4) ? "／PDFは既存を維持" : (pdfOk && a4Ok) ? "・PDF" : "／PDFはChromeが無く省略";
  console.log(`[gen-qr] ${key}: ${url} → 通常360px / 印刷2048px / A6カード / 97mmカード / A4横カード(SVG・PNG${pdfNote})`);
}

/* 公開をやめた施設のファイルを消す（古いQRを配り続けない） */
const keep = new Set(keys);
for (const [dir, re] of [[OUT, /^chat-(.+)\.png$/], [PRINT, /^chat-(.+?)-(print\.png|card-a6\.(svg|png)|card-(97|a4)\.(svg|png|pdf))$/]]) {
  for (const f of readdirSync(dir)) {
    const m = re.exec(f);
    if (m && !keep.has(m[1])) { rmSync(`${dir}/${f}`); console.log(`[gen-qr] 公開停止のため削除: ${dir}/${f}`); }
  }
}

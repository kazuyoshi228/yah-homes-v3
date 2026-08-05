// GSC週次観測: Search Console API → コンソール要約 + 定点シート「gsc」タブへ日次行を追記
// 実行: node scripts/gsc-weekly.mjs   （毎週土曜・週次サイクルで実行）
// 認証: ~/.config/yah-homes/service-account.json（firebase-adminsdk-fbsvc / GSC制限付きユーザー・シート編集者）
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createSign } from "node:crypto";

const SHEET_ID = "1DxniZSvdzb5s4Zjt_6MYgWkkFq7q7HlCxyIUZn6hMfk";
const SITE = "sc-domain:yah.homes";
const TAB = "gsc";
const BACKFILL_FROM = "2026-07-01"; // タブが空の時の初回さかのぼり

const key = JSON.parse(readFileSync(`${homedir()}/.config/yah-homes/service-account.json`, "utf8"));
async function token(scope) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: key.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }) }).then((r) => r.json());
  if (!r.access_token) throw new Error("token failed: " + JSON.stringify(r));
  return r.access_token;
}
const gscTok = await token("https://www.googleapis.com/auth/webmasters.readonly");
const shTok = await token("https://www.googleapis.com/auth/spreadsheets");

const d = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
async function query(body) {
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, { method: "POST", headers: { authorization: `Bearer ${gscTok}`, "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  if (r.error) throw new Error(JSON.stringify(r.error));
  return r.rows || [];
}

// ---- GSCデータ確定は約3日遅れ。確定末日 = 3日前 ----
const end = d(-3);

// ---- 1) シートの既存日付を取得（重複追記防止・初回はBACKFILL_FROMから） ----
const col = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB + "!A:A")}`, { headers: { authorization: `Bearer ${shTok}` } }).then((r) => r.json());
if (col.error) {
  // タブがなければ作成
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, { method: "POST", headers: { authorization: `Bearer ${shTok}`, "content-type": "application/json" }, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB } } }] }) });
  console.log(`シートにタブ「${TAB}」を新規作成`);
}
const existing = new Set((col.values || []).map((r) => r[0]).filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "")));
const needHeader = !(col.values || []).length;

// ---- 2) 日次データ取得 → 未記入日を追記 ----
const daily = await query({ startDate: BACKFILL_FROM, endDate: end, dimensions: ["date"], rowLimit: 500 });
const newRows = daily.filter((r) => !existing.has(r.keys[0])).map((r) => [r.keys[0], r.clicks, r.impressions, (r.ctr * 100).toFixed(1) + "%", r.position.toFixed(1)]);
const values = (needHeader ? [["日付", "クリック", "表示", "CTR", "掲載順位"]] : []).concat(newRows);
if (values.length) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB + "!A:E")}:append?valueInputOption=USER_ENTERED`, { method: "POST", headers: { authorization: `Bearer ${shTok}`, "content-type": "application/json" }, body: JSON.stringify({ values }) });
}
console.log(`シート追記: ${newRows.length}日分（〜${end}）`);

// ---- 3) 週次サマリ（直近確定7日 vs その前7日） ----
const wk = daily.filter((r) => r.keys[0] > d(-10) && r.keys[0] <= end);
const pv = daily.filter((r) => r.keys[0] > d(-17) && r.keys[0] <= d(-10));
const sum = (rows) => rows.reduce((a, r) => ({ c: a.c + r.clicks, i: a.i + r.impressions }), { c: 0, i: 0 });
const w = sum(wk), p = sum(pv);
console.log(`\n=== GSC週次 ${d(-9)}〜${end}（前週比） ===`);
console.log(`クリック ${w.c}（前週${p.c}） / 表示 ${w.i}（前週${p.i}）`);

// ---- 4) クエリ実査: 今週クエリ vs 前4週クエリ → 新規表示・表示急増×クリック0 ----
const qNow = await query({ startDate: d(-9), endDate: end, dimensions: ["query"], rowLimit: 1000 });
const qPrev = await query({ startDate: d(-37), endDate: d(-10), dimensions: ["query"], rowLimit: 5000 });
const prevMap = new Map(qPrev.map((r) => [r.keys[0], r]));
const fresh = qNow.filter((r) => !prevMap.has(r.keys[0]) && r.impressions >= 5);
const zeroClick = qNow.filter((r) => r.clicks === 0 && r.impressions >= 10 && r.impressions > 2 * ((prevMap.get(r.keys[0])?.impressions || 0) / 4));
console.log(`\n新規表示クエリ（表示5+・前4週に出現なし）: ${fresh.length}件`);
fresh.slice(0, 15).forEach((r) => console.log(`  ${r.keys[0]} — 表示${r.impressions}/クリック${r.clicks}/順位${r.position.toFixed(1)}`));
console.log(`\n表示急増×クリック0（週表示10+・週平均比2倍超）: ${zeroClick.length}件`);
zeroClick.slice(0, 15).forEach((r) => console.log(`  ${r.keys[0]} — 表示${r.impressions}/順位${r.position.toFixed(1)}`));

// ---- 5) 今週トップクエリ ----
console.log(`\n今週トップクエリ（クリック順）:`);
qNow.filter((r) => r.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, 10).forEach((r) => console.log(`  ${r.keys[0]} — ${r.clicks}c/${r.impressions}imp/順位${r.position.toFixed(1)}`));

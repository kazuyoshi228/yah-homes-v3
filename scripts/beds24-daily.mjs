#!/usr/bin/env node
// Beds24 APIから予約を取得し、前回状態と差分→定点シート記入→サマリ出力
// 実行: node scripts/beds24-daily.mjs   （毎朝8時のスケジュールタスクから呼ばれる）
// 認証: ~/.config/yah-homes/beds24-token.txt（read専用 long life token）
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createSign } from "node:crypto";

const TOKEN = readFileSync(`${homedir()}/.config/yah-homes/beds24-token.txt`, "utf8").trim();
const STATE = `${homedir()}/.config/yah-homes/beds24-state.json`;
const SHEET_ID = "1DxniZSvdzb5s4Zjt_6MYgWkkFq7q7HlCxyIUZn6hMfk";
const PROPS = { 278158: "清川", 291238: "高砂" };
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

async function fetchAll(url) {
  const out = [];
  let next = url;
  while (next) {
    const r = await fetch(next, { headers: { token: TOKEN } }).then((x) => x.json());
    if (!r.success) throw new Error(JSON.stringify(r).slice(0, 300));
    out.push(...r.data);
    next = r.pages?.nextPageLink || null;
  }
  return out;
}

// 過去90日到着〜18ヶ月先まで・キャンセル含む全予約
const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
const to = new Date(Date.now() + 550 * 86400000).toISOString().slice(0, 10);
const bookings = await fetchAll(
  `https://beds24.com/api/v2/bookings?arrivalFrom=${from}&arrivalTo=${to}&pageSize=200&includeCancelled=true`
);

const nights = (b) => Math.round((Date.parse(b.departure) - Date.parse(b.arrival)) / 86400000);
const active = (b) => (b.status === "confirmed" || b.status === "new");
const isGuest = (b) => b.status !== "black" && !/オーナー|yamada|工事|テスト/i.test(`${b.firstName} ${b.lastName}`);

const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { bookings: {}, date: null };
const events = { new: [], cancelled: [] };
for (const b of bookings) {
  if (!isGuest(b)) continue;
  const p = prev.bookings[b.id];
  const label = `${PROPS[b.propertyId]} ${b.arrival}〜${nights(b)}泊 ${b.firstName} ${b.lastName} [${b.referer || b.apiSource || "?"}] ${b.country2 || ""}`;
  if (!p && active(b)) events.new.push(label);
  else if (p && p.status !== "cancelled" && b.status === "cancelled") events.cancelled.push(label);
}

// 先付け残高（今日以降の泊数・棟別）
const fwd = { 清川: 0, 高砂: 0 };
const grp = { 清川: 0, 高砂: 0 };
for (const b of bookings) {
  if (!active(b) || !isGuest(b)) continue;
  const prop = PROPS[b.propertyId];
  const a = b.arrival >= today ? b.arrival : today;
  const n = Math.max(0, Math.round((Date.parse(b.departure) - Date.parse(a)) / 86400000));
  if (n > 0) { fwd[prop] += n; if (b.arrival >= today) grp[prop] += 1; }
}

// 新規/取消の組・泊（棟別）
function tally(list, prop) {
  const rows = list.filter((l) => l.startsWith(prop));
  const n = rows.reduce((s, l) => s + (+l.match(/〜(\d+)泊/)[1] || 0), 0);
  return { g: rows.length, n };
}
const kNew = tally(events.new, "清川"), kCxl = tally(events.cancelled, "清川");
const tNew = tally(events.new, "高砂"), tCxl = tally(events.cancelled, "高砂");

console.log(`=== Beds24 日次観測 ${today}（前回: ${prev.date ?? "初回"}）===`);
console.log(`新規予約 ${events.new.length}件:`); events.new.forEach((l) => console.log("  +", l));
console.log(`キャンセル ${events.cancelled.length}件:`); events.cancelled.forEach((l) => console.log("  -", l));
console.log(`先付け残高: 清川${fwd.清川}泊 / 高砂${fwd.高砂}泊 / 計${fwd.清川 + fwd.高砂}泊`);

// シート記入（初回はスキップ）
if (prev.date && prev.date !== today) {
  const key = JSON.parse(readFileSync(`${homedir()}/.config/yah-homes/service-account.json`, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: key.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const tok = (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }) }).then((r) => r.json())).access_token;
  const col = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:A?valueRenderOption=FORMATTED_VALUE`, { headers: { authorization: `Bearer ${tok}` } }).then((r) => r.json());
  const dstr = `${+today.slice(5, 7)}/${+today.slice(8, 10)}`;
  const row = (col.values || []).findIndex((r) => (r[0] || "").trim() === dstr) + 1;
  if (row > 0) {
    const data = [
      { range: `B${row}`, values: [[kNew.g - kCxl.g]] }, { range: `C${row}`, values: [[kNew.n - kCxl.n]] },
      { range: `E${row}`, values: [[tNew.g - tCxl.g]] }, { range: `F${row}`, values: [[tNew.n - tCxl.n]] },
      { range: `I${row}`, values: [[fwd.清川]] }, { range: `K${row}`, values: [[fwd.高砂]] },
    ];
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }) });
    console.log(`シート記入: ${dstr}行 ← 清川${kNew.g - kCxl.g}組/${kNew.n - kCxl.n}泊(先付${fwd.清川}) 高砂${tNew.g - tCxl.g}組/${tNew.n - tCxl.n}泊(先付${fwd.高砂})`);
  } else console.log(`シートに ${dstr} 行が見つからず記入スキップ`);
} else console.log("（初回実行 or 同日再実行につきシート記入スキップ）");

const snap = {};
for (const b of bookings) snap[b.id] = { status: b.status, arrival: b.arrival, n: nights(b), prop: PROPS[b.propertyId] };
writeFileSync(STATE, JSON.stringify({ bookings: snap, date: today }));
console.log("状態保存完了");

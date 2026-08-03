#!/usr/bin/env node
// 定点観測スプレッドシートへ週次の予約宿泊数を書き込む
// 使い方: node scripts/update-teiten-sheet.mjs --date 7/28 --kg 2 --kn 5 --kf 75 --tg 1 --tn 3 --tf 121
//   kg=清川組数(B列) kn=清川泊数(C列) tg=高砂組数(E列) tn=高砂泊数(F列)
//   kf=清川先付け残高泊(I列) tf=高砂先付け残高泊(K列)。J列はユーザーの%計算列につき触らない。すべて任意(指定分のみ書込)
// 認証: サービスアカウントJSONキー（Sheets APIをJWTで直接叩く・外部ライブラリ不要）
//   キーの場所: 環境変数 GOOGLE_APPLICATION_CREDENTIALS または下記DEFAULT_KEY_PATHS
//   事前準備: スプレッドシートをサービスアカウントの client_email に「編集者」で共有しておく
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createSign } from "node:crypto";

const SHEET_ID = "1DxniZSvdzb5s4Zjt_6MYgWkkFq7q7HlCxyIUZn6hMfk";
const DEFAULT_KEY_PATHS = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  `${homedir()}/.config/yah-homes/service-account.json`,
].filter(Boolean);

const args = Object.fromEntries(
  process.argv.slice(2).join(" ").split("--").filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, v])
);
const { date, kg, kn, kf, tg, tn, tf } = args;
if (!date || [kg, kn, kf, tg, tn, tf].every((v) => v === undefined)) {
  console.error("usage: --date M/D [--kg N] [--kn N] [--kf N] [--tg N] [--tn N] [--tf N]");
  process.exit(1);
}

function loadKey() {
  for (const p of DEFAULT_KEY_PATHS) {
    if (existsSync(p)) {
      const k = JSON.parse(readFileSync(p, "utf8"));
      if (k.type === "service_account") return k;
    }
  }
  throw new Error(
    `サービスアカウントキーが見つかりません。GOOGLE_APPLICATION_CREDENTIALS を設定するか ${DEFAULT_KEY_PATHS.at(-1)} に配置してください`
  );
}

async function accessToken() {
  const key = loadKey();
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`token error: ${JSON.stringify(j)}`);
  return j.access_token;
}

const token = await accessToken();
const api = (path, init) =>
  fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers || {}) },
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(j)}`);
    return j;
  });

// A列から日付行を探す（"8/3" 形式の表示値で一致）
const col = await api(`/values/A:A?valueRenderOption=FORMATTED_VALUE`);
const rows = col.values || [];
const rowIndex = rows.findIndex((r) => (r[0] || "").trim() === date.trim());
if (rowIndex === -1) {
  console.error(`date row not found: ${date}（A列の表記と一致させてください）`);
  process.exit(2);
}
const rowNum = rowIndex + 1;

const updates = [];
const cols = { B: kg, C: kn, E: tg, F: tn, I: kf, K: tf };
for (const [c, v] of Object.entries(cols))
  if (v !== undefined) updates.push({ range: `${c}${rowNum}`, values: [[Number(v)]] });

await api(`/values:batchUpdate`, {
  method: "POST",
  body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: updates }),
});
console.log(`OK: row ${rowNum} (${date}) ← 清川 ${kg ?? "-"}組/${kn ?? "-"}泊(先付${kf ?? "-"})・高砂 ${tg ?? "-"}組/${tn ?? "-"}泊(先付${tf ?? "-"})`);

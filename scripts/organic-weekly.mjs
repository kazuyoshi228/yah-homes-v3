// オーガニック進捗レポート — 「手渡しの20%をオーガニック経由に」の到達度を端的に出す
// 実行: node scripts/organic-weekly.mjs   （毎週月曜の定点で実行）
// 認証: ~/.config/yah-homes/service-account.json
//   - GSC: 追加済み（制限付きユーザー）
//   - GA4: プロパティ 539535968 に「閲覧者」として追加が必要
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createSign } from "node:crypto";

const GA4_PROPERTY = "539535968";           // www.yah.homes
const SITE = "sc-domain:yah.homes";
const HANDOFF = ["click_airbnb", "click_booking_com"];
const TARGET_SHARE = 20;                     // 目標: 手渡しの20%がオーガニック
const PROPS_NOW = 2, PROPS_GOAL = 5;         // 現在の棟数 / 目標棟数

const key = JSON.parse(readFileSync(`${homedir()}/.config/yah-homes/service-account.json`, "utf8"));
async function token(scope) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: key.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }) }).then((r) => r.json());
  if (!r.access_token) throw new Error("token failed: " + JSON.stringify(r).slice(0, 200));
  return r.access_token;
}

// ---- GA4: 手渡しイベントをチャネル別に ----
async function handoffsByChannel(tok, days) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`, {
    method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: "yesterday" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: HANDOFF } } },
    }),
  }).then((x) => x.json());
  if (r.error) throw new Error(`GA4: ${r.error.status} — ${r.error.message.slice(0, 160)}`);
  const out = {};
  for (const row of r.rows ?? []) out[row.dimensionValues[0].value] = Number(row.metricValues[0].value);
  return out;
}

// ---- GSC: クリック合計 ----
async function gscClicks(tok, from, to) {
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
    method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
    body: JSON.stringify({ startDate: from, endDate: to, dimensions: ["date"], rowLimit: 100 }),
  }).then((x) => x.json());
  if (r.error) throw new Error(`GSC: ${JSON.stringify(r.error).slice(0, 160)}`);
  return (r.rows ?? []).reduce((a, x) => ({ c: a.c + x.clicks, i: a.i + x.impressions }), { c: 0, i: 0 });
}

const d = (o) => new Date(Date.now() + o * 86400000).toISOString().slice(0, 10);
const pct = (n, t) => (t ? (n / t) * 100 : 0);

console.log(`=== オーガニック進捗（目標: 手渡しの${TARGET_SHARE}%）===\n`);

// GSC（3日遅れ確定）
try {
  const gTok = await token("https://www.googleapis.com/auth/webmasters.readonly");
  const w = await gscClicks(gTok, d(-9), d(-3));
  const p = await gscClicks(gTok, d(-16), d(-10));
  const m = await gscClicks(gTok, d(-31), d(-3));
  console.log(`■ 検索からの流入（GSC）`);
  console.log(`  直近7日: ${w.c}クリック / ${w.i}表示 / CTR ${pct(w.c, w.i).toFixed(2)}%（前週 ${p.c}クリック）`);
  console.log(`  直近28日: ${m.c}クリック / ${m.i}表示 / CTR ${pct(m.c, m.i).toFixed(2)}%\n`);
} catch (e) { console.log(`■ 検索からの流入（GSC）: 取得失敗 — ${e.message}\n`); }

// GA4（チャネル別手渡し）
try {
  const aTok = await token("https://www.googleapis.com/auth/analytics.readonly");
  for (const days of [7, 28]) {
    const ch = await handoffsByChannel(aTok, days);
    const total = Object.values(ch).reduce((a, b) => a + b, 0);
    const organic = ch["Organic Search"] ?? 0;
    const paid = ch["Paid Search"] ?? 0;
    const share = pct(organic, total);
    const bar = "█".repeat(Math.round(share / 2)).padEnd(Math.round(TARGET_SHARE / 2), "·");
    console.log(`■ 手渡し（click_airbnb + click_booking_com）直近${days}日`);
    console.log(`  合計 ${total}件  内訳: ${Object.entries(ch).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" / ")}`);
    console.log(`  オーガニック比率 ${share.toFixed(1)}%  [${bar}] 目標${TARGET_SHARE}%`);
    if (days === 28) {
      const perWeek = organic / 4;
      const needed = perWeek * (PROPS_GOAL / PROPS_NOW);
      console.log(`\n  ▸ 現在: オーガニック手渡し 週${perWeek.toFixed(1)}件（広告 週${(paid / 4).toFixed(1)}件）`);
      console.log(`  ▸ ${PROPS_GOAL}棟で同じ比率を保つには 週${needed.toFixed(1)}件が必要 = **現在の${(PROPS_GOAL / PROPS_NOW).toFixed(1)}倍**`);
      console.log(`  ▸ 達成度: ${pct(perWeek, needed).toFixed(0)}%`);
    }
    console.log();
  }
} catch (e) {
  console.log(`■ 手渡しのチャネル内訳（GA4）: 取得失敗 — ${e.message}`);
  console.log(`  → GA4プロパティ ${GA4_PROPERTY} に ${key.client_email} を「閲覧者」で追加してください\n`);
}

// 施策中ページのCTR
const TRACK = [
  { p: "/guides/fukuoka-where-to-stay/", label: "英語 where-to-stay", base: { imp: 1155, ctr: 1.2, pos: 7.2 } },
  { p: "/zh/guides/fukuoka-where-to-stay/", label: "繁体字 where-to-stay", base: { imp: 229, ctr: 2.6, pos: 7.1 } },
  { p: "/ja/guides/fukuoka-4-6nin-hotel-hikaku/", label: "日本語 4-6nin", base: { imp: 161, ctr: 1.2, pos: 9.7 } },
];
try {
  const gTok = await token("https://www.googleapis.com/auth/webmasters.readonly");
  const rows = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
    method: "POST", headers: { authorization: `Bearer ${gTok}`, "content-type": "application/json" },
    body: JSON.stringify({ startDate: d(-31), endDate: d(-3), dimensions: ["page"], rowLimit: 500 }),
  }).then((x) => x.json()).then((x) => x.rows ?? []);
  console.log(`■ メタ改善中のページ（2026-08-15 実施・28日値 / 実施前ベースライン）`);
  for (const t of TRACK) {
    const r = rows.find((x) => x.keys[0] === `https://yah.homes${t.p}`);
    if (!r) { console.log(`  ${t.label}: データなし`); continue; }
    const cur = { imp: r.impressions, ctr: r.ctr * 100, pos: r.position };
    const posMoved = Math.abs(cur.pos - t.base.pos) > 1.5;
    console.log(`  ${t.label}: 表示${cur.imp}(前${t.base.imp}) CTR ${cur.ctr.toFixed(1)}%(前${t.base.ctr}%) 順位${cur.pos.toFixed(1)}(前${t.base.pos})` +
      (posMoved ? "  ⚠順位が動いたため効果の切り分け不可" : ""));
  }
} catch (e) { console.log(`■ メタ改善中のページ: 取得失敗 — ${e.message}`); }

/**
 * GSC（Search Console）定点の蓄積 — agency/gscDaily・gscQuery・gscPage
 * spec_ads_gsc_teiten_20260825.md（2026-08-25 発注者承認）
 *
 * GSCのデータ保持は16ヶ月。放置すると古い月から消えるため、Firestoreへ写して永久保存にする。
 * 初回実行が16ヶ月ぶんのバックフィルになる。
 *
 * データは3日ほど遅れて確定するので、毎朝「7日前〜2日前」の窓を取り直す（GA4と同じ思想）。
 * ctr・position はGSCが返す値をそのまま保存する（自分で割らない＝GSCの定義に合わせる）。
 * クエリ・ページは上位100件/日だけ持つ——裾は表示1回が大半で、判断に使わない。
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { agencyDb } from "./agency/engine.js";
import { SA } from "./beds24Client.js";
import { createHash } from "node:crypto";

const SITE = "sc-domain:yah.homes";        // ドメインプロパティ。URLプレフィクスなら "https://yah.homes/"
const TOP_N = 100;

async function gscToken(): Promise<string> {
  const r = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
    + "?scopes=" + encodeURIComponent("https://www.googleapis.com/auth/webmasters.readonly"),
    { headers: { "Metadata-Flavor": "Google" } }).then((x) => x.json() as Promise<{ access_token?: string }>);
  if (!r.access_token) throw new Error("metadata token unavailable");
  return r.access_token;
}

type Row = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function query(tok: string, body: unknown): Promise<Row[]> {
  const r = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify(body) }).then((x) => x.json() as Promise<{ rows?: Row[]; error?: unknown }>);
  if (r.error) throw new Error(`gsc: ${JSON.stringify(r.error).slice(0, 300)}`);
  return r.rows ?? [];
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);
/** JSTのn日前。UTCで計算すると朝8時（＝前日23時UTC）に1日ずれる（2026-08-26 修正） */
const day = (offset: number) =>
  new Date(Date.now() + 9 * 3600e3 - offset * 864e5).toISOString().slice(0, 10);

export const gscSync = onSchedule(
  { schedule: "15 8 * * *", timeZone: "Asia/Tokyo", region: "asia-northeast1",
    serviceAccount: SA, timeoutSeconds: 540 },
  async () => {
    const db = agencyDb();
    const daily = db.collection("gscDaily");
    const existing = (await daily.count().get()).data().count;
    /* 初回＝16ヶ月バックフィル。2回目以降＝7日前〜2日前の取り直し（確定が3日遅れるため） */
    const end = day(2);
    const start = existing < 10 ? day(480) : day(7);

    const tok = await gscToken();
    let dailyN = 0, qN = 0, pN = 0;

    /* ① サイト全体の日次 */
    const rows = await query(tok, { startDate: start, endDate: end, dimensions: ["date"], rowLimit: 1000 });
    let batch = db.batch(), n = 0;
    const flush = async () => { if (n) { await batch.commit(); batch = db.batch(); n = 0; } };
    for (const r of rows) {
      const d = r.keys?.[0];
      if (!d) continue;
      batch.set(daily.doc(d), {
        date: d, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
        source: `Search Console API（${SITE}）`, syncedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      dailyN++; if (++n >= 400) await flush();
    }
    await flush();

    /* ② 日 × クエリ／ページ の上位。1日ずつ引く（日付を跨いだ集計にしないため） */
    const days = rows.map((r) => r.keys?.[0]).filter(Boolean) as string[];
    for (const d of days) {
      for (const [dim, coll, counter] of [
        ["query", db.collection("gscQuery"), "q"], ["page", db.collection("gscPage"), "p"],
      ] as const) {
        const rs = await query(tok, {
          startDate: d, endDate: d, dimensions: [dim],
          rowLimit: TOP_N, orderBy: [{ field: "clicks", descending: true }],
        });
        for (const r of rs) {
          const key = r.keys?.[0];
          if (!key) continue;
          batch.set(coll.doc(`${d}_${hash(key)}`), {
            date: d, [dim]: key, clicks: r.clicks, impressions: r.impressions,
            ctr: r.ctr, position: r.position, syncedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          if (counter === "q") qN++; else pN++;
          if (++n >= 400) await flush();
        }
        /* クエリはプライバシー閾値で欠ける。件数を日次側に残して欠測を明示する */
        if (dim === "query") {
          batch.set(daily.doc(d), { queryRows: rs.length }, { merge: true });
          if (++n >= 400) await flush();
        }
      }
    }
    await flush();
    logger.info(`gscSync: ${start}〜${end} 日次${dailyN} クエリ${qN} ページ${pN}`);
  });

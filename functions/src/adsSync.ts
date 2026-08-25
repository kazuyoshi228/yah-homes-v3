/**
 * Google広告費の定点蓄積 — agency/adsDaily
 * spec_ads_gsc_teiten_20260825.md 案A（2026-08-25 プローブで GA4 に広告費ありを確認）
 *
 * Google広告とGA4がリンクされているため、GA4 Data API の advertiserAdCost から取れる。
 * 新しい鍵・SA・権限は不要（ga4TeitenSync と同じ経路）。
 * 数字はGA4の帰属基準なので、Google Ads管理画面とは数%ずれる——出所を source に明記する。
 *
 * CPA・CPC・ROASは保存しない（費用 ÷ CV で画面が計算する）。
 * CVは ga4Daily 側にあり、コレクションを分けてある——CV定義が変わっても広告費の記録は汚れない。
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { agencyDb } from "./agency/engine.js";
import { SA, GA4_PROPERTY } from "./beds24Client.js";

const SITE_OPENED = "2026-07-12";

async function ga4Token(): Promise<string> {
  const r = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
    + "?scopes=" + encodeURIComponent("https://www.googleapis.com/auth/analytics.readonly"),
    { headers: { "Metadata-Flavor": "Google" } }).then((x) => x.json() as Promise<{ access_token?: string }>);
  if (!r.access_token) throw new Error("metadata token unavailable");
  return r.access_token;
}

const ymd = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
/** JSTのn日前。UTCで計算すると朝8時（＝前日23時UTC）に1日ずれる（2026-08-26 修正） */
const jstDay = (back: number) =>
  new Date(Date.now() + 9 * 3600e3 - back * 864e5).toISOString().slice(0, 10);
/** 「yah.homes_台湾」→「台湾」。市場名だけを鍵にして画面で扱いやすくする */
const market = (campaign: string) => campaign.replace(/^yah\.homes[_-]?/, "") || campaign;

export const adsTeitenSync = onSchedule(
  { schedule: "8 8 * * *", timeZone: "Asia/Tokyo", region: "asia-northeast1",
    serviceAccount: SA, timeoutSeconds: 180 },
  async () => {
    const db = agencyDb();
    const coll = db.collection("adsDaily");
    const existing = (await coll.count().get()).data().count;
    const end = jstDay(1);                                   // JSTの昨日
    const start = existing < 10 ? SITE_OPENED : jstDay(3);

    const days: string[] = [];
    for (let t = Date.parse(start); t <= Date.parse(end); t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));

    try {
      const tok = await ga4Token();
      const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`, {
        method: "POST",
        headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: "date" }, { name: "sessionCampaignName" }],
          metrics: [{ name: "advertiserAdCost" }, { name: "advertiserAdClicks" },
                    { name: "advertiserAdImpressions" }],
          limit: 100000,
        }),
      }).then((x) => x.json() as Promise<{ rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>; error?: unknown }>);
      if (r.error) throw new Error(`ga4 ads: ${JSON.stringify(r.error).slice(0, 200)}`);

      type Cell = { cost: number; clicks: number; impressions: number };
      const byDay = new Map<string, { total: Cell; byMarket: Record<string, Cell> }>();
      const get = (d: string) => {
        if (!byDay.has(d)) byDay.set(d, { total: { cost: 0, clicks: 0, impressions: 0 }, byMarket: {} });
        return byDay.get(d)!;
      };
      for (const row of r.rows ?? []) {
        const cost = Number(row.metricValues[0].value);
        const clicks = Number(row.metricValues[1].value);
        const impressions = Number(row.metricValues[2].value);
        /* 広告費0の行（オーガニック・直接流入など）は広告の記録ではないので落とす */
        if (!cost && !clicks && !impressions) continue;
        const d = get(ymd(row.dimensionValues[0].value));
        const m = market(row.dimensionValues[1].value);
        const cur = d.byMarket[m] ?? (d.byMarket[m] = { cost: 0, clicks: 0, impressions: 0 });
        cur.cost += cost; cur.clicks += clicks; cur.impressions += impressions;
        d.total.cost += cost; d.total.clicks += clicks; d.total.impressions += impressions;
      }

      let batch = db.batch(), n = 0, upserts = 0;
      for (const dstr of days) {
        const d = byDay.get(dstr) ?? { total: { cost: 0, clicks: 0, impressions: 0 }, byMarket: {} };
        /* 円未満の端数はGA4側の按分。1円単位に丸めて保存する（表示のたびに揺れないように） */
        const round = (c: { cost: number; clicks: number; impressions: number }) =>
          ({ cost: Math.round(c.cost), clicks: Math.round(c.clicks), impressions: Math.round(c.impressions) });
        batch.set(coll.doc(dstr), {
          date: dstr, total: round(d.total),
          byMarket: Object.fromEntries(Object.entries(d.byMarket).map(([k, v]) => [k, round(v)])),
          source: `GA4 Data API（advertiserAdCost・property ${GA4_PROPERTY}）。Google Ads管理画面とは帰属基準の差で数%ずれる`,
          fetchFailed: FieldValue.delete(),
          syncedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        upserts++; if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
      }
      if (n) await batch.commit();
      logger.info(`adsTeitenSync: ${start}〜${end} の ${upserts}日を写した`);
    } catch (err) {
      logger.error("adsTeitenSync failed", err);
      const b = db.batch();
      for (const dstr of days.slice(-3)) {
        b.set(coll.doc(dstr), { date: dstr, fetchFailed: true, syncedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      await b.commit();
      throw err;
    }
  });

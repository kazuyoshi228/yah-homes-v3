/**
 * GA4定点の蓄積 — agency/ga4Daily（spec_ga4_teiten_20260825.md・2026-08-25 発注者承認）
 *
 * GA4の数字の正本はここ（APIから直接）。定点シート経由の bookingDaily.cv は別系統の鏡で、
 * 両者の突合は毎朝の点検メールが行う（agency/alerts.ts）。
 *
 * クリック系は eventCount（発生数）で取る——keyEvents だと 8/16 のキーイベント設定変更以降、
 * クリックが起きていても0になる（設定に依存する指標のため）。設定に依存しない発生数を正とし、
 * キーイベント合計（keyEventsTotal）は定点シート経由のCVとの突合用に別フィールドで残す。
 *
 * 毎朝8:05に直近3日を取り直す（GA4の日次集計は24〜48時間ゆらぐため）。
 * 初回実行はサイト開設 2026-07-12 からのバックフィルになる。
 * 取得に失敗した日は fetchFailed を立てる——欠測を無言にしない。
 * 手渡し率などの派生値は保存しない（画面が表示時に計算する）。
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { agencyDb } from "./agency/engine.js";
import { SA, GA4_PROPERTY } from "./beds24Client.js";

const SITE_OPENED = "2026-07-12";
const KEY_EVENTS = ["click_airbnb", "click_booking_com", "click_booking_calendar", "purchase"];

async function ga4Token(): Promise<string> {
  const r = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
    + "?scopes=" + encodeURIComponent("https://www.googleapis.com/auth/analytics.readonly"),
    { headers: { "Metadata-Flavor": "Google" } }).then((x) => x.json() as Promise<{ access_token?: string }>);
  if (!r.access_token) throw new Error("metadata token unavailable");
  return r.access_token;
}

type Report = { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>; error?: unknown };

async function runReport(tok: string, body: unknown): Promise<Report> {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`, {
    method: "POST",
    headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((x) => x.json() as Promise<Report>);
  if (r.error) throw new Error(`ga4: ${JSON.stringify(r.error).slice(0, 200)}`);
  return r;
}

const ymd = (ga4date: string) => `${ga4date.slice(0, 4)}-${ga4date.slice(4, 6)}-${ga4date.slice(6, 8)}`;
/** JSTのn日前。UTCで計算すると朝8時（＝前日23時UTC）に1日ずれる（2026-08-26 修正） */
const jstDay = (back: number) =>
  new Date(Date.now() + 9 * 3600e3 - back * 864e5).toISOString().slice(0, 10);

export const ga4TeitenSync = onSchedule(
  { schedule: "5 8 * * *", timeZone: "Asia/Tokyo", region: "asia-northeast1",
    serviceAccount: SA, timeoutSeconds: 120 },
  async () => {
    const db = agencyDb();
    const coll = db.collection("ga4Daily");
    /* 初回＝バックフィル。2回目以降＝直近3日の取り直し */
    const existing = (await coll.count().get()).data().count;
    /* スキーマ移行の自己修復: 最新行に events が無ければ全期間を取り直す */
    const latest = await coll.orderBy("date", "desc").limit(1).get();
    const migrated = !latest.empty && latest.docs[0].data().events != null;
    const end = jstDay(1);                                   // JSTの昨日
    const start = existing < 10 || !migrated ? SITE_OPENED : jstDay(3);
    const range = [{ startDate: start, endDate: end }];

    /* 対象日の一覧（失敗時に fetchFailed を立てる先） */
    const days: string[] = [];
    for (let t = Date.parse(start); t <= Date.parse(end); t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));

    try {
      const tok = await ga4Token();
      const [ev, ke, ses, rev] = await Promise.all([
        /* 発生数（キーイベント設定に依存しない） */
        runReport(tok, { dateRanges: range, dimensions: [{ name: "date" }, { name: "eventName" }],
          metrics: [{ name: "eventCount" }],
          dimensionFilter: { filter: { fieldName: "eventName",
            inListFilter: { values: KEY_EVENTS } } }, limit: 100000 }),
        /* キーイベント合計（突合用・定点シートのH列と同じ定義） */
        runReport(tok, { dateRanges: range, dimensions: [{ name: "date" }],
          metrics: [{ name: "keyEvents" }], limit: 100000 }),
        runReport(tok, { dateRanges: range, dimensions: [{ name: "date" }],
          metrics: [{ name: "sessions" }, { name: "activeUsers" }], limit: 100000 }),
        runReport(tok, { dateRanges: range, dimensions: [{ name: "date" }],
          metrics: [{ name: "eventValue" }],
          dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "purchase" } } }, limit: 100000 }),
      ]);

      const byDay = new Map<string, { sessions: number; activeUsers: number; revenue: number;
        keyEventsTotal: number; events: Record<string, number> }>();
      const day = (d: string) => {
        if (!byDay.has(d)) byDay.set(d, { sessions: 0, activeUsers: 0, revenue: 0, keyEventsTotal: 0,
          events: { click_airbnb: 0, click_booking_com: 0, click_booking_calendar: 0, purchase: 0, total: 0 } });
        return byDay.get(d)!;
      };
      for (const row of ses.rows ?? []) {
        const d = day(ymd(row.dimensionValues[0].value));
        d.sessions = Number(row.metricValues[0].value);
        d.activeUsers = Number(row.metricValues[1].value);
      }
      for (const row of ev.rows ?? []) {
        const d = day(ymd(row.dimensionValues[0].value));
        const name = row.dimensionValues[1].value;
        const v = Number(row.metricValues[0].value);
        if (name in d.events) d.events[name] += v;
        d.events.total += v;
      }
      for (const row of ke.rows ?? []) day(ymd(row.dimensionValues[0].value)).keyEventsTotal = Number(row.metricValues[0].value);
      for (const row of rev.rows ?? []) day(ymd(row.dimensionValues[0].value)).revenue = Number(row.metricValues[0].value);

      let batch = db.batch(), inBatch = 0, upserts = 0;
      for (const dstr of days) {
        const d = byDay.get(dstr) ?? { sessions: 0, activeUsers: 0, revenue: 0, keyEventsTotal: 0,
          events: { click_airbnb: 0, click_booking_com: 0, click_booking_calendar: 0, purchase: 0, total: 0 } };
        batch.set(coll.doc(dstr), {
          date: dstr, ...d,
          keyEvents: FieldValue.delete(),          // 旧スキーマの掃除
          source: `GA4 Data API（property ${GA4_PROPERTY}）`,
          fetchFailed: FieldValue.delete(),          // 以前の失敗印は成功で消す
          syncedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        upserts++; inBatch++;
        if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
      }
      if (inBatch) await batch.commit();
      logger.info(`ga4TeitenSync: ${start}〜${end} の ${upserts}日を写した`);
    } catch (err) {
      /* 欠測を無言にしない。既存の良いデータは merge で保たれる */
      logger.error("ga4TeitenSync failed", err);
      const batch = db.batch();
      for (const dstr of days.slice(-3)) {
        batch.set(coll.doc(dstr), { date: dstr, fetchFailed: true,
          syncedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      await batch.commit();
      throw err;                                     // Schedulerの失敗として残す（監視に乗る）
    }
  });

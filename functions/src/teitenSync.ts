/**
 * 定点シート → Firestore ミラー（予約状況の定点観測・2026-08-25 発注者承認）
 *
 * 正本は定点スプレッドシート（毎朝8:00の beds24DailyObserver が追記）。
 * ここは毎朝8:10にシート全行を agency/bookingDaily へ冪等に写すだけの鏡。
 * 初回実行がそのままバックフィルになる（7月からの履歴が一度に入る）。
 *
 * シートを都度読まない理由: agencyApi の実行SAはシートに共有されておらず、
 * 共有済みの appspot SA で動くのはこの同期だけにするため（権限の面を広げない）。
 * 観測ジョブ本体には触れない（fail-closed をそのまま守る）。
 *
 * 列の対応（beds24DailyObserver の書き込みと同じ）:
 *   A=日付 / B,C=清川 組±・泊± / E,F=高砂 / H=CV数 /
 *   I=先付け清川泊 J=率 / K=高砂泊 L=率 / M=合計泊 N=率
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { agencyDb } from "./agency/engine.js";

const SHEET_ID = "1DxniZSvdzb5s4Zjt_6MYgWkkFq7q7HlCxyIUZn6hMfk";
const SA = "yah-homes@appspot.gserviceaccount.com";

async function sheetsToken(): Promise<string> {
  const r = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
    + "?scopes=" + encodeURIComponent("https://www.googleapis.com/auth/spreadsheets.readonly"),
    { headers: { "Metadata-Flavor": "Google" } }).then((x) => x.json() as Promise<{ access_token?: string }>);
  if (!r.access_token) throw new Error("metadata token unavailable");
  return r.access_token;
}

/** シートのシリアル値（1899-12-30起点）と文字列の両方を YYYY-MM-DD にする */
function toDate(v: unknown): string | null {
  if (typeof v === "number" && v > 40000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const bookingTeitenSync = onSchedule(
  { schedule: "10 8 * * *", timeZone: "Asia/Tokyo", region: "asia-northeast1",
    serviceAccount: SA, timeoutSeconds: 120 },
  async () => {
    const tok = await sheetsToken();
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:N?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { authorization: `Bearer ${tok}` } }).then((x) => x.json() as Promise<{ values?: unknown[][]; error?: unknown }>);
    if (r.error) throw new Error(`sheets read: ${JSON.stringify(r.error).slice(0, 200)}`);

    const db = agencyDb();
    let upserts = 0, skipped = 0;
    const batchLimit = 400;
    let batch = db.batch(), inBatch = 0;
    for (const row of r.values ?? []) {
      const date = toDate(row[0]);
      if (!date) { skipped++; continue; }        // 見出し・週次サマリなど日付でない行は写さない
      batch.set(db.collection("bookingDaily").doc(date), {
        date,
        k: { g: num(row[1]), n: num(row[2]) },   // 清川 組±・泊±
        t: { g: num(row[4]), n: num(row[5]) },   // 高砂
        cv: num(row[7]),
        fwd: { kiyokawa: num(row[8]), rateK: num(row[9]),
               takasago: num(row[10]), rateT: num(row[11]),
               total: num(row[12]), rate: num(row[13]) },
        raw: row.slice(0, 14).map((v) => (v == null ? null : v)),   // 監査用に元の行も残す
        source: "定点シート", syncedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      upserts++; inBatch++;
      if (inBatch >= batchLimit) { await batch.commit(); batch = db.batch(); inBatch = 0; }
    }
    if (inBatch) await batch.commit();
    logger.info(`bookingTeitenSync: ${upserts}行を写した（日付でない行 ${skipped} はスキップ）`);
  });

/** 一時プローブ: Beds24のメッセージが何件・どんな形で取れるかを1回だけ確かめる（確認後に削除する） */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { agencyDb } from "./agency/engine.js";
import { SA, BEDS24_API } from "./beds24Client.js";

const BEDS24_TOKEN = defineSecret("BEDS24_TOKEN");

export const msgProbe = onSchedule(
  { schedule: "0 5 1 1 *", timeZone: "Asia/Tokyo", region: "asia-northeast1",
    serviceAccount: SA, secrets: [BEDS24_TOKEN], timeoutSeconds: 120 },
  async () => {
    const tok = BEDS24_TOKEN.value();
    const out: Record<string, unknown> = {};
    /* 到達性の確認だけ。個人情報は保存しない——件数と、匿名化した形だけを残す */
    for (const q of [
      "bookings/messages?maxAge=60",
      "bookings/messages?filter=all&maxAge=60",
    ]) {
      try {
        const r = await fetch(`${BEDS24_API}/${q}`, { headers: { token: tok } });
        const j = await r.json() as { success?: boolean; data?: unknown[]; error?: unknown; count?: number };
        const data = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
        out[q] = {
          status: r.status, success: j?.success, error: j?.error ? JSON.stringify(j.error).slice(0, 200) : null,
          count: data.length,
          /* 1件目の「キーの名前だけ」。値は入れない */
          shape: data[0] ? Object.keys(data[0] as object) : null,
          innerShape: data[0] && (data[0] as { messages?: unknown[] }).messages?.[0]
            ? Object.keys((data[0] as { messages: object[] }).messages[0]) : null,
          innerCount: data.reduce((a: number, b) => a + (((b as { messages?: unknown[] }).messages?.length) ?? 0), 0),
        };
      } catch (e) { out[q] = { thrown: String(e).slice(0, 200) }; }
    }
    await agencyDb().collection("_probe").doc("beds24Messages")
      .set({ at: new Date().toISOString(), result: JSON.stringify(out).slice(0, 8000) });
  });

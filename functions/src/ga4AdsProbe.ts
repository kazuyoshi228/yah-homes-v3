/** 手順0: GA4に広告費が入っているかを1回だけ確かめる一時ジョブ（確認後に削除する） */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { agencyDb } from "./agency/engine.js";
import { SA, GA4_PROPERTY } from "./beds24Client.js";

export const ga4AdsProbe = onSchedule(
  { schedule: "0 5 1 1 *", timeZone: "Asia/Tokyo", region: "asia-northeast1", serviceAccount: SA },
  async () => {
    const t = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
      + "?scopes=" + encodeURIComponent("https://www.googleapis.com/auth/analytics.readonly"),
      { headers: { "Metadata-Flavor": "Google" } }).then((x) => x.json() as Promise<{ access_token?: string }>);
    const probe = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`, {
      method: "POST",
      headers: { authorization: `Bearer ${t.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
        dimensions: [{ name: "sessionCampaignName" }],
        metrics: [{ name: "advertiserAdCost" }, { name: "advertiserAdClicks" },
                  { name: "advertiserAdImpressions" }, { name: "sessions" }],
        limit: 30,
      }),
    }).then((x) => x.json());
    await agencyDb().collection("_probe").doc("ga4Ads")
      .set({ at: new Date().toISOString(), probe: JSON.stringify(probe).slice(0, 8000) });
  });

/** 一時プローブ: Beds24のメッセージが何件・どんな形で取れるかを1回だけ確かめる（確認後に削除する） */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { agencyDb } from "./agency/engine.js";
import { SA, BEDS24_API } from "./beds24Client.js";

const BEDS24_TOKEN = defineSecret("BEDS24_TOKEN");

export const msgProbe = onSchedule(
  { schedule: "0 5 1 1 *", timeZone: "Asia/Tokyo", region: "asia-northeast1",
    serviceAccount: SA, secrets: [BEDS24_TOKEN], timeoutSeconds: 300 },
  async () => {
    const tok = BEDS24_TOKEN.value();
    /* ページを送って全件取る。1ページ100件で頭打ちだったため */
    const all: Array<{ message?: string; source?: string; time?: string; propertyId?: number; bookingId?: number }> = [];
    for (let page = 1; page <= 12; page++) {
      const r = await fetch(`${BEDS24_API}/bookings/messages?maxAge=180&page=${page}`, { headers: { token: tok } });
      const j = await r.json() as { data?: unknown[] };
      const d = Array.isArray(j?.data) ? j.data as typeof all : [];
      all.push(...d);
      if (d.length < 100) break;
    }
    /* ゲスト発話だけを見る（host/internalNote は自分の文面なので分析対象外） */
    const guest = all.filter((m) => String(m.source ?? "") === "guest");

    /* 話題の辞書。多言語（英・中・韓）も拾う——OTAゲストの大半は日本語ではない */
    const DICT: Record<string, string[]> = {
      "チェックイン・鍵": ["checkin", "check in", "check-in", "key", "keybox", "code", "entry", "入住", "鑰匙", "密碼", "체크인", "열쇠", "チェックイン", "鍵", "暗証"],
      "チェックアウト": ["checkout", "check out", "late check", "退房", "체크아웃", "チェックアウト", "延長"],
      "早着・荷物": ["early", "luggage", "baggage", "drop off", "寄放", "行李", "짐", "早め", "荷物", "預か"],
      "駐車場": ["parking", "car", "停車", "停车", "주차", "駐車", "車"],
      "Wi-Fi・設備": ["wifi", "wi-fi", "internet", "網路", "网络", "와이파이", "tv", "aircon", "air con", "washing", "ワイファイ", "エアコン", "洗濯", "テレビ"],
      "アクセス・道順": ["how to get", "direction", "station", "airport", "taxi", "bus", "怎麼去", "車站", "가는", "行き方", "駅", "空港"],
      "人数・寝具": ["extra", "guest", "futon", "bed", "人數", "加床", "인원", "人数", "布団", "ベッド"],
      "支払い・領収": ["payment", "invoice", "receipt", "pay", "發票", "收據", "결제", "支払", "領収"],
      "周辺・おすすめ": ["restaurant", "recommend", "nearby", "convenience", "推薦", "附近", "추천", "近く", "おすすめ", "コンビニ"],
      "変更・キャンセル": ["cancel", "change date", "reschedule", "取消", "更改", "취소", "変更", "キャンセル"],
      "ゴミ・ハウスルール": ["trash", "garbage", "rule", "smoking", "垃圾", "규칙", "ゴミ", "喫煙", "ルール"],
    };
    const counts: Record<string, number> = {};
    const samples: Record<string, string[]> = {};
    let unmatched = 0;
    const unmatchedSamples: string[] = [];
    /* 個人情報を落とす。メール・電話・数字の並びは分析に要らない */
    const mask = (t: string) => t
      .replace(/[\w.+-]+@[\w.-]+/g, "[mail]")
      .replace(/\+?\d[\d\s-]{7,}\d/g, "[tel]")
      .replace(/\b\d{4,}\b/g, "[num]")
      .replace(/\s+/g, " ").trim();

    for (const m of guest) {
      const text = String(m.message ?? "");
      const low = text.toLowerCase();
      let hit = false;
      for (const [topic, words] of Object.entries(DICT)) {
        if (words.some((w) => low.includes(w))) {
          counts[topic] = (counts[topic] ?? 0) + 1;
          if ((samples[topic] ??= []).length < 3) samples[topic].push(mask(text).slice(0, 120));
          hit = true;
        }
      }
      if (!hit) {
        unmatched++;
        if (unmatchedSamples.length < 12) unmatchedSamples.push(mask(text).slice(0, 120));
      }
    }
    await agencyDb().collection("_probe").doc("beds24Messages").set({
      at: new Date().toISOString(),
      result: JSON.stringify({
        fetched: all.length, guest: guest.length,
        bySource: all.reduce((a: Record<string, number>, m) => {
          const k = String(m.source ?? "?"); a[k] = (a[k] ?? 0) + 1; return a;
        }, {}),
        counts, unmatched, samples, unmatchedSamples,
      }).slice(0, 40000),
    });
  });

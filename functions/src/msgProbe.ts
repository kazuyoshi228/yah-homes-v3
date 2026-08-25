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
    /* 辞書は実データ（180日・472件）から作った。韓国語が主力で、次に中国語・英語。
       日本語のゲストは少ない——OTA経由の訪日客が中心のため */
    const DICT: Record<string, string[]> = {
      "チェックイン・鍵": ["checkin", "check in", "check-in", "key", "keybox", "code", "entry", "arrive",
        "入住", "鑰匙", "密碼", "체크인", "열쇠", "키", "비밀번호", "도착", "입실",
        "チェックイン", "鍵", "暗証"],
      "チェックアウト": ["checkout", "check out", "late check", "退房", "체크아웃", "퇴실", "チェックアウト", "延長"],
      "早着・荷物": ["early", "luggage", "baggage", "drop off", "寄放", "行李", "짐", "짐보관", "가방",
        "早め", "荷物", "預か"],
      "駐車場": ["parking", "停車", "停车", "주차", "駐車"],
      "設備の使い方": ["how to use", "how do i", "turn on", "aircon", "air con", "heater", "hot water",
        "washing", "dryer", "怎麼用", "熱水", "洗衣", "온수", "세탁", "건조", "보일러", "난방", "에어컨",
        "사용", "패널", "エアコン", "給湯", "洗濯", "使い方"],
      "Wi-Fi": ["wifi", "wi-fi", "internet", "網路", "网络", "와이파이", "인터넷", "ワイファイ"],
      "アメニティ・消耗品": ["towel", "shampoo", "soap", "detergent", "amenity", "毛巾", "洗髮", "洗劑",
        "수건", "타월", "세제", "샴푸", "어메니티", "タオル", "洗剤", "アメニティ"],
      "設備の有無・仕様": ["is there", "do you have", "how many", "bathroom", "toilet", "shower", "kitchen",
        "有沒有", "幾個", "浴室", "廚房", "있나요", "있을까요", "몇개", "몇 개", "욕실", "화장실", "주방",
        "ありますか", "何個"],
      "アクセス・道順": ["how to get", "direction", "station", "airport", "taxi", "bus", "address", "location",
        "怎麼去", "車站", "地址", "가는", "위치", "주소", "역", "공항", "行き方", "駅", "空港", "住所"],
      "人数・寝具": ["extra", "guest", "futon", "bed", "twin", "人數", "加床", "인원", "침대", "명",
        "人数", "布団", "ベッド"],
      "支払い・領収": ["payment", "invoice", "receipt", "pay", "tax", "發票", "收據", "결제", "환불", "요금",
        "支払", "領収", "宿泊税"],
      "周辺・おすすめ": ["restaurant", "recommend", "nearby", "convenience", "推薦", "附近", "추천", "근처",
        "맛집", "近く", "おすすめ", "コンビニ"],
      "変更・キャンセル": ["cancel", "change date", "reschedule", "取消", "更改", "취소", "변경",
        "変更", "キャンセル"],
      "ゴミ・ハウスルール": ["trash", "garbage", "rule", "smoking", "垃圾", "규칙", "쓰레기", "분리수거",
        "ゴミ", "喫煙", "ルール"],
      "お礼・あいさつ": ["thank", "thanks", "감사", "고맙", "안녕", "謝謝", "ありがとう", "よろしく"],
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

    let imageOnly = 0;
    for (const m of guest) {
      const text = String(m.message ?? "");
      /* Airbnbの添付画像は本文がURLだけ。質問ではないので数から外す */
      if (/^\s*<a href="https:\/\/a0\.muscache\.com/.test(text)) { imageOnly++; continue; }
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
        counts, unmatched, imageOnly, samples, unmatchedSamples,
      }).slice(0, 40000),
    });
  });

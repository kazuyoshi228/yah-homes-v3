// 追加UI文字列（translations.ts に無い・英語ハードコードだった箇所の多言語化）
// ※「Pickup Reviews」「Local Guide — Fukuoka」等はブランド上の英語ラベルとして意図的に据え置き
import type { Locale } from "./config";

export interface UiStrings {
  /** /booking・/thankyou の見出し（2行） */
  bookingHeadline: [string, string];
  /** 戻るボタン */
  backToHome: string;
  /** GEO: 直接回答ブロック（定義文+数値）。{kr}{kc}{tr}{tc}=評価/件数・{kcap}{tcap}=定員・{maxAirport}=空港からの車分（DirectAnswer.astro が差し込む） */
  directAnswer: string;
  /** 評価の取得日ラベル（{date} 置換） */
  ratingAsOf: string;
}

export const uiStrings: Record<Locale, UiStrings> = {
  ja: {
    bookingHeadline: ["ご来訪を、", "心よりお待ちしています。"],
    backToHome: "ホームへ戻る",
    directAnswer:
      "yah.homes は、福岡市中心部にある新築一棟貸しヴィラ2棟。グループ全員が、ひとつ屋根の下で過ごせるプライベートな家です。清川は最大{kcap}名（Airbnb ★{kr}・レビュー{kc}件）、高砂は最大{tcap}名（★{tr}・{tc}件）。どちらも福岡空港から車で約{maxAirport}分、繁華街・天神へも徒歩圏です。",
    ratingAsOf: "評価は{date}時点",
  },
  en: {
    bookingHeadline: ["We are truly looking forward", "to having you stay with us."],
    backToHome: "Back to Home",
    directAnswer:
      "yah.homes is a pair of newly built whole-house villas in the heart of Fukuoka, Japan — private homes where your whole group stays under one roof. Kiyokawa sleeps up to {kcap} (★{kr} across {kc} Airbnb reviews); Takasago sleeps up to {tcap} (★{tr} across {tc} reviews). Both are about {maxAirport} minutes by car from Fukuoka Airport and a short walk from the Tenjin downtown district.",
    ratingAsOf: "Ratings as of {date}",
  },
  ko: {
    bookingHeadline: ["여러분의 방문을", "진심으로 기다리고 있습니다."],
    backToHome: "홈으로 돌아가기",
    directAnswer:
      "yah.homes는 일본 후쿠오카 중심에 자리한 신축 독채 빌라 2채 — 일행 모두가 한 지붕 아래에서 함께 머무는 프라이빗 하우스입니다. 기요카와는 최대 {kcap}명(★{kr}·Airbnb 후기 {kc}개), 다카사고는 최대 {tcap}명(★{tr}·후기 {tc}개). 두 곳 모두 후쿠오카 공항에서 차로 약 {maxAirport}분, 번화가 텐진까지 도보권입니다.",
    ratingAsOf: "평점 기준일: {date}",
  },
  zh: {
    bookingHeadline: ["我們由衷期待", "您的光臨。"],
    backToHome: "返回首頁",
    directAnswer:
      "yah.homes 是位於日本福岡市中心的兩棟全新包棟民宿（整棟別墅） — 讓全家人、全團隊同住一個屋簷下的私人之家。清川最多可住7人（★{kr}·{kc}則Airbnb評價），高砂最多可住6人（★{tr}·{tc}則評價）。兩棟距福岡機場車程約{maxAirport}分鐘，步行即達鬧區天神。",
    ratingAsOf: "評分截至 {date}",
  },
  th: {
    bookingHeadline: ["เราตั้งตารอ", "ที่จะได้ต้อนรับคุณ"],
    backToHome: "กลับสู่หน้าแรก",
    directAnswer:
      "yah.homes คือวิลล่าเช่าทั้งหลังสร้างใหม่ 2 หลังใจกลางฟุกุโอกะ ประเทศญี่ปุ่น — บ้านส่วนตัวที่ทั้งกลุ่มของคุณได้พักอยู่ใต้หลังคาเดียวกัน คิโยกาวะรองรับสูงสุด {kcap} คน (★{kr} จาก {kc} รีวิว Airbnb) ทาคาซาโกะรองรับสูงสุด {tcap} คน (★{tr} จาก {tc} รีวิว) ทั้งสองหลังห่างจากสนามบินฟุกุโอกะราว 20 นาทีโดยรถยนต์ และเดินถึงย่านเทนจินได้",
    ratingAsOf: "คะแนน ณ วันที่ {date}",
  },
};

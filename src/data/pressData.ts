import { BASE_URL } from "../lib/seo";
// プレスリリース（PR TIMES）— 旧 KiyokawaBooking.tsx の Press セクション＋
// 旧 index.html の NewsArticle JSON-LD から逐語移植
//
// 【重要・SSoTの例外】ここは「いつ何を発表したか」の記録であり、配信当時の本文をそのまま保つ。
// PR TIMES 側に原本が残っているため、後から数値を書き換えると原本と齟齬が出る
// （例: 2025-06-27 の清川リリースは当時の定員「最大7名」のまま。現在の定員は8名）。
// したがって定員・時刻などの整合チェックの対象外とする（scripts/check-consistency.mjs の SSOT_EXEMPT）。
// 最新の事実は物件ページ・FAQ・llms.txt が SSoT から出しているので、実害はない。
export interface PressItem {
  /** 対象物件（news一覧では全件表示・詳細ページではフィルタ） */
  property: "kiyokawa" | "takasago";
  date: string; // 表示用
  dateISO: string; // JSON-LD 用
  title: string;
  description: string;
  url: string;
}

export const PRESS: PressItem[] = [
  {
    property: "kiyokawa",
    date: "2026年6月22日",
    dateISO: "2026-06-22",
    title:
      "福岡のプレミアム一棟貸し「yah.homes Kiyokawa」が、新たにドラム式洗濯機を導入しリニューアル。家族やグループでの連泊・長期滞在がさらに快適に。",
    description:
      "子連れ旅行の「洗濯どうする問題」を解決。乾燥機能付きドラム式洗濯機（AQUA製）を新たに導入し、就寝中に洗濯から乾燥まで完了。ワーケーション・長期滞在にも対応。",
    url: "https://prtimes.jp/main/html/rd/p/000000007.000036399.html",
  },
  {
    property: "takasago",
    date: "2026年6月19日",
    dateISO: "2026-06-19",
    title:
      "福岡のプレミアム一棟貸し「yah.homes Takasago」が本格運用を開始。家族やグループで“暮らすように泊まる”上質な滞在体験を提供",
    description:
      "福岡市中央区高砂に位置するプレミアム一棟貸し宿泊施設。最大6名収容の3LDKメゾネット型独立棟で、全室シモンズ製マットレス、専用駐車場完備。家族・グループ旅行に最適な上質な滞在体験を提供。",
    url: "https://prtimes.jp/main/html/rd/p/000000006.000036399.html",
  },
  {
    property: "kiyokawa",
    date: "2025年6月27日",
    dateISO: "2025-06-27",
    title:
      "福岡・清川の那珂川沿いに新築一棟貸切ヴィラ「yah.homes kiyokawa」が誕生！家族やグループで泊まれる“暮らす旅”空間の提供を開始しました！",
    description:
      "那珂川沿いの静かなエリアに位置しながらも、天神・博多駅へのアクセスも良好。最大7名・3ベッドルームの新築一棟貸切り、全室シモンズ製 PREMIUM マットレス、フルキッチン・高速 Wi-Fi完備。ワーケーション・長期滞在にも対応。",
    url: "https://prtimes.jp/main/html/rd/p/000000021.000054152.html",
  },
];

// NewsArticle の JSON-LD（一覧用 ItemList）
export function pressJsonLd(items: PressItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "News & Press — yah.homes",
    itemListElement: items.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "NewsArticle",
        headline: p.title,
        description: p.description,
        url: p.url,
        datePublished: p.dateISO,
        publisher: { "@type": "Organization", name: "ボンファイア株式会社", url: BASE_URL },
        about: {
          "@type": "LodgingBusiness",
          name: p.property === "kiyokawa" ? "yah.homes Kiyokawa" : "yah.homes Takasago",
          url: `${BASE_URL}/properties/${p.property}/`,
        },
      },
    })),
  };
}

// 物件の外部リンク・画像・基本スペック（旧予約ページの実値）。
// 予約は自前エンジンではなく Airbnb ディープリンク＋Beds24 iframe。

export interface Property {
  key: "kiyokawa" | "takasago";
  airbnbUrl: string;
  bookingUrl: string;
  beds24PropId: string;
  exterior: string; // /manus-storage/...
  capacity: number;
  bedrooms: number;
}

const IMG = "/manus-storage";

/** Airbnb 評価の取得日（更新時はこの日付と rating/reviewCount を揃えて更新する）
 *  取得方法: Airbnb リスティングページの embedded JSON（guestSatisfactionOverall / reviewCount）
 *  将来: Beds24 API での自動化を検討（docs/design_geo_improvements.md Phase B） */

export const PROPERTIES: Record<Property["key"], Property> = {
  kiyokawa: {
    key: "kiyokawa",
    airbnbUrl: "https://www.airbnb.jp/rooms/1427842426961787667",
    bookingUrl: "https://www.booking.com/Share-Tyhode",
    beds24PropId: "278158",
    exterior: `${IMG}/kiyokawa-exterior_18a3409b.webp`,
    capacity: 7,
    bedrooms: 3,
  },
  takasago: {
    key: "takasago",
    airbnbUrl: "https://www.airbnb.jp/rooms/1497546315476018480",
    bookingUrl: "https://www.booking.com/Share-K2G3CO",
    beds24PropId: "291238",
    exterior: `${IMG}/takasago-exterior_d4f7ccff.webp`,
    capacity: 6,
    bedrooms: 3,
  },
};

export const HERO_IMAGE = `${IMG}/hero-dining-006-opt_1d801c69.webp`;
export const DIRECTOR_IMAGE = `${IMG}/director-photo_def5f1a6.webp`;
export const STORY_IMAGE = `${IMG}/story-hero_803d730b.webp`;

// ギャラリー画像（保全済みのベース版のみ。派生 -480/-768 はCDN未生成のため除外）
export const GALLERIES: Record<Property["key"], string[]> = {
  kiyokawa: [
    "kiyokawa-gallery-001_b1729543", "kiyokawa-gallery-002_d04b5450", "kiyokawa-gallery-003_e2973555",
    "kiyokawa-gallery-004_fe56d8c0", "kiyokawa-gallery-005_f20ac271", "kiyokawa-gallery-006_7dcf2f06",
    "kiyokawa-gallery-007_e2bf5d66", "kiyokawa-gallery-008_a94fdbe4", "kiyokawa-gallery-009_95d58f6b",
    "kiyokawa-gallery-010_15b7a418", "kiyokawa-gallery-011_087fe50b", "kiyokawa-gallery-012_8fc39b9d",
    "kiyokawa-gallery-013_80c7f1fe", "kiyokawa-gallery-014_f4377d6b", "kiyokawa-gallery-015_074fba82",
    "kiyokawa-gallery-016_e6cdefd2", "kiyokawa-gallery-017_debd39e3", "kiyokawa-gallery-018_75834ded",
    "kiyokawa-gallery-019_27634fd8", "kiyokawa-gallery-020_ff0225ae", "kiyokawa-gallery-021_fb06bd2f",
  ].map((n) => `${IMG}/${n}.webp`),
  takasago: [
    "takasago-gallery-001_b7bd943b", "takasago-gallery-002_66296400", "takasago-gallery-003_0d13c7aa",
    "takasago-gallery-004_b36db950", "takasago-gallery-005_3db2fa2f", "takasago-gallery-006_ceb8281f",
    "takasago-gallery-007_792fc6f2", "takasago-gallery-008_5a08bb09", "takasago-gallery-009_f3ff9cef",
    "takasago-gallery-010_1c4ae918", "takasago-gallery-011_ed82275f", "takasago-gallery-012_f5749bc4",
    "takasago-gallery-013_5552bc3c", "takasago-gallery-014_02981af9", "takasago-gallery-015_34f34c09",
    "takasago-gallery-016_551d076d", "takasago-gallery-017_10e566e7", "takasago-gallery-018_31492c5d",
    "takasago-gallery-019_d4b0817e", "takasago-gallery-020_c36a94e7", 
    
    "takasago-gallery-025_58ae56f8", "takasago-gallery-026_f7acfeaa", "takasago-gallery-027_0d82272d",
    "takasago-gallery-028_8031891b",
  ].map((n) => `${IMG}/${n}.webp`),
};

// ページ別 SEO メタデータ。旧 server/_core/prerender.ts の PAGE_META の「中身」を移植。
// ロケール×ページで title / description を返し、JSON-LD はページ単位で生成する。
// UA判定の仕組みは移植しない（全UAに同一HTMLを配信するため不要）。
// 構造化データ（LodgingBusiness 等）は旧サイトと違い全言語版に付与する。

import type { Locale } from "../i18n/config";
import { getPropertyFacts } from "./propertyFacts";
import { PROPERTIES } from "../data/properties";
import { PRESS } from "../data/pressData";

export interface PageMeta {
  title: string;
  description: string;
  ogImage?: string;
  jsonLd?: Record<string, unknown>;
}

export const BASE_URL = "https://yah.homes";
/** 運営の問い合わせ電話（表示用とtel:リンク用）。ページ側での直書きを禁止 */
/* 電話・会社住所の正本は property_facts/meta（/admin/properties の「共通情報」）。
   ここはビルド時に SSoT から読むだけで、値は持たない。 */
const SSOT = await getPropertyFacts();
export const OPERATOR_PHONE = SSOT.meta.operatorPhone;
export const OPERATOR_PHONE_TEL = "+81" + OPERATOR_PHONE.replace(/-/g, "").slice(1);
export const OG_IMAGE = `${BASE_URL}/manus-storage/kiyokawa-exterior_18a3409b.webp`;
/* 共有カードの画像。物件ページは自分の棟の外観を出す
   （既定のままだと、高砂のURLをLINEに貼っても清川の写真が出る）。 */
export const OG_IMAGE_BY_PAGE: Partial<Record<PageKey, string>> = {
  kiyokawa: `${BASE_URL}/manus-storage/kiyokawa-exterior_18a3409b.webp`,
  takasago: `${BASE_URL}/manus-storage/takasago-exterior_d4f7ccff.webp`,
};

// 運営会社（ユーザー確認済み 2026-07-16 登記情報）— GEO: AIが「運営会社は?」に正しく答えるための一次情報
export const OPERATOR = {
  name: "Bonfire Inc.",
  alternateName: "ボンファイア株式会社",
  foundingDate: "2018-01-05",
  ceo: "Kazuyoshi Yamada",
  ceoJa: "山田一慶",
  corporateNumber: "4010901041393", // 法人番号
  // 日本語表記（会社概要・特商法の日本語面）
  addressJa: `〒${SSOT.meta.company.zip} ${SSOT.meta.company.addressJa}`,
  // 英語表記（schema・国際面。ユーザー確認済み 2026-07-16）
  streetAddress: SSOT.meta.company.streetEn,
  addressLocality: SSOT.meta.company.localityEn,
  addressRegion: SSOT.meta.company.regionEn,
  postalCode: SSOT.meta.company.zip,
  addressEn: SSOT.meta.company.addressEn,
  businessScope: "不動産売買・不動産開発・システム開発・貿易業",
} as const;

// 周辺スポット数（LOCALS の説明文用・localsData が正本）
import { localsData } from "../data/localsData";
const SPOT_COUNT = localsData.en.categories.reduce((n, c) => n + c.spots.length, 0);

// Organization JSON-LD（全ページ共通・sameAs でエンティティ接続）
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: OPERATOR.name,
    alternateName: OPERATOR.alternateName,
    foundingDate: OPERATOR.foundingDate,
    founder: { "@type": "Person", name: OPERATOR.ceo, jobTitle: "CEO / Director" },
    address: {
      "@type": "PostalAddress",
      streetAddress: OPERATOR.streetAddress,
      addressLocality: OPERATOR.addressLocality,
      addressRegion: OPERATOR.addressRegion,
      postalCode: OPERATOR.postalCode,
      addressCountry: "JP",
    },
    identifier: { "@type": "PropertyValue", name: "Japan Corporate Number", value: OPERATOR.corporateNumber },
    url: BASE_URL,
    logo: `${BASE_URL}/manus-storage/logo_yah_2dbf971f.svg`,
    sameAs: [
      "https://www.instagram.com/yah.homes/",
      PROPERTIES.kiyokawa.airbnbUrl,
      PROPERTIES.takasago.airbnbUrl,
      PROPERTIES.kiyokawa.bookingUrl,
      PROPERTIES.takasago.bookingUrl,
      ...PRESS.map((p) => p.url),
    ],
  };
}

// BreadcrumbList JSON-LD（リッチリザルトのパンくず・全ページ共通ヘルパー）
// items = [{name, url?}]。最後の要素はURL省略可（現在ページ）。
export function breadcrumbJsonLd(items: { name: string; url?: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.url ? { item: it.url } : {}),
    })),
  };
}

export type PageKey =
  | "home"
  | "about"
  | "locals"
  | "booking"
  | "kiyokawa"
  | "takasago"
  | "thankyou";

type LocaleText = Record<Locale, { title: string; description: string }>;

const HOME: LocaleText = {
  en: {
    title:
      "yah.homes | Whole-House Villa Rental Fukuoka — Private Home for Group/Family Trip",
    description:
      "yah.homes offers whole-house villa rentals in Fukuoka, Japan. Kiyokawa ({K_CAP} guests) and Takasago ({T_CAP} guests) — privately designed homes perfect for group trips, family vacations, and workcations. Book on Airbnb or Booking.com.",
  },
  ja: {
    title: "yah.homes | 福岡の一棟貸しヴィラ — グループ・家族旅行のための貸切の家",
    description:
      "yah.homesは福岡の都心部（中央区）にある新築の一棟貸し・貸別荘ヴィラ。清川（最大{K_CAP}名）と高砂（最大{T_CAP}名）——グループ旅行・家族旅行・ワーケーションに最適な、まるごと貸切のプライベートな家。AirbnbまたはBooking.comで予約できます。",
  },
  ko: {
    title: "yah.homes | 후쿠오카 통째 빌라 렌탈 — 가족·단체 여행 전용 주택",
    description:
      "yah.homes는 일본 후쿠오카의 통째 빌라 렌탈 브랜드입니다. 기요카와(최대 {K_CAP}명)와 다카사고(최대 {T_CAP}명) — 가족 여행, 단체 여행에 완벽한 독립 주택. Airbnb 또는 Booking.com에서 예약 가능.",
  },
  zh: {
    title: "yah.homes | 福岡包棟民宿・整棟別墅 — 家庭·團體旅行專用住宿",
    description:
      "yah.homes 是福岡市中心的包棟民宿品牌。清川（最多{K_CAP}人）和高砂（最多{T_CAP}人）——適合家庭旅行、親子住宿、團體旅遊的整棟包棟別墅。可透過 Airbnb 或 Booking.com 預訂。",
  },
  th: {
    title:
      "yah.homes | เช่าวิล่าทั้งหลังฟุกุโอกะ — ที่พักส่วนตัวสำหรับครอบครัว/กลุ่มเพื่อน",
    description:
      "yah.homes คือแบรนด์เช่าวิล่าทั้งหลังในฟุกุโอกะ ประเทศญี่ปุ่น คิโยกาวะ (สูงสุด {K_CAP} คน) และทาคาซาโกะ (สูงสุด {T_CAP} คน) — เหมาะสำหรับทริปครอบครัวและกลุ่มเพื่อน จองผ่าน Airbnb หรือ Booking.com",
  },
};

const ABOUT: LocaleText = {
  en: {
    title: "About yah.homes | Design Philosophy & Director",
    description:
      "Learn about yah.homes — a Fukuoka whole-house rental brand personally designed by Director Kazuyoshi Yamada. Every property is tested by the director himself before welcoming guests.",
  },
  ja: {
    title: "yah.homesについて | デザイン哲学とディレクター",
    description:
      "yah.homesは、ディレクター山田一慶が自ら設計した福岡の一棟貸しブランド。すべての部屋にディレクター自身が泊まり込み、確かめてからゲストをお迎えしています。",
  },
  ko: {
    title: "yah.homes 소개 | 디자인 철학 & 디렉터",
    description:
      "yah.homes — 디렉터 카즈요시 야마다가 직접 디자인한 후쿠오카 통째 빌라 브랜드. 모든 숙소는 디렉터가 직접 체험 후 게스트를 맞이합니다.",
  },
  zh: {
    title: "關於 yah.homes | 設計理念與總監",
    description:
      "yah.homes — 由總監山田一慶親自設計的福岡整棟別墅品牌。每間房間都由總監親身體驗後才迎接客人。",
  },
  th: {
    title: "เกี่ยวกับ yah.homes | ปรัชญาการออกแบบ",
    description:
      "yah.homes — แบรนด์ที่พักทั้งหลังในฟุกุโอกะ ออกแบบโดย Director Kazuyoshi Yamada ด้วยตนเอง",
  },
};

const LOCALS: LocaleText = {
  en: {
    title: "Local Guide — Kiyokawa, Fukuoka | yah.homes",
    description:
      "Discover {SPOTS} hand-picked local spots near yah.homes Kiyokawa — cafes, restaurants, markets, and cultural sites in Fukuoka's vibrant Kiyokawa district. Live like a local.",
  },
  ja: {
    title: "ローカルガイド — 福岡・清川 | yah.homes",
    description:
      "yah.homes清川の徒歩圏から、実際に歩いて選んだ{SPOTS}のスポット——カフェ、食堂、市場、文化スポット。暮らすように福岡を楽しむためのガイドです。",
  },
  ko: {
    title: "로컬 가이드 — 기요카와, 후쿠오카 | yah.homes",
    description:
      "yah.homes 기요카와 근처 {SPOTS}곳의 로컬 스팟 — 카페, 레스토랑, 시장, 문화 명소. 현지인처럼 후쿠오카를 즐기세요.",
  },
  zh: {
    title: "在地指南 — 清川，福岡 | yah.homes",
    description:
      "探索 yah.homes 清川附近精選的{SPOTS}個在地景點——咖啡廳、餐廳、市場和文化景點。像當地人一樣體驗福岡。",
  },
  th: {
    title: "คู่มือท้องถิ่น — คิโยกาวะ ฟุกุโอกะ | yah.homes",
    description:
      "ค้นพบ 16 สถานที่แนะนำใกล้ yah.homes คิโยกาวะ — คาเฟ่ ร้านอาหาร ตลาด และสถานที่วัฒนธรรม",
  },
};

// /booking はコンバージョンページ（Airbnb予約CTA）— description も実態に一致させる
const BOOKING: LocaleText = {
  en: {
    title: "Book Your Stay | yah.homes — Whole-House Stays in Fukuoka",
    description:
      "Reserve your stay at yah.homes Fukuoka on Airbnb — Kiyokawa (up to {K_CAP} guests) and Takasago (up to {T_CAP} guests). Newly built whole-house rentals with SIMMONS mattresses and full kitchens.",
  },
  ja: {
    title: "ご予約 | yah.homes — 福岡の一棟貸しの宿",
    description:
      "yah.homes福岡をAirbnbで予約——清川（最大{K_CAP}名）・高砂（最大{T_CAP}名）。シモンズ製マットレスとフルキッチンを備えた新築の一棟貸しです。",
  },
  ko: {
    title: "예약하기 | yah.homes — 후쿠오카 통째 빌라",
    description:
      "yah.homes 후쿠오카를 Airbnb에서 예약하세요 — 기요카와(최대 {K_CAP}명)·다카사고(최대 {T_CAP}명). SIMMONS 매트리스와 풀 키친을 갖춘 신축 통째 빌라입니다.",
  },
  zh: {
    title: "立即預訂 | yah.homes — 福岡包棟民宿",
    description:
      "透過 Airbnb 預訂 yah.homes 福岡 — 清川（最多{K_CAP}人）與高砂（最多{T_CAP}人）。配備 SIMMONS 床墊與完整廚房的新建整棟住宿。",
  },
  th: {
    title: "จองที่พัก | yah.homes — ที่พักทั้งหลังในฟุกุโอกะ",
    description:
      "จอง yah.homes ฟุกุโอกะผ่าน Airbnb — คิโยกาวะ (สูงสุด {K_CAP} คน) และทาคาซาโกะ (สูงสุด {T_CAP} คน) บ้านพักใหม่ทั้งหลังพร้อมที่นอน SIMMONS และครัวครบครัน",
  },
};

// CTR改善（2026-07-14 高砂と同一設計: クエリ語彙先頭・数字3つ・公式）
const KIYOKAWA: LocaleText = {
  en: {
    title: "Newly Built Whole-House Villa in Fukuoka — Sleeps {K_CAP}, Private Parking | Kiyokawa by yah.homes",
    description:
      "Rent an entire newly built villa by the Naka River, central Fukuoka. {K_ROOMS} bedrooms, SIMMONS mattresses, full kitchen, private parking. One group per day, rated {K_RATING}/5 on Airbnb. Book direct.",
  },
  ja: {
    title: "福岡の新築一棟貸しヴィラ「清川」｜最大{K_CAP}名・駐車場付・1日1組【公式】",
    description:
      "那珂川沿い・天神と博多の中間に建つ新築の一軒家を丸ごと貸切。寝室{K_ROOMS}室・シモンズ製マットレス・フルキッチン・専用駐車場。1日1組限定、Airbnb評価★{K_RATING}。空室カレンダーからご予約。",
  },
  ko: {
    title: "후쿠오카 신축 독채 빌라 '기요카와' | 최대 {K_CAP}인·주차 가능·하루 한 팀 [공식]",
    description:
      "나카강변, 덴진과 하카타 사이의 신축 주택을 통째로 대여. 침실 {K_ROOMS}개·SIMMONS 매트리스·풀 키친·전용 주차장. 하루 한 팀만, Airbnb 평점 ★{K_RATING}. 공식 사이트에서 예약.",
  },
  zh: {
    title: "福岡新建包棟民宿「清川」｜最多{K_CAP}人・附停車場・一天一組【官方】",
    description:
      "那珂川畔、天神與博多之間的新建整棟民宿。{K_ROOMS}間臥室、SIMMONS床墊、完整廚房、私人停車場。一天只接待一組，Airbnb評分★{K_RATING}。官網直接預訂。",
  },
  th: {
    title: "วิลล่าสร้างใหม่ทั้งหลังในฟุกุโอกะ 'คิโยกาวะ' | สูงสุด {K_CAP} คน มีที่จอดรถ [ทางการ]",
    description:
      "เช่าวิลล่าสร้างใหม่ทั้งหลังริมแม่น้ำนากะ ใจกลางฟุกุโอกะ {K_ROOMS} ห้องนอน ที่นอน SIMMONS ครัวครบ ที่จอดรถส่วนตัว รับวันละหนึ่งกลุ่ม คะแนน Airbnb {K_RATING}/5 จองตรงที่เว็บทางการ",
  },
};

// CTR改善（2026-07-14 SC実測: 表示69・クリック0 → ブランド先頭をやめ、クエリ語彙＋数字を先頭に）
const TAKASAGO: LocaleText = {
  en: {
    title: "Whole-House Rental in Central Fukuoka — Sleeps {T_CAP}, Free Parking | Takasago by yah.homes",
    description:
      "Rent an entire house near Tenjin & Hakata. {T_ROOMS} bedrooms, {T_SINK} vanities, SIMMONS mattresses, parking for large cars. One group per day, rated {T_RATING}/5 on Airbnb. Book direct.",
  },
  ja: {
    title: "福岡・渡辺通の一棟貸し「高砂」｜最大{T_CAP}名・駐車場付・1日1組【公式】",
    description:
      "天神・博多へ好アクセス、渡辺通駅徒歩{T_STATION}分の一軒家を丸ごと貸切。寝室{T_ROOMS}室・洗面台{T_SINK}・シモンズ製マットレス・大型車も停められる専用駐車場。1日1組限定、Airbnb評価★{T_RATING}。空室カレンダーからご予約。",
  },
  ko: {
    title: "후쿠오카 독채 숙소 '다카사고' | 최대 {T_CAP}인·주차 가능·하루 한 팀 [공식]",
    description:
      "덴진·하카타 접근성 좋은 위치, 와타나베도리역 도보 {T_STATION}분. 집 한 채 통째 대여, 침실 {T_ROOMS}개·세면대 {T_SINK}개·SIMMONS 매트리스·대형차 주차 가능. Airbnb 평점 ★{T_RATING}. 공식 사이트에서 예약.",
  },
  zh: {
    title: "福岡包棟民宿「高砂」｜最多{T_CAP}人・附停車場・一天一組【官方】",
    description:
      "鄰近天神・博多，渡邊通站步行{T_STATION}分鐘。整棟包棟出租：{T_ROOMS}間臥室、{T_SINK}個洗手台、SIMMONS床墊、可停大型車的專用停車場。一天只接待一組，Airbnb評分★{T_RATING}。官網直接預訂。",
  },
  th: {
    title: "บ้านเช่าทั้งหลังในฟุกุโอกะ 'ทาคาซาโกะ' | สูงสุด {T_CAP} คน มีที่จอดรถ [ทางการ]",
    description:
      "เช่าบ้านทั้งหลังใกล้เท็นจินและฮากาตะ เดิน {T_STATION} นาทีจากสถานี Watanabe-dori {T_ROOMS} ห้องนอน ที่นอน SIMMONS ที่จอดรถส่วนตัว รับวันละหนึ่งกลุ่ม คะแนน Airbnb {T_RATING}/5 จองตรงที่เว็บทางการ",
  },
};

const THANKYOU: LocaleText = {
  en: { title: "Thank You | yah.homes", description: "Thank you for contacting yah.homes." },
  ja: { title: "ありがとうございます | yah.homes", description: "yah.homesへのお問い合わせありがとうございます。" },
  ko: { title: "감사합니다 | yah.homes", description: "yah.homes에 문의해 주셔서 감사합니다." },
  zh: { title: "感謝您 | yah.homes", description: "感謝您聯繫 yah.homes。" },
  th: { title: "ขอบคุณ | yah.homes", description: "ขอบคุณที่ติดต่อ yah.homes" },
};

const TEXT: Record<PageKey, LocaleText> = {
  home: HOME,
  about: ABOUT,
  locals: LOCALS,
  booking: BOOKING,
  kiyokawa: KIYOKAWA,
  takasago: TAKASAGO,
  thankyou: THANKYOU,
};

// 物件の緯度経度（ユーザー確認済み 2026-07-16・地図/schemaの単一ソース）
export const PROPERTY_GEO = {
  kiyokawa: { lat: 33.57879181728365, lng: 130.4126724730762 },
  takasago: { lat: 33.57993168053716, lng: 130.40632761222304 },
} as const;


// ── JSON-LD ジェネレータ（ページ単位・全言語共通の構造化データ）──
function lodgingJsonLd(opts: {
  name: string;
  url: string;
  description: string;
  streetAddress?: string;
  addressLocality: string;
  postalCode?: string;
  geo?: { lat: number; lng: number };
  rating: string;
  reviewCount: string;
  /** 評価の取得日。SSoT(property_facts/meta) の ratingAsOf */
  ratingAsOf: string;
  capacity: number;
  rooms: number;
  sameAs?: string[];
  /** 設備（物件データに実在するもののみ・value:false=無しも正直に宣言）。GEO/AIが設備を機械可読に引用できる。 */
  amenityFeature?: { name: string; value: boolean }[];
}): Record<string, unknown> {
  const address: Record<string, unknown> = {
    "@type": "PostalAddress",
    addressLocality: opts.addressLocality,
    addressCountry: "JP",
  };
  if (opts.streetAddress) address.streetAddress = opts.streetAddress;
  if (opts.postalCode) address.postalCode = opts.postalCode;
  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: opts.name,
    url: opts.url,
    description: opts.description,
    address,
    ...(opts.geo ? { geo: { "@type": "GeoCoordinates", latitude: opts.geo.lat, longitude: opts.geo.lng } } : {}),
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: opts.rating,
      reviewCount: opts.reviewCount,
      bestRating: "5",
    },
    maximumAttendeeCapacity: opts.capacity,
    numberOfRooms: opts.rooms,
    ...(opts.amenityFeature
      ? {
          amenityFeature: opts.amenityFeature.map((a) => ({
            "@type": "LocationFeatureSpecification",
            name: a.name,
            value: a.value,
          })),
        }
      : {}),
    // 料金の手がかり（具体額は季節変動のためレンジ表記）
    priceRange: "¥¥¥",
    // 鮮度シグナル（評価取得日）とエンティティ接続
    dateModified: opts.ratingAsOf,
    ...(opts.sameAs ? { sameAs: opts.sameAs } : {}),
    provider: { "@type": "Organization", name: OPERATOR.name, alternateName: OPERATOR.alternateName },
  };
}

/** JSON-LD の設備一覧。値の正本は property_facts（駐車ラベルだけ棟の実情に合わせる） */
function amenityFromFacts(f: import("./propertyFacts").PropertyFacts, parkingLabel: string) {
  return [
    { name: parkingLabel, value: f.parking > 0 },
    { name: "Kitchen", value: f.kitchen > 0 },
    { name: f.dryer > 0 ? "Washer/dryer" : "Washer", value: f.washer > 0 },
    { name: "WiFi", value: f.wifi > 0 },
    { name: "Air conditioning", value: f.airCon > 0 },
    { name: "Bathtub", value: f.bathtub > 0 },
    { name: "Dedicated workspace", value: f.studyDesk > 0 },
    { name: "Self check-in", value: f.selfCheckin > 0 },
    { name: "Long-term stays allowed (28+ nights)", value: f.longStay > 0 },
    { name: "Smoking allowed", value: f.smokingAllowed > 0 },
    { name: "Carbon monoxide alarm", value: f.coAlarm > 0 },
  ];
}

async function jsonLdFor(page: PageKey): Promise<Record<string, unknown> | undefined> {
  // 評価・件数・定員・寝室数の単一ソースは property_facts（/admin/properties で編集）。
  // 以前は data/properties.ts に重複して持っており、更新漏れでズレる構造だった。
  const { facts, ratingAsOf } = await getPropertyFacts();
  switch (page) {
    case "kiyokawa":
      return lodgingJsonLd({
        name: "yah.homes Kiyokawa",
        url: `${BASE_URL}/properties/kiyokawa/`,
        description:
          `Newly built whole-house villa for up to ${facts.kiyokawa.capacity} guests in Kiyokawa, Chuo-ku, Fukuoka. ${facts.kiyokawa.bedrooms} bedrooms, SIMMONS PREMIUM mattresses, full kitchen, private parking.`,
        streetAddress: facts.kiyokawa.streetAddressEn,
        addressLocality: "Chuo-ku, Fukuoka",
        postalCode: facts.kiyokawa.zip,
        geo: PROPERTY_GEO.kiyokawa,
        ratingAsOf,
        rating: facts.kiyokawa.rating,
        reviewCount: facts.kiyokawa.reviewCount,
        capacity: facts.kiyokawa.capacity,
        rooms: facts.kiyokawa.bedrooms,
        sameAs: [
          PROPERTIES.kiyokawa.airbnbUrl,
          PROPERTIES.kiyokawa.bookingUrl,
          ...PRESS.filter((p) => p.property === "kiyokawa").map((p) => p.url),
        ],
        // 設備フラグは SSoT（/admin/properties の「設備」）から。無しは false で正直に
        amenityFeature: amenityFromFacts(facts.kiyokawa, "Free parking on premises"),
      });
    case "takasago":
      return lodgingJsonLd({
        name: "yah.homes Takasago",
        url: `${BASE_URL}/properties/takasago/`,
        description:
          `Whole-house rental for up to ${facts.takasago.capacity} guests in Fukuoka. ${facts.takasago.bedrooms} bedrooms, SIMMONS mattresses, full kitchen, high-speed Wi-Fi.`,
        // 住所は Google ビジネスプロフィール登録値（2026-07-13 確認）
        streetAddress: facts.takasago.streetAddressEn,
        addressLocality: "Chuo-ku, Fukuoka",
        postalCode: facts.takasago.zip,
        geo: PROPERTY_GEO.takasago,
        ratingAsOf,
        rating: facts.takasago.rating,
        reviewCount: facts.takasago.reviewCount,
        capacity: facts.takasago.capacity,
        rooms: facts.takasago.bedrooms,
        sameAs: [
          PROPERTIES.takasago.airbnbUrl,
          PROPERTIES.takasago.bookingUrl,
          ...PRESS.filter((p) => p.property === "takasago").map((p) => p.url),
        ],
        // 設備フラグは SSoT（/admin/properties の「設備」）から。無しは false で正直に
        amenityFeature: amenityFromFacts(facts.takasago, "Free on-site parking (large vehicles OK)"),
      });
    case "about":
      return {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: "About yah.homes",
        url: `${BASE_URL}/about/`,
        description:
          "yah.homes is a whole-house rental brand in Fukuoka, Japan. Director Kazuyoshi Yamada personally designs and tests every property.",
        mainEntity: {
          "@type": "Person",
          name: "Kazuyoshi Yamada",
          jobTitle: "Director",
          worksFor: { "@type": "Organization", name: "yah.homes" },
        },
      };
    case "locals":
      return {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Local Guide Vol.1 — Kiyokawa, Fukuoka",
        description:
          "16 hand-picked local spots within walking distance of yah.homes Kiyokawa",
        url: `${BASE_URL}/locals/`,
        numberOfItems: 16,
      };
    default:
      return undefined;
  }
}

// 指定ページ・ロケールのメタを返す。
export async function getPageMeta(page: PageKey, locale: Locale): Promise<PageMeta> {
  const t = TEXT[page][locale];
  // 説明文の評価値は SSoT から差し込む。文言に数値を直書きすると、管理画面で
  // 評価を更新しても検索結果の説明文だけ古い値が残る（実際に 4.67→4.68 でズレた）。
  const { facts } = await getPropertyFacts();
  const K = facts.kiyokawa, T = facts.takasago;
  const inject = (v: string) => v
    .replace(/\{K_RATING\}/g, K.rating).replace(/\{T_RATING\}/g, T.rating)
    .replace(/\{K_CAP\}/g, String(K.capacity)).replace(/\{T_CAP\}/g, String(T.capacity))
    .replace(/\{K_ROOMS\}/g, String(K.bedrooms)).replace(/\{T_ROOMS\}/g, String(T.bedrooms))
    .replace(/\{T_SINK\}/g, String(T.sink)).replace(/\{T_STATION\}/g, String(T.fromStationWalkMin))
    .replace(/\{SPOTS\}/g, String(SPOT_COUNT));
  const description = inject(t.description);
  return {
    title: inject(t.title),
    description,
    ogImage: OG_IMAGE_BY_PAGE[page] ?? OG_IMAGE,
    jsonLd: await jsonLdFor(page),
  };
}

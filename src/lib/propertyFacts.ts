/**
 * 物件ファクトの単一ソース（SSoT）— design_booking_p1_v4.md §8-4
 *
 * 真実の源: Firestore `property_facts/{key}`（/admin/properties で編集）
 * ページはビルド時にここから読み、HTMLへ焼き込む（クライアントfetchはAIクローラーに見えないため禁止）。
 * Firestore が読めない場合は下の DEFAULTS にフォールバックし、ビルドは絶対に落とさない。
 *
 * 反映手順: /admin/properties で保存 → 「サイトに反映」で再ビルド → 全ページが更新される。
 */

export interface PropertyFacts {
  /** 定員（最大人数） */
  capacity: number;
  /** 寝室数 */
  bedrooms: number;
  /** ダブルベッド台数 */
  bedDouble: number;
  /** シングルベッド台数 */
  bedSingle: number;
  /** 浴室・シャワーブース・洗面台・トイレ（0 は「—」表示） */
  bath: number;
  shower: number;
  sink: number;
  toilet: number;
  /** Airbnb 評価（表示用の文字列） */
  rating: string;
  reviewCount: string;
  /** チェックイン・チェックアウト時刻（"16:00" / "10:00" 形式・棟ごとに変えられる） */
  checkinTime: string;
  checkoutTime: string;
  /** チェックイン受付終了時刻。空文字＝受付終了なし（何時でも入室可）。
   *  セルフチェックインのため既定は「制限なし」。深夜入室を断る運用にするときだけ入れる。 */
  checkinEndTime: string;
  /** 設備の有無（1=あり / 0=なし）。比較表と物件ページの表示に使う */
  washer: number;
  dryer: number;
  audio: number;
  /** 大型テレビのサイズ（インチ・0=なし） */
  tvInch: number;
  studyDesk: number;
  parking: number;
  theater: number;
  /** アクセス（分・最寄り駅名のみ文字列） */
  fromAirportCarMin: number;
  fromStationWalkMin: number;
  nearestStation: string;
  toTenjinWalkMin: number;
  toHakataWalkMin: number;
  /** 人気スポットまでの距離（分・メートル）。表示文は言語別テンプレートで組み立てる */
  spotMarketMin: number; spotMarketM: number;
  spotSumiyoshiMin: number; spotSumiyoshiM: number;
  spotCanalMin: number; spotCanalM: number;
  spotNakasuWalkMin: number; spotNakasuTaxiMin: number;
  spotOhoriCarMin: number; spotOhoriM: number;
}

export type PropKey = "kiyokawa" | "takasago";

/** Firestore 未取得時のフォールバック。初回投入時の初期値も兼ねる。 */
export const DEFAULTS: Record<PropKey, PropertyFacts> = {
  kiyokawa: {
    capacity: 7, bedrooms: 3, bedDouble: 3, bedSingle: 1,
    bath: 1, shower: 0, sink: 1, toilet: 2,
    rating: "4.77", reviewCount: "48",
    checkinTime: "16:00", checkoutTime: "10:00", checkinEndTime: "",
    washer: 1, dryer: 0, audio: 1, tvInch: 55, studyDesk: 1, parking: 1, theater: 0,
    fromAirportCarMin: 18, fromStationWalkMin: 15, nearestStation: "渡辺通", toTenjinWalkMin: 20, toHakataWalkMin: 25,
    spotMarketMin: 7, spotMarketM: 550, spotSumiyoshiMin: 15, spotSumiyoshiM: 1200,
    spotCanalMin: 15, spotCanalM: 1200, spotNakasuWalkMin: 20, spotNakasuTaxiMin: 5,
    spotOhoriCarMin: 10, spotOhoriM: 3000,
  },
  takasago: {
    capacity: 6, bedrooms: 3, bedDouble: 1, bedSingle: 4,
    bath: 1, shower: 1, sink: 3, toilet: 2,
    rating: "4.68", reviewCount: "40",
    checkinTime: "16:00", checkoutTime: "10:00", checkinEndTime: "",
    washer: 1, dryer: 0, audio: 1, tvInch: 75, studyDesk: 0, parking: 1, theater: 1,
    fromAirportCarMin: 20, fromStationWalkMin: 8, nearestStation: "渡辺通", toTenjinWalkMin: 15, toHakataWalkMin: 25,
    spotMarketMin: 10, spotMarketM: 800, spotSumiyoshiMin: 15, spotSumiyoshiM: 1200,
    spotCanalMin: 18, spotCanalM: 1400, spotNakasuWalkMin: 25, spotNakasuTaxiMin: 7,
    spotOhoriCarMin: 10, spotOhoriM: 2700,
  },
};

/** 評価の取得日（Firestore の meta/ratingAsOf を優先） */
export const DEFAULT_RATING_AS_OF = "2026-07-13";

const PROJECT = "yah-homes";
const REST = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/property_facts`;

type FsValue = { integerValue?: string; stringValue?: string; doubleValue?: number };
type FsDoc = { name: string; fields?: Record<string, FsValue> };

function num(v: FsValue | undefined, fallback: number): number {
  if (!v) return fallback;
  if (v.integerValue != null) return Number(v.integerValue);
  if (v.doubleValue != null) return Number(v.doubleValue);
  if (v.stringValue != null && v.stringValue !== "") return Number(v.stringValue);
  return fallback;
}
function str(v: FsValue | undefined, fallback: string): string {
  return v?.stringValue ?? (v?.integerValue != null ? String(v.integerValue) : fallback);
}

let cache: { facts: Record<PropKey, PropertyFacts>; ratingAsOf: string } | null = null;

/** ビルド時に一度だけ Firestore を読む。失敗時は DEFAULTS を返す（ビルドは落とさない）。 */
export async function getPropertyFacts(): Promise<{ facts: Record<PropKey, PropertyFacts>; ratingAsOf: string }> {
  if (cache) return cache;

  const facts: Record<PropKey, PropertyFacts> = {
    kiyokawa: { ...DEFAULTS.kiyokawa },
    takasago: { ...DEFAULTS.takasago },
  };
  let ratingAsOf = DEFAULT_RATING_AS_OF;

  try {
    const res = await fetch(REST, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`firestore ${res.status}`);
    const json = (await res.json()) as { documents?: FsDoc[] };
    for (const doc of json.documents ?? []) {
      const key = doc.name.split("/").pop() as PropKey | "meta";
      const f = doc.fields ?? {};
      if (key === "meta") {
        ratingAsOf = str(f.ratingAsOf, ratingAsOf);
        continue;
      }
      if (key !== "kiyokawa" && key !== "takasago") continue;
      const d = DEFAULTS[key];
      facts[key] = {
        capacity: num(f.capacity, d.capacity),
        bedrooms: num(f.bedrooms, d.bedrooms),
        bedDouble: num(f.bedDouble, d.bedDouble),
        bedSingle: num(f.bedSingle, d.bedSingle),
        bath: num(f.bath, d.bath),
        shower: num(f.shower, d.shower),
        sink: num(f.sink, d.sink),
        toilet: num(f.toilet, d.toilet),
        rating: str(f.rating, d.rating),
        reviewCount: str(f.reviewCount, d.reviewCount),
        checkinTime: str(f.checkinTime, d.checkinTime),
        checkoutTime: str(f.checkoutTime, d.checkoutTime),
        checkinEndTime: str(f.checkinEndTime, d.checkinEndTime),
        washer: num(f.washer, d.washer),
        dryer: num(f.dryer, d.dryer),
        audio: num(f.audio, d.audio),
        tvInch: num(f.tvInch, d.tvInch),
        fromAirportCarMin: num(f.fromAirportCarMin, d.fromAirportCarMin),
        fromStationWalkMin: num(f.fromStationWalkMin, d.fromStationWalkMin),
        nearestStation: str(f.nearestStation, d.nearestStation),
        toTenjinWalkMin: num(f.toTenjinWalkMin, d.toTenjinWalkMin),
        toHakataWalkMin: num(f.toHakataWalkMin, d.toHakataWalkMin),
        spotMarketMin: num(f.spotMarketMin, d.spotMarketMin), spotMarketM: num(f.spotMarketM, d.spotMarketM),
        spotSumiyoshiMin: num(f.spotSumiyoshiMin, d.spotSumiyoshiMin), spotSumiyoshiM: num(f.spotSumiyoshiM, d.spotSumiyoshiM),
        spotCanalMin: num(f.spotCanalMin, d.spotCanalMin), spotCanalM: num(f.spotCanalM, d.spotCanalM),
        spotNakasuWalkMin: num(f.spotNakasuWalkMin, d.spotNakasuWalkMin), spotNakasuTaxiMin: num(f.spotNakasuTaxiMin, d.spotNakasuTaxiMin),
        spotOhoriCarMin: num(f.spotOhoriCarMin, d.spotOhoriCarMin), spotOhoriM: num(f.spotOhoriM, d.spotOhoriM),
        studyDesk: num(f.studyDesk, d.studyDesk),
        parking: num(f.parking, d.parking),
        theater: num(f.theater, d.theater),
      };
    }
    console.log("[propertyFacts] Firestore から取得しました");
  } catch (err) {
    console.log(`[propertyFacts] Firestore を読めませんでした（${String(err).slice(0, 80)}）— 既定値でビルドします`);
  }

  cache = { facts, ratingAsOf };
  return cache;
}

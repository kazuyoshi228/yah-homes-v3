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
}

export type PropKey = "kiyokawa" | "takasago";

/** Firestore 未取得時のフォールバック。初回投入時の初期値も兼ねる。 */
export const DEFAULTS: Record<PropKey, PropertyFacts> = {
  kiyokawa: {
    capacity: 7, bedrooms: 3, bedDouble: 3, bedSingle: 1,
    bath: 1, shower: 0, sink: 1, toilet: 2,
    rating: "4.77", reviewCount: "47",
  },
  takasago: {
    capacity: 6, bedrooms: 3, bedDouble: 1, bedSingle: 4,
    bath: 1, shower: 1, sink: 3, toilet: 2,
    rating: "4.67", reviewCount: "36",
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
      };
    }
    console.log("[propertyFacts] Firestore から取得しました");
  } catch (err) {
    console.log(`[propertyFacts] Firestore を読めませんでした（${String(err).slice(0, 80)}）— 既定値でビルドします`);
  }

  cache = { facts, ratingAsOf };
  return cache;
}

/**
 * 物件ファクトの単一ソース（SSoT）— design_booking_p1_v4.md §8-4
 *
 * 真実の源: Firestore `property_facts/{key}`（/admin/properties で編集）
 * ページはビルド時にここから読み、HTMLへ焼き込む（クライアントfetchはAIクローラーに見えないため禁止）。
 * Firestore が読めない場合はビルドを落とす。フォールバック用の既定値は置かない。
 * 理由: 静的サイトはビルドが落ちても公開中の本番が生き残る。一方、古い値で
 * ビルドが「成功」すると、誰も気づかないまま古い評価・時刻が本番へ出る
 * （2026-08-16 に実際に評価が 47件/48件でズレた）。落ちる方が安全。
 * 初回投入の種は scripts/seed-property-facts.mjs に隔離してある。
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
  /** 無料キャンセル期限＝チェックイン日の何日前まで無料か（既定8）。
   *  サイト文言・決済画面・確定メールの表記と、実際の返金判定の両方がこの値を使う。 */
  freeCancelDays: number;
  /** 設備の有無（1=あり / 0=なし）。比較表と物件ページの表示に使う */
  washer: number;
  dryer: number;
  audio: number;
  /** 大型テレビのサイズ（インチ・0=なし） */
  tvInch: number;
  studyDesk: number;
  parking: number;
  theater: number;
  /** 「地図を開く」の行き先。正本は /admin/properties（SSoT）。
   *  埋め込み iframe は短縮リンクを受け付けないため、埋め込みだけは緯度経度を使う。 */
  mapUrl: string;
  /** 宿泊者名簿フォームのURL（旅館業法）。確定メールが案内する先。 */
  registerUrl: string;
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

/** Firestore のフィールドを型に写す。未設定・型違いはビルドを落とす（黙って既定値に倒さない）。 */
function reqNum(f: Record<string, FsValue | undefined>, k: string, key: string): number {
  const v = num(f[k], Number.NaN);
  if (!Number.isFinite(v)) throw new Error(`property_facts/${key}.${k} が未設定です`);
  return v;
}
function reqStr(f: Record<string, FsValue | undefined>, k: string, key: string): string {
  const v = str(f[k], "\u0000");
  if (v === "\u0000") throw new Error(`property_facts/${key}.${k} が未設定です`);
  return v;
}

/** ビルド時に一度だけ Firestore を読む。読めなければ例外を投げてビルドを落とす。 */
export async function getPropertyFacts(): Promise<{ facts: Record<PropKey, PropertyFacts>; ratingAsOf: string }> {
  if (cache) return cache;

  const res = await fetch(REST, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`[propertyFacts] Firestore を読めませんでした（${res.status}）。ビルドを中止します。`);
  const json = (await res.json()) as { documents?: FsDoc[] };

  const facts = {} as Record<PropKey, PropertyFacts>;
  let ratingAsOf = "";
  for (const doc of json.documents ?? []) {
    const key = doc.name.split("/").pop() as PropKey | "meta";
    const f = doc.fields ?? {};
    if (key === "meta") { ratingAsOf = str(f.ratingAsOf, ""); continue; }
    if (key !== "kiyokawa" && key !== "takasago") continue;
    const n = (k: string) => reqNum(f, k, key);
    const t = (k: string) => reqStr(f, k, key);
    facts[key] = {
      capacity: n("capacity"), bedrooms: n("bedrooms"), bedDouble: n("bedDouble"), bedSingle: n("bedSingle"),
      bath: n("bath"), shower: n("shower"), sink: n("sink"), toilet: n("toilet"),
      rating: t("rating"), reviewCount: t("reviewCount"),
      checkinTime: t("checkinTime"), checkoutTime: t("checkoutTime"),
      checkinEndTime: str(f.checkinEndTime, ""),   // 空＝受付終了なし。空が正常値なので必須にしない
      freeCancelDays: n("freeCancelDays"),
      washer: n("washer"), dryer: n("dryer"), audio: n("audio"), tvInch: n("tvInch"),
      studyDesk: n("studyDesk"), parking: n("parking"), theater: n("theater"),
      fromAirportCarMin: n("fromAirportCarMin"), fromStationWalkMin: n("fromStationWalkMin"),
      nearestStation: t("nearestStation"), mapUrl: t("mapUrl"), registerUrl: t("registerUrl"),
      toTenjinWalkMin: n("toTenjinWalkMin"), toHakataWalkMin: n("toHakataWalkMin"),
      spotMarketMin: n("spotMarketMin"), spotMarketM: n("spotMarketM"),
      spotSumiyoshiMin: n("spotSumiyoshiMin"), spotSumiyoshiM: n("spotSumiyoshiM"),
      spotCanalMin: n("spotCanalMin"), spotCanalM: n("spotCanalM"),
      spotNakasuWalkMin: n("spotNakasuWalkMin"), spotNakasuTaxiMin: n("spotNakasuTaxiMin"),
      spotOhoriCarMin: n("spotOhoriCarMin"), spotOhoriM: n("spotOhoriM"),
    };
  }
  for (const key of ["kiyokawa", "takasago"] as const) {
    if (!facts[key]) throw new Error(`[propertyFacts] property_facts/${key} が見つかりません。ビルドを中止します。`);
  }
  if (!ratingAsOf) throw new Error("[propertyFacts] property_facts/meta.ratingAsOf が未設定です。ビルドを中止します。");

  console.log("[propertyFacts] Firestore から取得しました（SSoT）");
  cache = { facts, ratingAsOf };
  return cache;
}

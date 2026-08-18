// SSoT（property_facts）の値を、言語別テキストの {ci}/{co}/{cap} に差し込むための共通処理。
//
// 言語別データは数値を持たず、プレースホルダだけを持つ。これにより
// 「管理画面でチェックアウト時刻を変えたのに英語版だけ古い値が残る」という
// 2026-08-16 に実際に起きた事故が、構造的に起こらなくなる。
import type { Locale } from "../i18n/config";
import type { PropertyFacts } from "./propertyFacts";

/** SSoT の "16:00" を各言語の表記に整える。日本語・タイ語は24時間制のまま。 */
export function fmtTime(hhmm: string, lang: Locale): string {
  const [hRaw, m] = hhmm.split(":");
  const h = Number(hRaw);
  if (Number.isNaN(h)) return hhmm;
  if (lang === "ja" || lang === "th") return hhmm;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (lang === "en") return `${h12}:${m} ${h < 12 ? "AM" : "PM"}`;
  if (lang === "ko") return `${h < 12 ? "오전" : "오후"} ${h12}시${m === "00" ? "" : ` ${m}분`}`;
  return `${h < 12 ? "上午" : "下午"} ${h12}:${m}`; // zh
}

/** {ci}/{co}/{cap} を実値に差し替える関数を作る。 */
export function makeFill(facts: PropertyFacts, lang: Locale): (v: string) => string {
  const ci = fmtTime(facts.checkinTime, lang);
  const co = fmtTime(facts.checkoutTime, lang);
  const cap = String(facts.capacity);
  const d = String(facts.freeCancelDays);
  const rooms = String(facts.bedrooms), bd = String(facts.bedDouble), bs = String(facts.bedSingle);
  const tv = String(facts.tvInch);
  const MAP: Record<string, string> = {
    ci, co, cap, d, rooms, bd, bs, tv,
    bath: String(facts.bath), toilet: String(facts.toilet), sink: String(facts.sink), shower: String(facts.shower),
    pk: String(facts.parkingSpaces), pkSize: facts.parkingSize,
    airport: String(facts.fromAirportCarMin), station: String(facts.fromStationWalkMin),
    tenjinCar: String(facts.toTenjinCarMin), hakataCar: String(facts.toHakataCarMin), hakataSubway: String(facts.toHakataSubwayMin),
    canalCar: String(facts.spotCanalCarMin), dazaifu: String(facts.spotDazaifuCarMin), yakuin: String(facts.spotYakuinWalkMin),
    bg: String(facts.baseGuests), bgx: String(facts.baseGuests + 1),
    xfee: facts.extraGuestFee.toLocaleString("en-US"), taxiFare: facts.airportTaxiFare,
    area: String(facts.floorAreaM2), floors: String(facts.floors), layout: facts.layoutLabel, bedLayout: facts.bedroomLayout,
  };
  return (v: string) => v.replace(/\{([a-zA-Z]+)\}/g, (m, k) => (k in MAP ? MAP[k] : m));
}

/** オブジェクト内のすべての文字列にプレースホルダ差し込みを適用する。
    フィールド単位の fill() 適用漏れ（2026-08-18 監査で多数発覚）を構造的に無くす。 */
export function fillDeep<T>(obj: T, fill: (s: string) => string): T {
  if (typeof obj === "string") return fill(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map((v) => fillDeep(v, fill)) as unknown as T;
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = fillDeep(v, fill);
    return out as unknown as T;
  }
  return obj;
}

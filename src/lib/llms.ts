// llms.txt / llms-full.txt のビルド時レンダリング
// 宿の事実（評価・定員・寝室・時刻・キャンセル日数・住所・距離）はすべて
// property_facts を単一ソースとして注入する。テンプレートに実数を書かない。
// 未知の {{TOKEN}} が残っていたらビルドを落とす＝直書きの復活を機械的に防ぐ。
import { getPropertyFacts } from "./propertyFacts";
import { fmtTime } from "./factText";

export async function renderLlms(template: string): Promise<string> {
  const buildDate = new Date().toISOString().slice(0, 10);
  const { facts, ratingAsOf } = await getPropertyFacts();
  const K = facts.kiyokawa, T = facts.takasago;
  const MAP: Record<string, string> = {
    K_RATING: K.rating, K_COUNT: K.reviewCount,
    T_RATING: T.rating, T_COUNT: T.reviewCount,
    AS_OF: ratingAsOf, UPDATED: buildDate,
    K_CAP: String(K.capacity), T_CAP: String(T.capacity),
    K_ROOMS: String(K.bedrooms), T_ROOMS: String(T.bedrooms),
    K_BD: String(K.bedDouble), K_BS: String(K.bedSingle),
    T_BD: String(T.bedDouble), T_BS: String(T.bedSingle),
    K_BATH: String(K.bath), K_TOILET: String(K.toilet),
    T_TOILET: String(T.toilet), T_SINK: String(T.sink),
    K_TV: String(K.tvInch),
    CI: K.checkinTime, CO: K.checkoutTime,
    CI_EN: fmtTime(K.checkinTime, "en"), CO_EN: fmtTime(K.checkoutTime, "en"),
    FREE_DAYS: String(K.freeCancelDays),
    K_ZIP: K.zip, T_ZIP: T.zip,
    K_ADDR_JA: K.addressJa, T_ADDR_JA: T.addressJa,
    K_ADDR_EN: K.addressEn, T_ADDR_EN: T.addressEn,
    K_AIRPORT: String(K.fromAirportCarMin), T_AIRPORT: String(T.fromAirportCarMin),
    K_STATION: String(K.fromStationWalkMin), T_STATION: String(T.fromStationWalkMin),
    K_TENJIN: String(K.toTenjinWalkMin), T_TENJIN: String(T.toTenjinWalkMin),
    K_HAKATA: String(K.toHakataWalkMin), T_HAKATA: String(T.toHakataWalkMin),
  };
  let out = template;
  for (const [k, v] of Object.entries(MAP)) out = out.replaceAll(`{{${k}}}`, v);
  const leftover = out.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (leftover) throw new Error(`[llms] 未解決のプレースホルダ: ${[...new Set(leftover)].join(", ")}。renderLlms の MAP に追加してください。`);
  return out;
}

export const LLMS_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
};

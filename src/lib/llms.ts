// llms.txt / llms-full.txt のビルド時レンダリング
// 数値（Airbnb評価・件数・取得日）は property_facts を単一ソースとして注入し、
// サイト表示と常に一致させる。Last updated はビルド日。
import { getPropertyFacts } from "./propertyFacts";

export async function renderLlms(template: string): Promise<string> {
  const buildDate = new Date().toISOString().slice(0, 10);
  const { facts, ratingAsOf } = await getPropertyFacts();
  return template
    .replaceAll("{{K_RATING}}", facts.kiyokawa.rating)
    .replaceAll("{{K_COUNT}}", facts.kiyokawa.reviewCount)
    .replaceAll("{{T_RATING}}", facts.takasago.rating)
    .replaceAll("{{T_COUNT}}", facts.takasago.reviewCount)
    .replaceAll("{{AS_OF}}", ratingAsOf)
    .replaceAll("{{UPDATED}}", buildDate);
}

export const LLMS_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
};

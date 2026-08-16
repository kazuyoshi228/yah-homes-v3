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
  return (v: string) =>
    v.replace(/\{ci\}/g, ci).replace(/\{co\}/g, co).replace(/\{cap\}/g, cap);
}

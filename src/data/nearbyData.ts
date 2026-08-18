// yah.homes — 周辺スポット距離表（GEO: AI引用・地図系クエリ対応）
// 対象5スポットはユーザー指定（2026-07-14）。
// 距離・所要時間の正本は property_facts の spot*（/admin/properties）。
// このファイルは各言語の「言い回しテンプレート」だけを持ち、数値を書かない
// （5言語×2棟×5行=50値の直書きが管理画面と無関係に残っていた 2026-08-18 監査の是正）。
import type { Locale } from "../i18n/config";
import type { PropertyFacts } from "../lib/propertyFacts";

export interface NearbyRow {
  /** スポット名（各言語） */
  name: string;
  /** 清川からの距離・所要時間 */
  kiyokawa: string;
  /** 高砂からの距離・所要時間 */
  takasago: string;
}

export interface NearbyData {
  title: string;
  rows: NearbyRow[];
}

interface NearbyTpl {
  title: string;
  names: { market: string; sumiyoshi: string; canal: string; nakasu: string; ohori: string };
  /** {min}=分 {dist}=距離 {walk}/{taxi}=中洲の2値 */
  walk: string;
  walkTaxi: string;
  car: string;
  m: string;
  km: string;
}

const TPL: Record<Locale, NearbyTpl> = {
  en: {
    title: "Distances to Popular Spots",
    names: { market: "Yanagibashi Rengo Market", sumiyoshi: "Sumiyoshi Shrine", canal: "Canal City Hakata", nakasu: "Nakasu (yatai food stalls)", ohori: "Ohori Park" },
    walk: "About {min} min on foot ({dist})", walkTaxi: "About {walk} min on foot / {taxi} min by taxi",
    car: "About {min} min by car ({dist})", m: "{v} m", km: "{v} km",
  },
  ja: {
    title: "人気スポットまでの距離",
    names: { market: "柳橋連合市場", sumiyoshi: "住吉神社", canal: "キャナルシティ博多", nakasu: "中洲（屋台街）", ohori: "大濠公園" },
    walk: "徒歩約{min}分（{dist}）", walkTaxi: "徒歩約{walk}分／タクシー約{taxi}分",
    car: "車で約{min}分（{dist}）", m: "{v}m", km: "{v}km",
  },
  ko: {
    title: "인기 스팟까지의 거리",
    names: { market: "야나기바시 연합시장", sumiyoshi: "스미요시 신사", canal: "캐널시티 하카타", nakasu: "나카스(야타이 거리)", ohori: "오호리 공원" },
    walk: "도보 약 {min}분({dist})", walkTaxi: "도보 약 {walk}분／택시 약 {taxi}분",
    car: "차로 약 {min}분({dist})", m: "{v}m", km: "{v}km",
  },
  zh: {
    title: "到人氣景點的距離",
    names: { market: "柳橋連合市場", sumiyoshi: "住吉神社", canal: "博多運河城（Canal City）", nakasu: "中洲（屋台街）", ohori: "大濠公園" },
    walk: "步行約{min}分鐘（{dist}）", walkTaxi: "步行約{walk}分鐘／計程車約{taxi}分鐘",
    car: "開車約{min}分鐘（{dist}）", m: "{v}m", km: "{v}km",
  },
  th: {
    title: "ระยะทางไปยังสถานที่ยอดนิยม",
    names: { market: "ตลาดยานางิบาชิ", sumiyoshi: "ศาลเจ้าสุมิโยชิ", canal: "คาแนลซิตี้ ฮากาตะ", nakasu: "นากาสุ (ถนนรถเข็นอาหาร)", ohori: "สวนโอโฮริ" },
    walk: "เดินประมาณ {min} นาที ({dist})", walkTaxi: "เดินประมาณ {walk} นาที / แท็กซี่ประมาณ {taxi} นาที",
    car: "ขับรถประมาณ {min} นาที ({dist})", m: "{v} ม.", km: "{v} กม.",
  },
};

/** SSoT の spot* から言語別の距離表を組み立てる（PropertyDetail / ComparisonTable 共用） */
export function getNearby(lang: Locale, K: PropertyFacts, T: PropertyFacts): NearbyData {
  const t = TPL[lang];
  const dist = (m: number) =>
    m < 1000 ? t.m.replace("{v}", String(m)) : t.km.replace("{v}", String(Number((m / 1000).toFixed(1))));
  const walk = (min: number, m: number) => t.walk.replace("{min}", String(min)).replace("{dist}", dist(m));
  const car = (min: number, m: number) => t.car.replace("{min}", String(min)).replace("{dist}", dist(m));
  const nakasu = (w: number, x: number) => t.walkTaxi.replace("{walk}", String(w)).replace("{taxi}", String(x));
  return {
    title: t.title,
    rows: [
      { name: t.names.market, kiyokawa: walk(K.spotMarketMin, K.spotMarketM), takasago: walk(T.spotMarketMin, T.spotMarketM) },
      { name: t.names.sumiyoshi, kiyokawa: walk(K.spotSumiyoshiMin, K.spotSumiyoshiM), takasago: walk(T.spotSumiyoshiMin, T.spotSumiyoshiM) },
      { name: t.names.canal, kiyokawa: walk(K.spotCanalMin, K.spotCanalM), takasago: walk(T.spotCanalMin, T.spotCanalM) },
      { name: t.names.nakasu, kiyokawa: nakasu(K.spotNakasuWalkMin, K.spotNakasuTaxiMin), takasago: nakasu(T.spotNakasuWalkMin, T.spotNakasuTaxiMin) },
      { name: t.names.ohori, kiyokawa: car(K.spotOhoriCarMin, K.spotOhoriM), takasago: car(T.spotOhoriCarMin, T.spotOhoriM) },
    ],
  };
}

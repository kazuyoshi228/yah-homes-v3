#!/usr/bin/env node
/**
 * property_facts の初回投入スクリプト（種）。
 *
 * ここは「正本」ではない。正本は Firestore `property_facts/{key}`（/admin/properties で編集）。
 * 表示経路からは完全に切り離してある — 以前は propertyFacts.ts の DEFAULTS が
 * 同じ値を持ち、Firestore が読めないときに静かに古い値でサイトが公開されていた
 * （2026-08-16 に実際に評価が 47件/48件でズレた）。種と正本を混ぜないための隔離。
 *
 * 使い方: GOOGLE_APPLICATION_CREDENTIALS を設定して
 *   node scripts/seed-property-facts.mjs            （dry-run）
 *   node scripts/seed-property-facts.mjs --write    （書き込み・既存は上書きしない）
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const SEED = {
  // 2026-08-18 本番実値のスナップショットに同期（フィールド欠落で復旧時に
  // ビルド/予約が止まる事故を防ぐ。値を変える正本は /admin/properties）
  kiyokawa: {
    addressEn: "3-3-1 Kiyokawa, Chuo-ku, Fukuoka-shi, Fukuoka 810-0005", addressJa: "福岡県福岡市中央区清川3-3-1", airCon: 1, audio: 1,
    bath: 1, bathtub: 1, bedDouble: 3, bedSingle: 1,
    bedroomLayout: "BR1: シングル1 / BR2: ダブル2 / BR3: ダブル1", bedrooms: 3, bookingCutoffDays: 1, bookingCutoffTime: "23:59",
    bookingMaxMonths: 12, capacity: 7, checkinEndTime: "", checkinTime: "16:00",
    checkoutTime: "10:00", coAlarm: 0, dryer: 1, floorAreaM2: 109,
    floors: 3, freeCancelDays: 8, fromAirportCarMin: 18, fromStationWalkMin: 15,
    kitchen: 1, layoutLabel: "3LDK", longStay: 1, mapUrl: "https://maps.app.goo.gl/DP6xuPWf132uRrv76",
    nearestStation: "渡辺通", parking: 1, parkingSize: "幅 2,000mm × 奥行 5,000mm", parkingSpaces: 1,
    rating: "4.77", registerUrl: "https://zfrmz.jp/TcYXUliEZ84JkJSVzSLi", reviewCount: "48", selfCheckin: 1,
    shower: 0, sink: 1, smokingAllowed: 0, spotCanalCarMin: 0,
    spotCanalM: 1200, spotCanalMin: 15, spotDazaifuCarMin: 30, spotMarketM: 550,
    spotMarketMin: 7, spotNakasuTaxiMin: 5, spotNakasuWalkMin: 20, spotOhoriCarMin: 10,
    spotOhoriM: 3000, spotSumiyoshiM: 1200, spotSumiyoshiMin: 15, spotYakuinWalkMin: 10,
    streetAddressEn: "Kiyokawa 3-3-1", studyDesk: 1, theater: 0, toHakataCarMin: 10,
    toHakataSubwayMin: 10, toHakataWalkMin: 25, toTenjinCarMin: 8, toTenjinWalkMin: 20,
    toilet: 2, tvInch: 55, washer: 1, wifi: 1,
    zip: "810-0005",
  },
  takasago: {
    addressEn: "1-18-7 Takasago, Chuo-ku, Fukuoka-shi, Fukuoka 810-0011", addressJa: "福岡県福岡市中央区高砂1-18-7", airCon: 1, audio: 0,
    bath: 1, bathtub: 1, bedDouble: 1, bedSingle: 4,
    bedroomLayout: "BR1: ダブル1 / BR2: シングル2 / BR3: シングル2", bedrooms: 3, bookingCutoffDays: 1, bookingCutoffTime: "23:59",
    bookingMaxMonths: 12, capacity: 6, checkinEndTime: "", checkinTime: "16:00",
    checkoutTime: "10:00", coAlarm: 0, dryer: 0, floorAreaM2: 100,
    floors: 3, freeCancelDays: 8, fromAirportCarMin: 20, fromStationWalkMin: 8,
    kitchen: 1, layoutLabel: "3LDK", longStay: 1, mapUrl: "https://maps.app.goo.gl/Af1zTMDSM5NB11oZ6",
    nearestStation: "渡辺通", parking: 1, parkingSize: "フリースペース", parkingSpaces: 1,
    rating: "4.68", registerUrl: "https://forms.zohopublic.jp/airstar1/form/yahhomestakasagoGuestRegistrationForm/formperma/t9QlFwTbkseWYDqB0n8-bcOH_8H36jaAPV5u8fNb-S4", reviewCount: "40", selfCheckin: 1,
    shower: 1, sink: 3, smokingAllowed: 0, spotCanalCarMin: 10,
    spotCanalM: 1400, spotCanalMin: 18, spotDazaifuCarMin: 30, spotMarketM: 800,
    spotMarketMin: 10, spotNakasuTaxiMin: 7, spotNakasuWalkMin: 25, spotOhoriCarMin: 10,
    spotOhoriM: 2700, spotSumiyoshiM: 1200, spotSumiyoshiMin: 15, spotYakuinWalkMin: 0,
    streetAddressEn: "Takasago 1-18-7", studyDesk: 1, theater: 1, toHakataCarMin: 10,
    toHakataSubwayMin: 10, toHakataWalkMin: 25, toTenjinCarMin: 5, toTenjinWalkMin: 15,
    toilet: 2, tvInch: 75, washer: 1, wifi: 1,
    zip: "810-0011",
  },
};
const META = { ratingAsOf: "2026-08-16" };

const write = process.argv.includes("--write");
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

for (const [key, value] of [...Object.entries(SEED), ["meta", META]]) {
  const ref = db.collection("property_facts").doc(key);
  const snap = await ref.get();
  if (snap.exists) { console.log(`skip ${key}（既存・上書きしない）`); continue; }
  if (!write) { console.log(`would create ${key}`); continue; }
  await ref.set(value);
  console.log(`created ${key}`);
}
if (!write) console.log("\ndry-run です。書き込むには --write を付けてください。");

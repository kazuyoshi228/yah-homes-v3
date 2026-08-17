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
  kiyokawa: {
    capacity: 7, bedrooms: 3, bedDouble: 3, bedSingle: 1,
    bath: 1, shower: 0, sink: 1, toilet: 2,
    rating: "4.77", reviewCount: "48",
    checkinTime: "16:00", checkoutTime: "10:00", checkinEndTime: "", freeCancelDays: 8,
    washer: 1, dryer: 0, audio: 1, tvInch: 55, studyDesk: 1, parking: 1, theater: 0,
    fromAirportCarMin: 18, fromStationWalkMin: 15, nearestStation: "渡辺通",
    toTenjinWalkMin: 20, toHakataWalkMin: 25,
    spotMarketMin: 7, spotMarketM: 550, spotSumiyoshiMin: 15, spotSumiyoshiM: 1200,
    spotCanalMin: 15, spotCanalM: 1200, spotNakasuWalkMin: 20, spotNakasuTaxiMin: 5,
    spotOhoriCarMin: 10, spotOhoriM: 3000,
  },
  takasago: {
    capacity: 6, bedrooms: 3, bedDouble: 1, bedSingle: 4,
    bath: 1, shower: 1, sink: 3, toilet: 2,
    rating: "4.68", reviewCount: "40",
    checkinTime: "16:00", checkoutTime: "10:00", checkinEndTime: "", freeCancelDays: 8,
    washer: 1, dryer: 0, audio: 1, tvInch: 75, studyDesk: 0, parking: 1, theater: 1,
    fromAirportCarMin: 20, fromStationWalkMin: 8, nearestStation: "渡辺通",
    toTenjinWalkMin: 15, toHakataWalkMin: 25,
    spotMarketMin: 10, spotMarketM: 800, spotSumiyoshiMin: 15, spotSumiyoshiM: 1200,
    spotCanalMin: 18, spotCanalM: 1400, spotNakasuWalkMin: 25, spotNakasuTaxiMin: 7,
    spotOhoriCarMin: 10, spotOhoriM: 2700,
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

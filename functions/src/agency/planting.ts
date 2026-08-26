/**
 * 植栽メンテ／外構清掃 — 業者ポータルの公開エンドポイント。
 * 中身は portal.ts に共通化した（2026-08-25・外構清掃の追加時。280行の複製を作らないため）。
 * ここは「どの設定でポータルを開くか」だけを持つ。
 */
import { onRequest } from "firebase-functions/v2/https";
import { BEDS24_WRITE_REFRESH } from "../beds24Client.js";
import { PORTALS, handlePortal, portalToken } from "./portal.js";

const REGION = "asia-northeast1";
const OPTS = { region: REGION, secrets: [BEDS24_WRITE_REFRESH], maxInstances: 2 };

/** 植栽（花屋アン・清川）。既に運用中のURLなので関数名は変えない */
export const plantingCal = onRequest(OPTS, (req, res) => handlePortal(PORTALS.planting, req, res));

/** 外構清掃（清川）。業者は未定＝ページで名乗ってもらう */
export const exteriorCal = onRequest(OPTS, (req, res) => handlePortal(PORTALS.exterior, req, res));

/** オーナー側のトークン管理（agencyApi から呼ぶ） */
export async function plantingToken(db: FirebaseFirestore.Firestore, rotate: boolean): Promise<string> {
  return portalToken(db, "planting", rotate);
}
export async function exteriorToken(db: FirebaseFirestore.Firestore, rotate: boolean): Promise<string> {
  return portalToken(db, "exterior", rotate);
}

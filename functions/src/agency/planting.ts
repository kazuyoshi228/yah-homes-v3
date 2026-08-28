/**
 * 植栽メンテ／外構清掃 — 業者ポータルの公開エンドポイント。
 * 中身は portal.ts に共通化した（2026-08-25・外構清掃の追加時。280行の複製を作らないため）。
 * ここは「どの設定でポータルを開くか」だけを持つ。
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { BEDS24_WRITE_REFRESH } from "../beds24Client.js";
import { PORTALS, handlePortal, portalToken } from "./portal.js";

const REGION = "asia-northeast1";
/* Gmailの委任鍵。これが無いと sendNotice が「未設定です」で落ち、日程選択の通知が飛ばない。
   2026-08-28 まで宣言が抜けており、3ポータルの通知は一度も届いていなかった */
const AGENCY_MAILER_KEY = defineSecret("AGENCY_MAILER_KEY");
const OPTS = { region: REGION, secrets: [BEDS24_WRITE_REFRESH, AGENCY_MAILER_KEY], maxInstances: 2 };

/** 植栽（花屋アン・清川）。既に運用中のURLなので関数名は変えない */
export const plantingCal = onRequest(OPTS, (req, res) => handlePortal(PORTALS.planting, req, res));

/** 外構清掃（清川）。業者は未定＝ページで名乗ってもらう */
export const exteriorCal = onRequest(OPTS, (req, res) => handlePortal(PORTALS.exterior, req, res));

/** 快適クリーン（清川・水まわり＋屋外）。作業ごとにチェックアウト日を1つ決める */
export const kaitekiCal = onRequest(OPTS, (req, res) => handlePortal(PORTALS.kaiteki, req, res));

/** オーナー側のトークン管理（agencyApi から呼ぶ） */
export async function plantingToken(db: FirebaseFirestore.Firestore, rotate: boolean): Promise<string> {
  return portalToken(db, "planting", rotate);
}
export async function exteriorToken(db: FirebaseFirestore.Firestore, rotate: boolean): Promise<string> {
  return portalToken(db, "exterior", rotate);
}
export async function kaitekiToken(db: FirebaseFirestore.Firestore, rotate: boolean): Promise<string> {
  return portalToken(db, "kaiteki", rotate);
}

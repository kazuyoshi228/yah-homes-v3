/* 管理画面クライアントの共通設定（リファクタ⑤）。
   以前は FB_CONFIG が管理14ページ＋AdminNav に丸ごと複製されており、
   appId 変更などのたびに15箇所の修正が要った。エンドポイントも同様。
   ※ここにあるのはすべて公開情報（Firebase Web設定・関数URL）。秘密は置かない。 */

export const FB_CONFIG = {
  apiKey: "AIzaSyBgHbTL5caL-itDIFTlSZNMPeHNsSnwEDs",
  authDomain: "yah-homes.firebaseapp.com",
  projectId: "yah-homes",
  appId: "1:18500698213:web:8b4cf08b97d916c216068c",
} as const;

const FN = "https://asia-northeast1-yah-homes.cloudfunctions.net";
/** Firebase Web SDK のCDNベース。バージョンはここだけで管理（41箇所の直書きを禁止） */
export const FB_SDK = "https://www.gstatic.com/firebasejs/10.12.2";
export const ENDPOINTS = {
  adminOps: `${FN}/adminOps`,
  adminUsers: `${FN}/adminUsers`,
  adminBookings: `${FN}/adminBookings`,
  adminProperties: `${FN}/adminProperties`,
  adminTemplates: `${FN}/adminTemplates`,
  adminMailPreview: `${FN}/adminMailPreview`,
  adminSecrets: `${FN}/adminSecrets`,
  adminInbox: `${FN}/adminInbox`,
  adminRebuild: `${FN}/adminRebuild`,
  partnersAdmin: `${FN}/partnersAdmin`,
  messagesApi: `${FN}/messagesApi`,
  // 公開系（予約・問い合わせ・パートナー）。ページ側での FN 直書きを禁止
  contact: `${FN}/contact`,
  // 満室で行き止まりになった人からメールを受ける（docs/spec_availability_alert_202609.md）
  alertSignup: `${FN}/alertSignup`,
  partnersApply: `${FN}/partnersApply`,
  bookingApi: `${FN}/bookingApi`,
  bookCreate: `${FN}/bookCreate`,
  accountApi: `${FN}/accountApi`,
} as const;

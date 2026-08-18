/* Beds24 書き込みクライアント（リファクタ②-2: functions/index.ts から分離）。
   ※beds24.ts（定点観測・週次スコアカード）とは別モジュール。あちらは読み取りと
   レポート、こちらは予約の書き込みが責務。名前が紛らわしいが統合しないこと。
   予約の作成・取消・受信箱メッセージ・備考の低レベルAPI呼び出しだけを持つ。
   予約フローの判断（いつ呼ぶか）は index.ts 側。ここは「どう呼ぶか」のみ。 */
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";

/** createBeds24Booking が読む最小限の形（index.ts の BookingDoc に依存しない） */
export type Beds24BookingInput = {
  prop: string; checkin: string; checkout: string; guests: number; total: number;
  name?: unknown; email?: unknown; phone?: unknown; arrival?: unknown; leadGuest?: unknown;
} & Record<string, unknown>;

// メール通知用シークレット（`firebase functions:secrets:set` で登録）
// SMTP_USER: 送信元 Gmail/Workspace アドレス / SMTP_PASS: アプリパスワード /
export const BEDS24_WRITE_REFRESH = defineSecret("BEDS24_WRITE_REFRESH");

export const BEDS24_API = "https://beds24.com/api/v2";

// 認証: read専用 long life token（BEDS24_TOKEN・定点観測と共用・2026-08-08に招待コード方式から差替）
// test = 検証用物件 yah.homes test1（デモ面にのみカードを出す）
export const BOOKING_PROP_IDS: Record<string, number> = { kiyokawa: 278158, takasago: 291238, test: 346442 };
/** Beds24 propertyId → 棟の表示名（定点・週次レポートの集計キー。二重定義を禁止） */
export const BEDS24_PROP_LABEL: Record<number, string> = { 278158: "清川", 291238: "高砂" };
/** Functions 共通のサービスアカウント・GA4プロパティ（複数ファイルでの直書きを禁止） */
export const SA = "yah-homes@appspot.gserviceaccount.com";
export const GA4_PROPERTY = "539535968"; // www.yah.homes

// 書き込みに使う roomId。清川・高砂は運営会社アカウントからリンクされた物件で、
// linkedProperties: true の書込トークン（2026-08-10 発行）で到達できる。
export const BOOKING_ROOM_IDS: Record<string, number> = {
  kiyokawa: 580741,
  takasago: 608871,
  test: 715198,
};

// ─── Beds24 書き込み（予約作成）───
// 書込を許可する物件の許可リスト。ここに無いIDへは書き込まない。
// roomId 未設定と合わせた二重の防御は維持する（棟を増やすときは両方に足す）。
export const BEDS24_WRITE_ALLOWED = new Set<number>([278158, 291238, 346442]);

let beds24WriteTokenCache: { token: string; expires: number } | null = null;

/** リフレッシュトークンからアクセストークンを取得する（24時間有効・23時間キャッシュ）。 */
export async function beds24WriteToken(): Promise<string> {
  if (beds24WriteTokenCache && beds24WriteTokenCache.expires > Date.now()) return beds24WriteTokenCache.token;
  const r = await fetch(`${BEDS24_API}/authentication/token`, {
    headers: { refreshToken: BEDS24_WRITE_REFRESH.value() },
  });
  const j = (await r.json()) as { token?: string; expiresIn?: number };
  if (!j.token) throw new Error("beds24 write token refresh failed");
  const ttl = Math.max(600, Math.min((j.expiresIn ?? 86400) - 3600, 82800));
  beds24WriteTokenCache = { token: j.token, expires: Date.now() + ttl * 1000 };
  return j.token;
}

/** 書込先の解決。許可リストに無い、または roomId が未設定なら null（＝書き込まない）。 */
export function beds24WriteTarget(prop: string): { propertyId: number; roomId: number } | null {
  const propertyId = BOOKING_PROP_IDS[prop];
  const roomId = BOOKING_ROOM_IDS[prop];
  if (!propertyId || !roomId || !BEDS24_WRITE_ALLOWED.has(propertyId)) return null;
  return { propertyId, roomId };
}

/** Beds24 の予約を取り消す（status を cancelled に更新する。削除はしない）。 */
export async function cancelBeds24Booking(beds24Id: number): Promise<void> {
  const r = await fetch(`${BEDS24_API}/bookings`, {
    method: "POST",
    headers: { token: await beds24WriteToken(), "Content-Type": "application/json" },
    body: JSON.stringify([{ id: beds24Id, status: "cancelled" }]),
  });
  const j = (await r.json()) as Array<{ success?: boolean; errors?: unknown }>;
  if (!j?.[0]?.success) throw new Error(`beds24 cancel failed: ${JSON.stringify(j?.[0]?.errors ?? j).slice(0, 200)}`);
}

export async function noteBeds24NewBooking(beds24Id: number, text: string): Promise<void> {
  try {
    await postBeds24Note(beds24Id, "guest", `【直販システム】公式サイトから新しいご予約が入りました。\n${text}`);
    await postBeds24Note(beds24Id, "internalNote", text);
  } catch (err) {
    logger.warn("beds24 new booking note failed", { beds24Id, err: String(err).slice(0, 120) });
  }
}

/** bookings/messages への投稿（新規予約・キャンセル通知で共用） */
export async function postBeds24Note(beds24Id: number, source: string, message: string): Promise<void> {
  const r = await fetch(`${BEDS24_API}/bookings/messages`, {
    method: "POST",
    headers: { token: await beds24WriteToken(), "Content-Type": "application/json" },
    body: JSON.stringify([{ bookingId: beds24Id, message: message.slice(0, 500), source }]),
  });
  const j = (await r.json()) as Array<{ success?: boolean }>;
  if (!j?.[0]?.success) logger.warn("beds24 note failed", { beds24Id, source });
}

export async function noteBeds24Cancellation(beds24Id: number, text: string): Promise<void> {
  try {
    await postBeds24Note(beds24Id, "guest", `【直販システム】このご予約はキャンセルされました。\n${text}`);
    await postBeds24Note(beds24Id, "internalNote", text);
  } catch (err) {
    logger.warn("beds24 cancel note failed", { beds24Id, err: String(err).slice(0, 120) });
  }
}

export async function noteBeds24(beds24Id: number, message: string): Promise<void> {
  try {
    const r = await fetch(`${BEDS24_API}/bookings/messages`, {
      method: "POST",
      headers: { token: await beds24WriteToken(), "Content-Type": "application/json" },
      body: JSON.stringify([{ bookingId: beds24Id, message: message.slice(0, 900), source: "internalNote" }]),
    });
    const j = (await r.json()) as Array<{ success?: boolean }>;
    if (!j?.[0]?.success) logger.warn("noteBeds24 not saved", { beds24Id });
  } catch (err) {
    logger.warn("noteBeds24 failed", { beds24Id, err: String(err).slice(0, 120) });
  }
}

/** Beds24 に予約を作成し、Beds24側の予約IDを返す。 */
export async function createBeds24Booking(bookingId: string, b: Beds24BookingInput): Promise<number> {
  const target = beds24WriteTarget(b.prop);
  if (!target) throw new Error(`beds24 write not permitted for ${b.prop}`);
  if (!BEDS24_WRITE_ALLOWED.has(target.propertyId)) throw new Error(`beds24 write blocked: ${target.propertyId}`);

  const full = String(b.name ?? "").trim();
  const sp = full.indexOf(" ");
  const firstName = sp > 0 ? full.slice(0, sp) : full || "Guest";
  const lastName = sp > 0 ? full.slice(sp + 1) : "";
  const nights = Math.round((Date.parse(b.checkout) - Date.parse(b.checkin)) / 86400000);
  const arrival = String(b.arrival ?? "").trim();

  const payload = [{
    roomId: target.roomId,
    status: "confirmed",
    arrival: b.checkin,
    departure: b.checkout,
    numAdult: b.guests,
    numChild: 0,
    firstName,
    lastName,
    email: b.email,
    phone: String(b.phone ?? ""),
    price: b.total,
    // Beds24 は referer を "API" に上書きするため、直販の識別は custom1 / reference で行う
    custom1: `yah.homes direct / ${bookingId}`,
    reference: bookingId,
    notes: [
      "yah.homes 公式サイトからの直接予約",
      `予約ID: ${bookingId}`,
      arrival ? `到着予定: ${arrival}` : "",
      b.leadGuest ? `代表者: ${String(b.leadGuest)}` : "",
    ].filter(Boolean).join("\n"),
    invoiceItems: [{
      type: "charge",
      description: `${nights}泊${b.guests}名 宿泊料・宿泊税・清掃料込み`,
      qty: 1,
      amount: b.total,
    }],
  }];

  const r = await fetch(`${BEDS24_API}/bookings`, {
    method: "POST",
    headers: { token: await beds24WriteToken(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = (await r.json()) as Array<{ success?: boolean; new?: { id?: number }; errors?: unknown }>;
  const row = j?.[0];
  if (!row?.success || !row.new?.id) throw new Error(`beds24 create failed: ${JSON.stringify(row?.errors ?? j).slice(0, 200)}`);
  return row.new.id;
}

/** Beds24 の予約へメッセージを複製する（Airbnb等と同じ受信箱に並べる） */
// ─── 問い合わせを Beds24 の受信箱に載せる（spec_inquiry_to_beds24_202608.md）───
// Beds24 のメッセージは予約IDにしか紐づかないため、問い合わせ1件につき
// status:"inquiry" の予約を1件作り、その受信箱にやり取りを流す。
// 宛先は本番サイトに出ない専用物件（346442）— 清川・高砂の在庫と受信箱を汚さない。
export const INQUIRY_BEDS24 = { propertyId: 346442, roomId: 715198 };

export async function createBeds24Inquiry(
  threadId: string, name: string, email: string, message: string,
): Promise<number | null> {
  const d = new Date(Date.now() + 86400000);          // Beds24 は日程必須。過去日は拒否されうるので翌日から1泊
  const arrival = d.toISOString().slice(0, 10);
  const departure = new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
  const sp = name.indexOf(" ");
  const payload = [{
    roomId: INQUIRY_BEDS24.roomId,
    // status は "new"（通常の予約と同じ）。"inquiry" は Beds24 の画面で既定の絞り込みから
    // 外れて見つけられないことがあり、「Beds24 だけ見ていれば拾える」という目的を果たせない。
    // 宛先が販売しない専用物件なので、在庫を持つステータスでも実害がない。
    status: "new",
    arrival, departure,
    numAdult: 1, numChild: 0,
    firstName: sp > 0 ? name.slice(0, sp) : name || "Guest",
    lastName: sp > 0 ? name.slice(sp + 1) : "",
    email,
    price: 0,
    custom1: `yah.homes inquiry / ${threadId}`,
    reference: threadId,
    notes: [
      "【お問い合わせ】yah.homes 公式サイトのフォームより",
      "※このカードは予約ではありません。日程・人数はダミーです。",
      "※やり取りはメッセージ受信箱に届きます。返信は yah.homes の管理画面「メッセージ」から行ってください（Beds24 から返信してもお客様には届きません）。",
      `お名前: ${name} ／ メール: ${email}`,
    ].join("\n"),
  }];
  const r = await fetch(`${BEDS24_API}/bookings`, {
    method: "POST",
    headers: { token: await beds24WriteToken(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = (await r.json()) as Array<{ success?: boolean; new?: { id?: number }; errors?: unknown }>;
  const row = j?.[0];
  if (!row?.success || !row.new?.id) {
    logger.warn("beds24 inquiry create failed", { e: JSON.stringify(row?.errors ?? j).slice(0, 200) });
    return null;
  }
  // 1通目も受信箱へ。これが Airstar が問い合わせに気づく主経路になる
  await noteBeds24Message(row.new.id, "guest", `【お問い合わせ】${name} 様（${email}）\n${message}`)
    .catch((e: unknown) => logger.warn("beds24 inquiry first message failed", { e: String(e).slice(0, 120) }));
  return row.new.id;
}

/** 問い合わせのやり取りを Beds24 の受信箱へ複製する。
 *  発言者は接頭辞で示す（予約スレッドの【直販ゲスト】/【yah.homes 運営】と同じ規則）。
 *  運営側も source:"guest" で送るのは、source:"host" が受信箱に描画されないため。
 *  なお Beds24 から返信してもお客様には届かない（返信は管理画面から）。 */
export async function mirrorInquiryToBeds24(
  t: Record<string, unknown>, from: "guest" | "host", text: string,
): Promise<void> {
  const id = Number(t.beds24Id ?? 0);
  if (!id) return;
  const label = from === "guest" ? "【お問い合わせ】" : "【yah.homes 運営】";
  await noteBeds24Message(id, "guest", `${label}${text}`);
}

export async function noteBeds24Message(beds24Id: number, from: "guest" | "host", message: string): Promise<void> {
  const r = await fetch(`${BEDS24_API}/bookings/messages`, {
    method: "POST",
    headers: { token: await beds24WriteToken(), "Content-Type": "application/json" },
    body: JSON.stringify([{ bookingId: beds24Id, message: message.slice(0, 900), source: from }]),
  });
  const j = (await r.json()) as Array<{ success?: boolean }>;
  if (!j?.[0]?.success) logger.warn("beds24 message mirror not saved", { beds24Id });
}


/**
 * yah.homes Cloud Functions
 *
 * - health  : ヘルスチェック
 * - contact : 問い合わせフォーム送信（B8）
 *   クライアント→HTTP Function→Firestore(Admin SDK) の一方向。
 *   Firestore ルールは全 deny のまま（クライアント直アクセス経路なし）。
 *   保存後、管理者通知＋送信者向け自動返信（英語）を送信。メール失敗は非致命（保存は成功扱い）。
 */
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import Stripe from "stripe";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import nodemailer from "nodemailer";

initializeApp();
const db = getFirestore();

const REGION = "asia-northeast1";

// メール通知用シークレット（`firebase functions:secrets:set` で登録）
// SMTP_USER: 送信元 Gmail/Workspace アドレス / SMTP_PASS: アプリパスワード /
// CONTACT_NOTIFY_TO: 通知の宛先アドレス
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const CONTACT_NOTIFY_TO = defineSecret("CONTACT_NOTIFY_TO");

// 許可オリジン（本番・Firebaseデフォルト・devチャンネル・ローカル）
const ALLOWED_ORIGINS = [
  "https://yah.homes",
  "https://www.yah.homes",
  "https://yah-homes.web.app",
  "https://yah-homes.firebaseapp.com",
];
function corsOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // dev プレビューチャンネル（https://yah-homes--<channel>-<hash>.web.app）
  if (/^https:\/\/yah-homes--[a-z0-9-]+\.web\.app$/.test(origin)) return origin;
  if (/^http:\/\/localhost:\d+$/.test(origin)) return origin;
  return null;
}

export const health = onRequest({ region: REGION }, (_req, res) => {
  res.status(200).json({ status: "ok", service: "yah.homes", ts: Date.now() });
});

export const contact = onRequest(
  { region: REGION, secrets: [SMTP_USER, SMTP_PASS, CONTACT_NOTIFY_TO] },
  async (req, res) => {
  const origin = corsOrigin(req.headers.origin as string | undefined);
  if (origin) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const { name, email, message, lang, website } = (req.body ?? {}) as Record<string, unknown>;

  // ハニーポット（botはこの不可視フィールドを埋める）— 成功を装って破棄
  if (typeof website === "string" && website.trim() !== "") {
    res.status(200).json({ ok: true });
    return;
  }

  // バリデーション
  const nameStr = typeof name === "string" ? name.trim() : "";
  const emailStr = typeof email === "string" ? email.trim() : "";
  const messageStr = typeof message === "string" ? message.trim() : "";
  const langStr = typeof lang === "string" && ["en", "ja", "ko", "zh", "th"].includes(lang) ? lang : "en";

  if (!nameStr || nameStr.length > 200) {
    res.status(400).json({ ok: false, error: "invalid_name" });
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(emailStr) || emailStr.length > 320) {
    res.status(400).json({ ok: false, error: "invalid_email" });
    return;
  }
  if (!messageStr || messageStr.length > 5000) {
    res.status(400).json({ ok: false, error: "invalid_message" });
    return;
  }

  await db.collection("contacts").add({
    name: nameStr,
    email: emailStr,
    message: messageStr,
    lang: langStr,
    createdAt: FieldValue.serverTimestamp(),
    userAgent: (req.headers["user-agent"] as string | undefined)?.slice(0, 500) ?? null,
    referer: (req.headers.referer as string | undefined)?.slice(0, 500) ?? null,
    status: "new",
  });

  // メール通知（失敗しても問い合わせ保存は成功扱い — 非致命）
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  });
  try {
    await transporter.sendMail({
      from: `"yah.homes Contact" <${SMTP_USER.value()}>`,
      to: CONTACT_NOTIFY_TO.value(),
      replyTo: emailStr,
      subject: `【yah.homes】お問い合わせ: ${nameStr}`,
      text: [
        `名前: ${nameStr}`,
        `メール: ${emailStr}`,
        `言語: ${langStr}`,
        ``,
        `--- メッセージ ---`,
        messageStr,
        ``,
        `--- メタ ---`,
        `Referer: ${req.headers.referer ?? "-"}`,
        `確認: https://yah.homes/admin/inbox/`,
      ].join("\n"),
      html: mailHtml({
        heading: "お問い合わせが届きました",
        badge: `言語|${langStr.toUpperCase()}`,
        rows: [
          ["お名前", esc(nameStr)],
          ["メール", `<a href="mailto:${esc(emailStr)}" style="color:#111111;">${esc(emailStr)}</a>`],
          ["流入元", esc(String(req.headers.referer ?? "-"))],
        ],
        blocks: [{ title: "メッセージ", body: esc(messageStr) }],
        cta: { label: "受信箱を開く", href: `${SITE_URL}/admin/inbox/` },
        note: "このメールに返信すると、お客様へ直接届きます。",
      }),
    });
  } catch (err) {
    logger.error("contact mail notification failed", err);
  }

  // 送信者向け自動返信（英語・非致命 — 通知/保存とは独立して失敗を許容）
  // 件名にユーザー入力を含めない（差し込みは本文の名前とメッセージ引用のみ）
  try {
    await transporter.sendMail({
      from: `"yah.homes" <${SMTP_USER.value()}>`,
      to: emailStr,
      replyTo: SMTP_USER.value(),
      subject: "Thank you for contacting yah.homes",
      text: [
        `Dear ${nameStr},`,
        ``,
        `Thank you for reaching out to yah.homes.`,
        `We have received your inquiry, and a member of our team will get back to you within 2–3 business days.`,
        ``,
        `For your reference, here is a copy of your message:`,
        ``,
        `---`,
        messageStr,
        `---`,
        ``,
        `If you have any urgent questions, simply reply to this email.`,
        ``,
        `Warm regards,`,
        `yah.homes`,
        `Whole-house rentals in Fukuoka, Japan`,
        `https://yah.homes`,
        `Operated by Bonfire Inc.`,
      ].join("\n"),
      html: mailHtml({
        heading: "Thank you for contacting yah.homes",
        lead: `Dear ${nameStr}, we have received your inquiry. A member of our team will get back to you within 2–3 business days.`,
        blocks: [{ title: "Your message", body: esc(messageStr) }],
        cta: { label: "See availability", href: `${SITE_URL}/book/` },
        note: "If you have any urgent questions, simply reply to this email.",
      }),
    });
  } catch (err) {
    logger.error("contact auto-reply failed", err);
  }

  res.status(200).json({ ok: true });
  }
);

// ─── パートナー日程申請フォーム（/ja/partners/・design_partners_page.md §4.5-1） ───
// 通知先はページ掲載の連絡先と同一（Secretにしない公開情報）。送信元は既存SMTP_USERを流用。
const PARTNERS_NOTIFY_TO = "kazuyoshi.yamada@bonfire.co.jp";
const PROPERTY_CAPACITY: Record<string, number> = { kiyokawa: 7, takasago: 6, either: 7, both: 6, test: 7 };
const PROPERTY_LABEL: Record<string, string> = { kiyokawa: "清川", takasago: "高砂", either: "どちらでも", both: "両棟はしご泊", test: "検証用" };

/** チェックイン可能は月・火・水のみ（2泊とも平日で完結・§4-1確定文言）。
    暦日の曜日はタイムゾーン非依存で判定する（サーバーTZに影響されない） */
function isMonToWed(dateStr: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return false;
  const day = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return day >= 1 && day <= 3;
}

export const partnersApply = onRequest(
  { region: REGION, secrets: [SMTP_USER, SMTP_PASS] },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    const { name, email, mediaUrl, property, date1, date2, guests, message, lang, website } = (req.body ?? {}) as Record<string, unknown>;
    const applyLang = lang === "ko" ? "ko" : lang === "zh" ? "zh" : "ja";

    // ハニーポット
    if (typeof website === "string" && website.trim() !== "") {
      res.status(200).json({ ok: true });
      return;
    }

    const nameStr = typeof name === "string" ? name.trim() : "";
    const emailStr = typeof email === "string" ? email.trim() : "";
    const mediaStr = typeof mediaUrl === "string" ? mediaUrl.trim() : "";
    const propStr = typeof property === "string" && property in PROPERTY_CAPACITY ? property : "";
    const date1Str = typeof date1 === "string" ? date1.trim() : "";
    const date2Str = typeof date2 === "string" ? date2.trim() : "";
    const guestsNum = Number(guests);
    const messageStr = typeof message === "string" ? message.trim().slice(0, 5000) : "";

    if (!nameStr || nameStr.length > 200) { res.status(400).json({ ok: false, error: "invalid_name" }); return; }
    if (!/^\S+@\S+\.\S+$/.test(emailStr) || emailStr.length > 320) { res.status(400).json({ ok: false, error: "invalid_email" }); return; }
    if (!/^https?:\/\/\S+/.test(mediaStr) || mediaStr.length > 500) { res.status(400).json({ ok: false, error: "invalid_media_url" }); return; }
    if (!propStr) { res.status(400).json({ ok: false, error: "invalid_property" }); return; }
    if (!isMonToWed(date1Str) || !isMonToWed(date2Str)) { res.status(400).json({ ok: false, error: "invalid_date" }); return; }
    if (!Number.isInteger(guestsNum) || guestsNum < 1 || guestsNum > PROPERTY_CAPACITY[propStr]) { res.status(400).json({ ok: false, error: "invalid_guests" }); return; }

    await db.collection("partner_applications").add({
      name: nameStr,
      email: emailStr,
      mediaUrl: mediaStr,
      property: propStr,
      date1: date1Str,
      date2: date2Str,
      guests: guestsNum,
      message: messageStr,
      lang: applyLang,
      createdAt: FieldValue.serverTimestamp(),
      userAgent: (req.headers["user-agent"] as string | undefined)?.slice(0, 500) ?? null,
      status: "new",
    });

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });

    // オーナー通知（件名: 【パートナー申請】棟 日付〜 人数）
    try {
      await transporter.sendMail({
        from: `"yah.homes Partners" <${SMTP_USER.value()}>`,
        to: await notifyRecipients("notifyPartners"),
        replyTo: emailStr,
        subject: `【パートナー申請】${PROPERTY_LABEL[propStr]} ${date1Str}〜 ${guestsNum}名`,
        text: [
          `お名前: ${nameStr}`,
          `メール: ${emailStr}`,
          `媒体URL: ${mediaStr}`,
          `希望棟: ${PROPERTY_LABEL[propStr]}`,
          `第1希望チェックイン: ${date1Str}`,
          `第2希望チェックイン: ${date2Str}`,
          `人数: ${guestsNum}名`,
          `言語: ${applyLang}`,
          ``,
          `--- メッセージ ---`,
          messageStr || "(なし)",
          ``,
          `確認: https://yah.homes/admin/partners/`,
        ].join("\n"),
        html: mailHtml({
          heading: "パートナー宿泊の申請が届きました",
          badge: `言語|${applyLang.toUpperCase()}`,
          rows: [
            ["お名前", esc(nameStr)],
            ["メール", `<a href="mailto:${esc(emailStr)}" style="color:#111111;">${esc(emailStr)}</a>`],
            ["媒体URL", `<a href="${esc(mediaStr)}" style="color:#111111;word-break:break-all;">${esc(mediaStr)}</a>`],
            ["希望棟", esc(PROPERTY_LABEL[propStr])],
            ["第1希望", esc(date1Str)],
            ["第2希望", esc(date2Str)],
            ["人数", `${guestsNum}名`],
          ],
          blocks: [{ title: "メッセージ", body: esc(messageStr || "（なし）") }],
          cta: { label: "申請管理を開く", href: `${SITE_URL}/admin/partners/` },
        }),
      });
    } catch (err) {
      logger.error("partners notify mail failed", err);
    }

    // 申請者への自動返信（ja/ko・replyToはオーナー直通）
    const PROPERTY_LABEL_KO: Record<string, string> = { kiyokawa: "기요카와", takasago: "다카사고", either: "어느 쪽이든", both: "두 동 연박" };
    const PROPERTY_LABEL_ZH: Record<string, string> = { kiyokawa: "清川館", takasago: "高砂館", either: "兩棟皆可", both: "兩棟連住" };
    try {
      await transporter.sendMail({
        from: `"yah.homes" <${SMTP_USER.value()}>`,
        to: emailStr,
        replyTo: PARTNERS_NOTIFY_TO,
        subject: applyLang === "ko" ? "[yah.homes] 파트너 숙박 신청이 접수되었습니다"
          : applyLang === "zh" ? "【yah.homes】已收到您的夥伴住宿申請"
          : "【yah.homes】パートナー宿泊のお申し込みを受け付けました",
        text: applyLang === "zh" ? [
          `${nameStr} 您好`,
          ``,
          `感謝您申請 yah.homes 夥伴住宿。`,
          `我們已收到以下申請內容，將於2〜3個工作天內與您聯繫。`,
          ``,
          `--- 申請內容 ---`,
          `希望入住的棟: ${PROPERTY_LABEL_ZH[propStr] ?? propStr}`,
          `第1希望入住日: ${date1Str}`,
          `第2希望入住日: ${date2Str}`,
          `人數: ${guestsNum}人`,
          `---`,
          ``,
          `如有任何問題，直接回覆此郵件即可。`,
          ``,
          `yah.homes（營運: Bonfire Inc.）`,
          `https://yah.homes/zh/`,
        ].join("\n") : applyLang === "ko" ? [
          `${nameStr} 님`,
          ``,
          `yah.homes 파트너 숙박에 신청해 주셔서 감사합니다.`,
          `아래 내용으로 접수되었습니다. 2〜3영업일 이내에 담당자가 연락드리겠습니다.`,
          ``,
          `--- 신청 내용 ---`,
          `희망 동: ${PROPERTY_LABEL_KO[propStr] ?? propStr}`,
          `1지망 체크인: ${date1Str}`,
          `2지망 체크인: ${date2Str}`,
          `인원: ${guestsNum}명`,
          `---`,
          ``,
          `문의는 이 메일에 그대로 회신해 주세요.`,
          ``,
          `yah.homes (운영: Bonfire Inc.)`,
          `https://yah.homes/ko/`,
        ].join("\n") : [
          `${nameStr} 様`,
          ``,
          `yah.homes パートナー宿泊へのお申し込みをありがとうございます。`,
          `以下の内容で受け付けました。2〜3営業日以内に担当よりご連絡いたします。`,
          ``,
          `--- お申し込み内容 ---`,
          `希望棟: ${PROPERTY_LABEL[propStr]}`,
          `第1希望チェックイン: ${date1Str}`,
          `第2希望チェックイン: ${date2Str}`,
          `人数: ${guestsNum}名`,
          `---`,
          ``,
          `ご質問はこのメールにそのままご返信ください。`,
          ``,
          `yah.homes（運営: ボンファイア株式会社）`,
          `https://yah.homes/ja/`,
        ].join("\n"),
        html: (() => {
          const L = applyLang === "ko"
            ? { h: "파트너 숙박 신청이 접수되었습니다", lead: `${nameStr} 님, 신청해 주셔서 감사합니다. 2~3영업일 이내에 담당자가 연락드립니다.`,
                prop: "희망 숙소", d1: "1지망 체크인", d2: "2지망 체크인", g: "인원", unit: "명",
                label: PROPERTY_LABEL_KO[propStr] ?? propStr, note: "문의는 이 메일에 그대로 회신해 주세요." }
            : applyLang === "zh"
            ? { h: "已收到您的夥伴住宿申請", lead: `${nameStr} 您好，感謝您的申請。我們將於2〜3個工作天內與您聯繫。`,
                prop: "希望房源", d1: "第1希望入住日", d2: "第2希望入住日", g: "人數", unit: "人",
                label: PROPERTY_LABEL_ZH[propStr] ?? propStr, note: "如有問題，請直接回覆這封郵件。" }
            : { h: "パートナー宿泊のお申し込みを受け付けました", lead: `${nameStr} 様　お申し込みありがとうございます。2〜3営業日以内に担当よりご連絡いたします。`,
                prop: "希望棟", d1: "第1希望チェックイン", d2: "第2希望チェックイン", g: "人数", unit: "名",
                label: PROPERTY_LABEL[propStr] ?? propStr, note: "ご質問はこのメールにそのままご返信ください。" };
          return mailHtml({
            heading: L.h,
            lead: L.lead,
            rows: [
              [L.prop, esc(L.label)],
              [L.d1, esc(date1Str)],
              [L.d2, esc(date2Str)],
              [L.g, `${guestsNum}${L.unit}`],
            ],
            note: L.note,
          });
        })(),
      });
    } catch (err) {
      logger.error("partners auto-reply failed", err);
    }

    res.status(200).json({ ok: true });
  }
);

// ─── Beds24 空き状況API（design_partners_page.md §7 / P1 §7-1 前倒し） ───
// 読み取り専用。refresh token は Secret（M2で保存）。propId/roomId は初回に /properties から自動発見してキャッシュ。
const BEDS24_TOKEN = defineSecret("BEDS24_TOKEN");
const BEDS24_WRITE_REFRESH = defineSecret("BEDS24_WRITE_REFRESH");
const BEDS24_WEBHOOK_KEY = defineSecret("BEDS24_WEBHOOK_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const GITHUB_DISPATCH_TOKEN = defineSecret("GITHUB_DISPATCH_TOKEN");
const GA4_API_SECRET = defineSecret("GA4_API_SECRET"); // read専用（bookingApi・定点観測で共用）
const BEDS24_API = "https://beds24.com/api/v2";
// 認証: read専用 long life token（BEDS24_TOKEN・定点観測と共用・2026-08-08に招待コード方式から差替）
// test = 検証用物件 yah.homes test1（デモ面にのみカードを出す）
const BOOKING_PROP_IDS: Record<string, number> = { kiyokawa: 278158, takasago: 291238, test: 346442 };
// 書き込みに使う roomId。清川・高砂は運営会社アカウントからリンクされた物件で、
// linkedProperties: true の書込トークン（2026-08-10 発行）で到達できる。
const BOOKING_ROOM_IDS: Record<string, number> = {
  kiyokawa: 580741,
  takasago: 608871,
  test: 715198,
};

// ─── Beds24 書き込み（予約作成）───
// 書込を許可する物件の許可リスト。ここに無いIDへは書き込まない。
// roomId 未設定と合わせた二重の防御は維持する（棟を増やすときは両方に足す）。
const BEDS24_WRITE_ALLOWED = new Set<number>([278158, 291238, 346442]);

let beds24WriteTokenCache: { token: string; expires: number } | null = null;

/** リフレッシュトークンからアクセストークンを取得する（24時間有効・23時間キャッシュ）。 */
async function beds24WriteToken(): Promise<string> {
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
function beds24WriteTarget(prop: string): { propertyId: number; roomId: number } | null {
  const propertyId = BOOKING_PROP_IDS[prop];
  const roomId = BOOKING_ROOM_IDS[prop];
  if (!propertyId || !roomId || !BEDS24_WRITE_ALLOWED.has(propertyId)) return null;
  return { propertyId, roomId };
}

// ─── 在庫の排他ロック（二重予約の防止）───
// Beds24 は在庫0でも API 経由の書き込みを受け付ける（実測: 在庫が -1 になる）ため、
// 「在庫確認 → 書込」の間に別の予約が割り込む余地を、こちら側で塞ぐ必要がある。
// 宿泊する各日について inventory_locks/{prop}_{date} を1つのトランザクションで確保し、
// 1つでも取れなければ予約を成立させない（オーソリは解放する）。

/** 宿泊日（チェックイン〜チェックアウト前日）の一覧 */
function stayNights(checkin: string, checkout: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${checkin}T00:00:00Z`); d < new Date(`${checkout}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** 全日を確保できたら true。1日でも他の予約が押さえていたら false（何も書かない）。 */
async function acquireInventoryLocks(prop: string, checkin: string, checkout: string, bookingId: string): Promise<boolean> {
  const nights = stayNights(checkin, checkout);
  if (!nights.length) return false;
  const refs = nights.map((d) => db.collection("inventory_locks").doc(`${prop}_${d}`));
  try {
    await db.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...refs);
      for (const snap of snaps) {
        const held = snap.data()?.bookingId as string | undefined;
        if (snap.exists && held && held !== bookingId) throw new Error("locked");
      }
      snaps.forEach((snap, i) => {
        tx.set(refs[i], { prop, date: nights[i], bookingId, at: FieldValue.serverTimestamp() });
      });
    });
    return true;
  } catch (err) {
    if (String(err).includes("locked")) return false;
    throw err;
  }
}

/** 自分が押さえた日のロックだけを解放する（他人のロックは触らない）。 */
async function releaseInventoryLocks(prop: string, checkin: string, checkout: string, bookingId: string): Promise<void> {
  try {
    const nights = stayNights(checkin, checkout);
    const batch = db.batch();
    const snaps = await db.getAll(...nights.map((d) => db.collection("inventory_locks").doc(`${prop}_${d}`)));
    let n = 0;
    for (const snap of snaps) {
      if (snap.exists && snap.data()?.bookingId === bookingId) { batch.delete(snap.ref); n++; }
    }
    if (n) await batch.commit();
  } catch (err) {
    logger.error("releaseInventoryLocks failed", err);
  }
}

/** Beds24 の予約を取り消す（status を cancelled に更新する。削除はしない）。 */
async function cancelBeds24Booking(beds24Id: number): Promise<void> {
  const r = await fetch(`${BEDS24_API}/bookings`, {
    method: "POST",
    headers: { token: await beds24WriteToken(), "Content-Type": "application/json" },
    body: JSON.stringify([{ id: beds24Id, status: "cancelled" }]),
  });
  const j = (await r.json()) as Array<{ success?: boolean; errors?: unknown }>;
  if (!j?.[0]?.success) throw new Error(`beds24 cancel failed: ${JSON.stringify(j?.[0]?.errors ?? j).slice(0, 200)}`);
}

/** Beds24 に予約を作成し、Beds24側の予約IDを返す。 */
async function createBeds24Booking(bookingId: string, b: BookingDoc & Record<string, unknown>): Promise<number> {
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

type AvailCache = { data: Record<string, boolean>; expires: number };
const availCache: Record<string, AvailCache> = {};

// 見積りの短時間キャッシュ（表示用のみ・15〜30秒）。予約確定時の再検証はこれを経由しない。
const quoteCache: Record<string, { data: Record<string, unknown>; expires: number }> = {};
const QUOTE_TTL_MS = 20_000;

/** 1棟ぶんの見積り。Beds24 offers を叩き、表示用に20秒だけキャッシュする。 */
async function quoteFor(
  slug: PropSlug,
  checkin: string,
  checkout: string,
  guests: number,
): Promise<{ data: Record<string, unknown>; cached: boolean }> {
  const key = `${slug}_${checkin}_${checkout}_${guests}`;
  const hit = quoteCache[key];
  if (hit && hit.expires > Date.now()) return { data: hit.data, cached: true };

  const r = await fetch(
    `${BEDS24_API}/inventory/rooms/offers?propertyId=${BOOKING_PROP_IDS[slug]}` +
      `&arrival=${checkin}&departure=${checkout}&numAdults=${guests}`,
    { headers: { token: BEDS24_TOKEN.value() } },
  );
  const j = (await r.json()) as {
    success?: boolean;
    data?: Array<{ roomId?: number; offers?: Array<{ offerId?: number; price?: number; unitsAvailable?: number }> }>;
  };
  const room = j.data?.[0];
  const offer = room?.offers?.[0];

  let data: Record<string, unknown>;
  if (!j.success || !offer || typeof offer.price !== "number" || (offer.unitsAvailable ?? 0) < 1) {
    data = { id: slug, prop: slug, available: false };
  } else {
    const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000);
    const now = Date.now();
    data = {
      id: slug,
      prop: slug,
      available: true,
      total: offer.price,
      currency: "JPY",
      nights,
      guests,
      checkin,
      checkout,
      // 確定直前にサーバー側で再見積りするための参照値（v4 §8-1）
      quote: {
        id: `${slug}_${checkin}_${checkout}_${guests}_${offer.price}_${now}`,
        roomId: room?.roomId ?? null,
        offerId: offer.offerId ?? null,
        fetchedAt: now,
        expiresAt: now + 15 * 60 * 1000,
      },
    };
  }
  quoteCache[key] = { data, expires: Date.now() + QUOTE_TTL_MS };
  return { data, cached: false };
}

/** 1棟ぶんの空室カレンダー（約13ヶ月）。サーバー側で5分キャッシュ。 */
async function calendarFor(slug: PropSlug): Promise<{ dates: Record<string, boolean>; cached: boolean }> {
  const cached = availCache[slug];
  if (cached && cached.expires > Date.now()) return { dates: cached.data, cached: true };

  const start = new Date();
  const end = new Date(start.getTime() + 400 * 86400000); // 1年先まで月送りできるよう13ヶ月分を先読み
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  // 部屋在庫カレンダー（アカウントスコープのreadトークン・propertyIdで棟を指定）
  const r = await fetch(
    `${BEDS24_API}/inventory/rooms/calendar?propertyId=${BOOKING_PROP_IDS[slug]}&startDate=${fmt(start)}&endDate=${fmt(end)}&includeNumAvail=true`,
    { headers: { token: BEDS24_TOKEN.value() } },
  );
  const j = (await r.json()) as { success?: boolean; data?: Array<{ roomId?: number; calendar?: Array<{ from: string; to: string; numAvail?: number }> }> };
  if (!j.success || !j.data) throw new Error("beds24 calendar fetch failed");

  // 日別: いずれかのroomでnumAvail>=1なら空き
  const dates: Record<string, boolean> = {};
  for (const room of j.data) {
    for (const seg of room.calendar ?? []) {
      const from = new Date(`${seg.from}T00:00:00Z`);
      const to = new Date(`${seg.to}T00:00:00Z`);
      for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
        const key = d.toISOString().slice(0, 10);
        const avail = (seg.numAvail ?? 0) >= 1;
        dates[key] = dates[key] || avail;
      }
    }
  }
  availCache[slug] = { data: dates, expires: Date.now() + 5 * 60 * 1000 };
  return { dates, cached: false };
}

type PropSlug = keyof typeof BOOKING_PROP_IDS & string;
const ALL_PROPS: PropSlug[] = ["kiyokawa", "takasago"];

// 空室・見積りAPI。
//   ?props=all                                  → 2棟のカレンダーを1レスポンスで
//   ?props=all&checkin=&checkout=&guests=       → 2棟の見積りを1レスポンスで（Beds24は並列）
//   ?prop=kiyokawa[&checkin=...]                → 従来の1棟モード（代替日の照会などで使用）
// minInstances: 1 — コールドスタート（実測で+0.77秒）が p95 の主因のため常時1台を温める。
export const bookingApi = onRequest(
  { region: REGION, secrets: [BEDS24_TOKEN], serviceAccount: "yah-homes@appspot.gserviceaccount.com", minInstances: 1 },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    // props= は "all"（本番2棟）またはカンマ区切りの棟リスト（デモは検証用物件を足す）
    const propsParam = String(req.query.props ?? "");
    const all = propsParam !== "";
    const slug = String(req.query.prop ?? "");
    const known = (k: string): k is PropSlug => k in BOOKING_PROP_IDS;
    let props: PropSlug[];
    if (all) {
      props = propsParam === "all" ? [...ALL_PROPS] : propsParam.split(",").map((x) => x.trim()).filter(known);
      if (!props.length) { res.status(400).json({ ok: false, error: "invalid_prop" }); return; }
    } else {
      if (!known(slug)) { res.status(400).json({ ok: false, error: "invalid_prop" }); return; }
      props = [slug];
    }

    const checkin = String(req.query.checkin ?? "");
    const checkout = String(req.query.checkout ?? "");

    // ── 見積り（直販チャネル料金・v4 §8） ──
    if (checkin || checkout) {
      const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
      const guests = Number(req.query.guests ?? 0);
      const maxCap = Math.max(...props.map((k) => PROPERTY_CAPACITY[k]));
      if (!isDate(checkin) || !isDate(checkout) || checkout <= checkin ||
          !Number.isInteger(guests) || guests < 1 || guests > maxCap) {
        res.status(400).json({ ok: false, error: "invalid_quote_params" });
        return;
      }
      try {
        // 複数棟でも直列に待たない（各棟のBeds24呼び出しを並列化）
        const results = await Promise.all(
          props.map(async (k) => {
            // 定員超過の棟はBeds24を叩かずに満室扱い
            if (guests > PROPERTY_CAPACITY[k]) {
              return { data: { id: k, prop: k, available: false, reason: "over_capacity" }, cached: true };
            }
            return quoteFor(k, checkin, checkout, guests);
          }),
        );
        const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000);
        res.set("Cache-Control", "private, max-age=20");
        if (all) {
          res.status(200).json({
            ok: true,
            query: { checkin, checkout, guests, nights },
            generatedAt: new Date().toISOString(),
            cacheStatus: results.every((r) => r.cached) ? "hit" : "miss",
            properties: results.map((r) => r.data),
          });
        } else {
          res.status(200).json({ ok: true, cacheStatus: results[0].cached ? "hit" : "miss", ...results[0].data });
        }
      } catch (err) {
        logger.error("bookingApi quote failed", err);
        res.status(502).json({ ok: false, error: "upstream_failed" });
      }
      return;
    }

    // ── 空室カレンダー ──
    try {
      const results = await Promise.all(props.map((k) => calendarFor(k)));
      res.set("Cache-Control", "public, max-age=300");
      if (all) {
        res.status(200).json({
          ok: true,
          generatedAt: new Date().toISOString(),
          cacheStatus: results.every((r) => r.cached) ? "hit" : "miss",
          properties: props.map((k, i) => ({ id: k, dates: results[i].dates })),
        });
      } else {
        res.status(200).json({ ok: true, prop: props[0], dates: results[0].dates, cached: results[0].cached });
      }
    } catch (err) {
      logger.error("bookingApi availability failed", err);
      res.status(502).json({ ok: false, error: "upstream_failed" });
    }
  }
);


/* ─── ゲスト向けライフサイクルメール（前日リマインド／滞在後フォロー） ───
   毎朝10時JSTに走り、対象日の予約へ1通ずつ送る。送信済みフラグで二重送信を防ぐ。
   入室コードは別系統（運営会社が送る）のため、ここでは触れない。 */

const LIFECYCLE_L10N: Record<string, Record<string, string>> = {
  ja: {
    remSubject: "【yah.homes】明日のご宿泊について",
    remHeading: "明日、お待ちしております",
    remLead: "ご到着が明日となりました。当日の流れをご確認ください。",
    remCheckin: "チェックイン", remCheckout: "チェックアウト", remGuests: "人数", remArrival: "到着予定時刻",
    remPlace: "場所", remEntry: "入室について",
    remEntryBody: "玄関のキーボックスでの受け渡しです。暗証番号は別途お送りしています。届いていない場合はこのメールにご返信ください。",
    remArrivalNote: "到着時刻に制限はありません。深夜のご到着でも問題ありません。",
    remCta: "予約を確認する",
    revSubject: "【yah.homes】ご滞在はいかがでしたか",
    revHeading: "ご利用ありがとうございました",
    revLead: "先日はyah.homesにご宿泊いただきありがとうございました。お気づきの点があれば、このメールにご返信ください。良かった点も、直すべき点も、そのままお聞かせいただけると助かります。",
    revNote: "いただいたご意見は、次のお客様のために必ず反映します。実際に、大通りに面したロールスクリーンを遮光タイプに変更したのもお客様のご指摘がきっかけでした。",
    revCta: "また泊まる",
    stay: "ご滞在", nights: "{n}泊",
  },
  en: {
    remSubject: "[yah.homes] Your stay starts tomorrow",
    remHeading: "See you tomorrow",
    remLead: "Your arrival is tomorrow. Here is what to expect on the day.",
    remCheckin: "Check-in", remCheckout: "Check-out", remGuests: "Guests", remArrival: "Estimated arrival",
    remPlace: "Location", remEntry: "Getting in",
    remEntryBody: "Self check-in with a key box at the entrance. The code has been sent separately — just reply to this email if you have not received it.",
    remArrivalNote: "There is no arrival time limit. Late-night arrivals are fine.",
    remCta: "View your booking",
    revSubject: "[yah.homes] How was your stay?",
    revHeading: "Thank you for staying with us",
    revLead: "Thank you for choosing yah.homes. If anything stood out — good or bad — just reply to this email and tell us plainly.",
    revNote: "We act on what we hear. The blackout roller blind facing the main street was added because a guest told us the light was too bright.",
    revCta: "Book again",
    stay: "Your stay", nights: "{n} nights",
  },
  ko: {
    remSubject: "[yah.homes] 내일 체크인 안내",
    remHeading: "내일 뵙겠습니다",
    remLead: "도착이 내일입니다. 당일 흐름을 확인해 주세요.",
    remCheckin: "체크인", remCheckout: "체크아웃", remGuests: "인원", remArrival: "도착 예정 시각",
    remPlace: "위치", remEntry: "입실 안내",
    remEntryBody: "현관 키박스를 이용한 셀프 체크인입니다. 비밀번호는 별도로 보내드렸습니다. 받지 못하셨다면 이 메일에 회신해 주세요.",
    remArrivalNote: "도착 시간 제한은 없습니다. 늦은 밤 도착도 괜찮습니다.",
    remCta: "예약 확인하기",
    revSubject: "[yah.homes] 이용은 어떠셨나요",
    revHeading: "이용해 주셔서 감사합니다",
    revLead: "yah.homes를 이용해 주셔서 감사합니다. 좋았던 점도 아쉬웠던 점도, 이 메일에 회신해 편하게 알려주세요.",
    revNote: "주신 의견은 다음 손님을 위해 반드시 반영합니다. 큰길에 면한 롤스크린을 암막으로 바꾼 것도 손님의 지적이 계기였습니다.",
    revCta: "다시 예약하기",
    stay: "숙박", nights: "{n}박",
  },
  zh: {
    remSubject: "【yah.homes】明天入住提醒",
    remHeading: "明天見",
    remLead: "您的入住日就在明天，請確認當天的流程。",
    remCheckin: "入住", remCheckout: "退房", remGuests: "人數", remArrival: "預計抵達時間",
    remPlace: "位置", remEntry: "入住方式",
    remEntryBody: "以門口密碼鎖自助入住。密碼已另行寄送，若未收到請直接回覆這封郵件。",
    remArrivalNote: "抵達時間沒有限制，深夜抵達也沒問題。",
    remCta: "查看預訂",
    revSubject: "【yah.homes】這次入住還滿意嗎",
    revHeading: "感謝您的入住",
    revLead: "感謝您選擇 yah.homes。無論是好的地方還是需要改進的地方，都歡迎直接回覆這封郵件告訴我們。",
    revNote: "您的意見我們一定會落實。面向大馬路的遮光捲簾，就是因為住客反映光線太亮才更換的。",
    revCta: "再次預訂",
    stay: "住宿", nights: "{n}晚",
  },
  th: {
    remSubject: "[yah.homes] เข้าพักพรุ่งนี้",
    remHeading: "พบกันพรุ่งนี้",
    remLead: "วันเข้าพักของคุณคือพรุ่งนี้ กรุณาตรวจสอบรายละเอียดของวันนั้น",
    remCheckin: "เช็คอิน", remCheckout: "เช็คเอาท์", remGuests: "จำนวนผู้เข้าพัก", remArrival: "เวลาที่คาดว่าจะถึง",
    remPlace: "สถานที่", remEntry: "การเข้าที่พัก",
    remEntryBody: "เช็คอินด้วยตนเองผ่านกล่องกุญแจที่หน้าประตู รหัสได้ส่งแยกไปแล้ว หากยังไม่ได้รับกรุณาตอบกลับอีเมลนี้",
    remArrivalNote: "ไม่มีข้อจำกัดเรื่องเวลามาถึง มาดึกก็ไม่มีปัญหา",
    remCta: "ดูการจอง",
    revSubject: "[yah.homes] การเข้าพักเป็นอย่างไรบ้าง",
    revHeading: "ขอบคุณที่เข้าพักกับเรา",
    revLead: "ขอบคุณที่เลือก yah.homes หากมีสิ่งใดที่ประทับใจหรือควรปรับปรุง กรุณาตอบกลับอีเมลนี้และบอกเราตรง ๆ",
    revNote: "เรานำความเห็นไปปรับปรุงจริง ม่านม้วนกันแสงฝั่งถนนใหญ่ก็เปลี่ยนเพราะผู้เข้าพักบอกว่าแสงจ้าเกินไป",
    revCta: "จองอีกครั้ง",
    stay: "การเข้าพัก", nights: "{n} คืน",
  },
};

async function sendLifecycleMail(
  kind: "reminder" | "review",
  bookingId: string,
  b: BookingDoc & Record<string, unknown>,
): Promise<void> {
  const lang = String(b.lang ?? "en");
  const L = LIFECYCLE_L10N[lang] ?? LIFECYCLE_L10N.en;
  const P = MAIL_PROP[b.prop] ?? { name: b.prop, image: "", address: "", map: "" };
  const nights = Math.round((Date.parse(b.checkout) - Date.parse(b.checkin)) / 86400000);
  const no = bookingId.slice(0, 8).toUpperCase();
  const myPage = `${SITE_URL}/${lang === "en" ? "" : `${lang}/`}account/`;
  const bookPath = `${SITE_URL}/${lang === "en" ? "" : `${lang}/`}book/`;

  let ci = "16:00", co = "10:00";
  try {
    const f = (await db.collection("property_facts").doc(b.prop === "test" ? "kiyokawa" : b.prop).get()).data();
    ci = String(f?.checkinTime ?? ci); co = String(f?.checkoutTime ?? co);
  } catch { /* 既定値 */ }

  const html = kind === "reminder"
    ? mailHtml({
        heading: L.remHeading,
        badge: `${lang === "ja" ? "予約番号" : "Booking"}|${no}`,
        lead: L.remLead,
        rows: [
          [L.remCheckin, `${esc(b.checkin)}　${esc(ci)}〜`],
          [L.remCheckout, `${esc(b.checkout)}　〜${esc(co)}`],
          [L.remGuests, `${esc(b.guests)}`],
          ...(b.arrival ? [[L.remArrival, esc(String(b.arrival))] as [string, string]] : []),
        ],
        blocks: [
          { title: L.remEntry, body: `${esc(L.remEntryBody)}<br>${esc(L.remArrivalNote)}` },
          ...(P.address || P.map
            ? [{ title: L.remPlace, body: `${P.address ? `<strong>${esc(P.address)}</strong><br>` : ""}${P.map ? `<a href="${esc(P.map)}" style="color:#111111;">${esc(P.map)}</a>` : ""}` }]
            : []),
        ],
        cta: { label: L.remCta, href: myPage },
      })
    : mailHtml({
        heading: L.revHeading,
        badge: `${lang === "ja" ? "予約番号" : "Booking"}|${no}`,
        lead: L.revLead,
        rows: [
          [L.stay, `${esc(P.name)}`],
          [`${esc(b.checkin)} 〜 ${esc(b.checkout)}`, L.nights.replace("{n}", String(nights))],
        ],
        blocks: [{ title: "—", body: esc(L.revNote) }],
        cta: { label: L.revCta, href: bookPath },
      });

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  });
  await transporter.sendMail({
    from: `"yah.homes" <${SMTP_USER.value()}>`,
    to: String(b.email),
    replyTo: SMTP_USER.value(),
    subject: kind === "reminder" ? L.remSubject : L.revSubject,
    text: [
      kind === "reminder" ? L.remHeading : L.revHeading, "",
      kind === "reminder" ? L.remLead : L.revLead, "",
      `${P.name}`, `${b.checkin} 〜 ${b.checkout}`,
      kind === "reminder" ? `${L.remEntry}: ${L.remEntryBody}` : L.revNote, "",
      kind === "reminder" ? myPage : bookPath,
    ].join("\n"),
    html,
  });
}

/** 毎朝10時JST: 明日チェックインの予約へリマインド、昨日チェックアウトの予約へフォロー。 */
export const guestLifecycleMailer = onSchedule(
  { schedule: "0 10 * * *", timeZone: "Asia/Tokyo", region: REGION,
    secrets: [SMTP_USER, SMTP_PASS], timeoutSeconds: 300,
    serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async () => {
    const jst = (offsetDays: number) =>
      new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const tomorrow = jst(1);
    const yesterday = jst(-1);

    const run = async (kind: "reminder" | "review", field: "checkin" | "checkout", date: string, flag: string) => {
      const snap = await db.collection("bookings")
        .where("status", "==", "CONFIRMED").where(field, "==", date).get();
      let sent = 0;
      for (const d of snap.docs) {
        const v = d.data() as BookingDoc & Record<string, unknown>;
        if (v[flag]) continue; // 送信済み
        try {
          await sendLifecycleMail(kind, d.id, v);
          await d.ref.update({ [flag]: FieldValue.serverTimestamp() });
          sent++;
        } catch (err) {
          logger.error(`lifecycle ${kind} failed`, { bookingId: d.id, err: String(err).slice(0, 200) });
        }
      }
      logger.info(`lifecycle ${kind}: ${sent}/${snap.size} sent for ${date}`);
    };

    await run("reminder", "checkin", tomorrow, "reminderSentAt");
    await run("review", "checkout", yesterday, "reviewSentAt");
  }
);


// ─── 定型メール／メッセージのSSoT（/admin/templates） ───
// 運営会社がBeds24・OTAで送っている定型文を1箇所に集約する。
// 閲覧・編集は管理者台帳のメンバー。差し込み記号は {{...}} で統一する。
export const adminTemplates = onRequest(
  { region: REGION, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const email = await verifyAdmin(req as { headers: Record<string, unknown> });
    if (!email) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }

    try {
      if (req.method === "GET") {
        const snap = await db.collection("mail_templates").orderBy("order").get();
        res.status(200).json({
          ok: true,
          items: snap.docs.map((d) => {
            const v = d.data();
            return {
              id: d.id, title: v.title ?? d.id, prop: v.prop ?? "", kind: v.kind ?? "",
              lang: v.lang ?? "", subject: v.subject ?? "",
              body: v.body ?? "", note: v.note ?? "", order: v.order ?? 999,
              updatedAt: v.updatedAt?.toMillis?.() ?? null, updatedBy: v.updatedBy ?? null,
            };
          }),
        });
        return;
      }

      if (req.method === "POST") {
        const { id, body, note, subject } = (req.body ?? {}) as Record<string, unknown>;
        const idStr = typeof id === "string" ? id : "";
        if (!idStr || typeof body !== "string") { res.status(400).json({ ok: false, error: "invalid_input" }); return; }
        if (body.length > 20000) { res.status(400).json({ ok: false, error: "too_long" }); return; }
        await db.collection("mail_templates").doc(idStr).set({
          body,
          ...(typeof subject === "string" ? { subject: subject.slice(0, 300) } : {}),
          ...(typeof note === "string" ? { note: note.slice(0, 500) } : {}),
          updatedAt: FieldValue.serverTimestamp(), updatedBy: email,
        }, { merge: true });
        await db.collection("audit_logs").add({
          actor: email, action: "mail_template_update", target: idStr, at: FieldValue.serverTimestamp(),
        });
        res.status(200).json({ ok: true });
        return;
      }

      res.status(405).json({ ok: false, error: "method_not_allowed" });
    } catch (err) {
      logger.error("adminTemplates failed", err);
      res.status(500).json({ ok: false, error: "internal" });
    }
  }
);



// ─── 入室案内の暗証番号（/how-to/:prop から取得） ───
// 番号を静的HTMLへ焼き込むと、gitとビルド成果物に残り、番号を変えるたび再デプロイが要る。
// 実行時に property_secrets から読むことで、/admin/secrets の変更が即座にページへ反映される。
// 認証は掛けない（OTA経由のお客様もURLだけで開くため）。したがって守っているのは
// 「URLを知っていること」のみ＝Google Sitesと同水準。トークン化はv5 §9の未決事項。
export const checkinInfo = onRequest(
  { region: REGION, serviceAccount: "yah-homes@appspot.gserviceaccount.com", cors: true },
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex, nofollow");
    const prop = String(req.query.prop ?? "");
    if (!["kiyokawa", "takasago"].includes(prop)) { res.status(400).json({ ok: false }); return; }
    try {
      const v = (await db.collection("property_secrets").doc(prop).get()).data() ?? {};
      res.status(200).json({ ok: true, keyboxCode: v.keyboxCode ?? "" });
    } catch (err) {
      logger.error("checkinInfo failed", err);
      res.status(500).json({ ok: false });
    }
  }
);

// ─── セキュリティ鍵番号の管理（/admin/secrets） ───
// キーボックス番号は物理キーそのもの。property_facts は公開読み取りを許可しているため、
// ここには絶対に置かず、専用コレクション property_secrets に隔離する
// （Firestoreルールは既定deny。読み書きはこの関数＝Admin SDK 経由のみ）。
// 閲覧・変更はオーナーのみ（運営会社は不可）。変更は必ず audit_logs に残す。
export const adminSecrets = onRequest(
  { region: REGION, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const email = await verifyAdmin(req as { headers: Record<string, unknown> });
    if (!email) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
    // 鍵番号は物理キーそのもの。台帳メンバーではなく root オーナーのみに限定する。
    if (!PARTNERS_ADMIN_EMAILS.includes(email)) { res.status(403).json({ ok: false, error: "owner_only" }); return; }

    const PROPS = ["kiyokawa", "takasago"] as const;
    try {
      if (req.method === "GET") {
        const snaps = await db.getAll(...PROPS.map((k) => db.collection("property_secrets").doc(k)));
        res.status(200).json({
          ok: true,
          items: PROPS.map((k, i) => {
            const v = snaps[i].data() ?? {};
            return {
              prop: k,
              keyboxCode: v.keyboxCode ?? "",
              note: v.note ?? "",
              updatedAt: v.updatedAt?.toMillis?.() ?? null,
              updatedBy: v.updatedBy ?? null,
            };
          }),
        });
        return;
      }

      if (req.method === "POST") {
        const { prop, keyboxCode, note } = (req.body ?? {}) as Record<string, unknown>;
        const propStr = String(prop ?? "");
        if (!PROPS.includes(propStr as typeof PROPS[number])) { res.status(400).json({ ok: false, error: "invalid_prop" }); return; }
        const code = String(keyboxCode ?? "").trim();
        if (!/^\d{4,8}$/.test(code)) { res.status(400).json({ ok: false, error: "invalid_code" }); return; }

        const ref = db.collection("property_secrets").doc(propStr);
        const prev = (await ref.get()).data()?.keyboxCode ?? "";
        await ref.set({
          keyboxCode: code,
          ...(typeof note === "string" ? { note: note.slice(0, 300) } : {}),
          updatedAt: FieldValue.serverTimestamp(), updatedBy: email,
        }, { merge: true });

        // 監査ログには番号そのものを残さない（桁数と変更有無のみ）
        await db.collection("audit_logs").add({
          actor: email, action: "keybox_code_update", target: propStr,
          changed: prev !== code, digits: code.length, at: FieldValue.serverTimestamp(),
        });
        res.status(200).json({ ok: true, changed: prev !== code });
        return;
      }

      res.status(405).json({ ok: false, error: "method_not_allowed" });
    } catch (err) {
      logger.error("adminSecrets failed", err);
      res.status(500).json({ ok: false, error: "internal" });
    }
  }
);

// ─── パートナー申請 管理API（/admin/partners・design_partners_page.md §4.6） ───
// 認証: Firebase Auth（Google）IDトークン検証＋許可メール限定。個人情報を扱うためFunction経由のみ。
const PARTNERS_ADMIN_EMAILS = ["kazuyoshi.yamada@bonfire.co.jp"]; // rootオーナー（削除不可・台帳に依らず常に有効）

// 管理者台帳（/admin/users）: { name, role: "owner"|"operator", notifyPartners, notifyTeiten, notifyBookings }
async function getAdminUser(email: string): Promise<{ role: string } | null> {
  const doc = await db.collection("admin_users").doc(email).get();
  return doc.exists ? (doc.data() as { role: string }) : null;
}

/** 通知宛先: root ＋ 該当フラグONの台帳メンバー（ハードコード宛先を廃止・v4 §8-5b） */
async function notifyRecipients(kind: "notifyPartners" | "notifyTeiten" | "notifyBookings"): Promise<string> {
  const set = new Set<string>(PARTNERS_ADMIN_EMAILS);
  try {
    const snap = await db.collection("admin_users").where(kind, "==", true).get();
    snap.forEach((d) => set.add(d.id));
  } catch (err) {
    logger.warn("notifyRecipients fallback", err);
  }
  return [...set].join(", ");
}
const PARTNER_STATUSES = ["new", "contacted", "confirmed", "stayed", "published", "declined"];

async function verifyAdmin(req: { headers: Record<string, unknown> }): Promise<string | null> {
  const authz = String(req.headers["authorization"] ?? "");
  const m = /^Bearer (.+)$/.exec(authz);
  if (!m) return null;
  try {
    const decoded = await getAuth().verifyIdToken(m[1]);
    const email = (decoded.email ?? "").toLowerCase();
    if (!decoded.email_verified) return null;
    if (PARTNERS_ADMIN_EMAILS.includes(email)) return email;
    if (await getAdminUser(email)) return email; // 台帳メンバー（operator以上）
    return null;
  } catch {
    return null;
  }
}

export const partnersAdmin = onRequest({ region: REGION, secrets: [SMTP_USER, SMTP_PASS] }, async (req, res) => {
  const origin = corsOrigin(req.headers.origin as string | undefined);
  if (origin) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  const email = await verifyAdmin(req as { headers: Record<string, unknown> });
  if (!email) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }

  if (req.method === "GET") {
    const snap = await db.collection("partner_applications").orderBy("createdAt", "desc").limit(200).get();
    const items = snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        name: v.name ?? "",
        email: v.email ?? "",
        mediaUrl: v.mediaUrl ?? "",
        property: v.property ?? "",
        date1: v.date1 ?? "",
        date2: v.date2 ?? "",
        guests: v.guests ?? null,
        message: v.message ?? "",
        status: v.status ?? "new",
        confirmedCheckin: v.confirmedCheckin ?? null,
        confirmedCheckout: v.confirmedCheckout ?? null,
        createdAt: v.createdAt?.toMillis?.() ?? null,
      };
    });
    res.status(200).json({ ok: true, items });
    return;
  }

  if (req.method === "POST") {
    const { id, status, checkin, checkout } = (req.body ?? {}) as Record<string, unknown>;
    const idStr = typeof id === "string" ? id : "";
    const statusStr = typeof status === "string" && PARTNER_STATUSES.includes(status) ? status : "";
    if (!idStr || !statusStr) { res.status(400).json({ ok: false, error: "invalid_input" }); return; }

    const ref = db.collection("partner_applications").doc(idStr);
    const update: Record<string, unknown> = {
      status: statusStr,
      statusUpdatedAt: FieldValue.serverTimestamp(),
      statusUpdatedBy: email,
    };

    // 確定: 確定日を保存し、申請者へ確定メールを自動送信（v0.9）
    if (statusStr === "confirmed") {
      const ciStr = typeof checkin === "string" ? checkin.trim() : "";
      const coStr = typeof checkout === "string" ? checkout.trim() : "";
      const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (!isDate(ciStr) || !isDate(coStr) || coStr <= ciStr) {
        res.status(400).json({ ok: false, error: "invalid_confirmed_dates" });
        return;
      }
      update.confirmedCheckin = ciStr;
      update.confirmedCheckout = coStr;

      const snap = await ref.get();
      const v = snap.data();
      if (!v) { res.status(404).json({ ok: false, error: "not_found" }); return; }
      await ref.update(update);

      const fmtJa = (d: string) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)!;
        const dow = "日月火水木金土"[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
        return `${+m[2]}月${+m[3]}日（${dow}）`;
      };
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
      });
      try {
        await transporter.sendMail({
          from: `"yah.homes" <${SMTP_USER.value()}>`,
          to: String(v.email),
          replyTo: PARTNERS_NOTIFY_TO,
          subject: "【yah.homes】ご宿泊が確定しました",
          text: [
            `${v.name} 様`,
            ``,
            `パートナー宿泊のご予約が確定しましたのでお知らせします。`,
            ``,
            `--- ご予約内容 ---`,
            `棟: ${PROPERTY_LABEL[String(v.property)] ?? v.property}`,
            `チェックイン: ${fmtJa(ciStr)} 15:00〜`,
            `チェックアウト: ${fmtJa(coStr)} 〜10:00`,
            `人数: ${v.guests}名`,
            `---`,
            ``,
            `ご宿泊の1週間前を目安に、住所・入室方法などのご案内をお送りします。`,
            `日程の変更・キャンセルは7日前までにこのメールへご返信ください。`,
            ``,
            `当日お会いできるのを楽しみにしています。`,
            ``,
            `yah.homes`,
            `https://yah.homes/ja/`,
          ].join("\n"),
          html: mailHtml({
            heading: "ご宿泊が確定しました",
            lead: `${v.name} 様　パートナー宿泊のご予約が確定しましたのでお知らせします。`,
            rows: [
              ["棟", esc(PROPERTY_LABEL[String(v.property)] ?? String(v.property))],
              ["チェックイン", `${esc(fmtJa(ciStr))}　15:00〜`],
              ["チェックアウト", `${esc(fmtJa(coStr))}　〜10:00`],
              ["人数", `${esc(v.guests)}名`],
            ],
            blocks: [
              { title: "入室のご案内", body: "ご宿泊の1週間前を目安に、住所・入室方法などのご案内をお送りします。" },
              { title: "変更・キャンセル", body: "日程の変更・キャンセルは7日前までに、このメールへご返信ください。" },
            ],
            note: "当日お会いできるのを楽しみにしています。",
          }),
        });
      } catch (err) {
        logger.error("partners confirmation mail failed", err);
        res.status(200).json({ ok: true, mail: "failed" });
        return;
      }
      res.status(200).json({ ok: true, mail: "sent" });
      return;
    }

    await ref.update(update);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ ok: false, error: "method_not_allowed" });
});


// ─── Beds24 クラウド定点観測（spec_beds24_cloud_observer.md v0.2） ───
// 毎朝8:00 JST: 予約取得→前回スナップショット差分→定点シート記入→サマリメール→状態保存。
// ロジックは scripts/beds24-daily.mjs と同一（数字の連続性維持）。トークンはread専用。
const TEITEN_SHEET_ID = "1DxniZSvdzb5s4Zjt_6MYgWkkFq7q7HlCxyIUZn6hMfk";
const TEITEN_PROPS: Record<number, string> = { 278158: "清川", 291238: "高砂" };

type Beds24Booking = {
  id: number; propertyId: number; status: string; arrival: string; departure: string;
  firstName?: string; lastName?: string; referer?: string; apiSource?: string; country2?: string;
};

async function beds24FetchAll(url: string, token: string): Promise<Beds24Booking[]> {
  const out: Beds24Booking[] = [];
  let next: string | null = url;
  while (next) {
    const r: any = await fetch(next, { headers: { token } }).then((x) => x.json());
    if (!r.success) throw new Error(`beds24: ${JSON.stringify(r).slice(0, 300)}`);
    out.push(...r.data);
    next = r.pages?.nextPageLink || null;
  }
  return out;
}

// Functionsのデフォルトサービスアカウントで認可（鍵なし・メタデータサーバー方式・scope指定可）
async function gcpAccessToken(scopes?: string): Promise<string> {
  const url = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
    + (scopes ? `?scopes=${encodeURIComponent(scopes)}` : "");
  const r: any = await fetch(url, { headers: { "Metadata-Flavor": "Google" } }).then((x) => x.json());
  if (!r.access_token) throw new Error("metadata token unavailable");
  return r.access_token;
}

// GA4 Data API: 前日のclick_airbnbイベント数（プロパティ=www.yah.homes/539535968・SAは閲覧者共有済み）
const GA4_PROPERTY = "539535968";
// 前日の手渡しクリック（click_airbnb / click_booking_com / click_booking_calendar）
async function ga4HandoffClicksYesterday(): Promise<Record<string, number> | null> {
  try {
    const tok = await gcpAccessToken("https://www.googleapis.com/auth/analytics.readonly");
    const r: any = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "keyEvents" }],
        // 全キーイベント（CV）をイベント名別に取得。合計がCV数(日次)＝H列
        keepEmptyRows: false,
      }),
    }).then((x) => x.json());
    if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 200));
    const out: Record<string, number> = { click_airbnb: 0, click_booking_com: 0, click_booking_calendar: 0, total: 0 };
    for (const row of r.rows ?? []) {
      const v = Number(row.metricValues[0].value);
      out[row.dimensionValues[0].value] = v;
      out.total += v;
    }
    return out;
  } catch (err) {
    logger.warn("ga4 handoff clicks fetch failed", err);
    return null; // GA4障害でも定点本体は止めない
  }
}

export const beds24DailyObserver = onSchedule(
  // serviceAccount: 第2世代の既定はcompute SAだが、シート/GA4の共有先=appspot SAに合わせて明示指定（spec §3）
  { schedule: "0 8 * * *", timeZone: "Asia/Tokyo", region: REGION, secrets: [BEDS24_TOKEN, SMTP_USER, SMTP_PASS], timeoutSeconds: 300, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async () => {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });
    const teitenTo = await notifyRecipients("notifyTeiten");
    const mail = (subject: string, text: string) =>
      transporter.sendMail({
        from: `"yah.homes 定点" <${SMTP_USER.value()}>`, to: teitenTo, subject, text,
        html: mailHtml({
          heading: subject.replace(/^【定点】\s*/, "") || "定点観測",
          badge: `定点観測|${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })}`,
          blocks: [{ title: "サマリー", body: esc(text) }],
          cta: { label: "予約管理を開く", href: `${SITE_URL}/admin/bookings/` },
        }),
      });

    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    try {
      // ① 取得（過去90日到着〜18ヶ月先・キャンセル込み）
      const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 550 * 86400000).toISOString().slice(0, 10);
      const bookings = await beds24FetchAll(
        `https://beds24.com/api/v2/bookings?arrivalFrom=${from}&arrivalTo=${to}&pageSize=200&includeCancelled=true`,
        BEDS24_TOKEN.value()
      );

      const nightsOf = (b: Beds24Booking) => Math.round((Date.parse(b.departure) - Date.parse(b.arrival)) / 86400000);
      const active = (b: Beds24Booking) => b.status === "confirmed" || b.status === "new";
      const isGuest = (b: Beds24Booking) =>
        b.status !== "black" && !/オーナー|yamada|sugimoto|工事|テスト/i.test(`${b.firstName ?? ""} ${b.lastName ?? ""} ${b.referer ?? ""} ${b.apiSource ?? ""}`);

      // ② 差分（Firestoreスナップショットと照合）
      const stateRef = db.collection("beds24_state").doc("latest");
      const prevDoc = await stateRef.get();
      const prev = (prevDoc.data() as { bookings: Record<string, { status: string; arrival: string; n: number; prop: string }>; date: string | null } | undefined)
        ?? { bookings: {}, date: null };

      const events: { new: string[]; cancelled: string[]; changed: string[] } = { new: [], cancelled: [], changed: [] };
      for (const b of bookings) {
        if (!isGuest(b)) continue;
        const p = prev.bookings[String(b.id)];
        const label = `${TEITEN_PROPS[b.propertyId]} ${b.arrival}〜${nightsOf(b)}泊 ${b.firstName ?? ""} ${b.lastName ?? ""} [${b.referer || b.apiSource || "?"}] ${b.country2 || ""}`;
        if (!p && active(b)) events.new.push(label);
        else if (p && p.status !== "cancelled" && b.status === "cancelled") events.cancelled.push(label);
        else if (p && active(b) && (p.arrival !== b.arrival || p.n !== nightsOf(b)))
          events.changed.push(`${label}（旧: ${p.arrival}〜${p.n}泊）`);
      }

      // 先付け残高（今日以降の泊数・棟別）
      const fwd: Record<string, number> = { 清川: 0, 高砂: 0 };
      for (const b of bookings) {
        if (!active(b) || !isGuest(b)) continue;
        const a = b.arrival >= today ? b.arrival : today;
        const n = Math.max(0, Math.round((Date.parse(b.departure) - Date.parse(a)) / 86400000));
        fwd[TEITEN_PROPS[b.propertyId]] += n;
      }
      const fwdTotal = fwd.清川 + fwd.高砂;
      const pct = (n: number, d: number) => `${Math.round((n / d) * 1000) / 10}%`;
      const fwdRate = Math.round((fwdTotal / 730) * 1000) / 10; // 分母=365日×2棟（databook: 204泊≈28%と整合）

      const tally = (list: string[], prop: string) => {
        const rows = list.filter((l) => l.startsWith(prop));
        return { g: rows.length, n: rows.reduce((s2, l) => s2 + (Number(l.match(/〜(\d+)泊/)?.[1]) || 0), 0) };
      };
      const kNew = tally(events.new, "清川"), kCxl = tally(events.cancelled, "清川");
      const tNew = tally(events.new, "高砂"), tCxl = tally(events.cancelled, "高砂");

      // ③ シート記入（初回・同日再実行はスキップ＝冪等）
      const handoff = await ga4HandoffClicksYesterday();
      const clicks = handoff?.click_airbnb ?? null;
      let sheetNote = "（初回 or 同日再実行につきシート記入スキップ）";
      if (prev.date && prev.date !== today) {
        const tok = await gcpAccessToken();
        const col: any = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${TEITEN_SHEET_ID}/values/A:A?valueRenderOption=FORMATTED_VALUE`,
          { headers: { authorization: `Bearer ${tok}` } }
        ).then((r) => r.json());
        const dstr = `${+today.slice(5, 7)}/${+today.slice(8, 10)}`;
        const row = ((col.values || []) as string[][]).findIndex((r) => (r[0] || "").trim() === dstr) + 1;
        if (row > 0) {
          const data = [
            { range: `B${row}`, values: [[kNew.g - kCxl.g]] }, { range: `C${row}`, values: [[kNew.n - kCxl.n]] },
            { range: `E${row}`, values: [[tNew.g - tCxl.g]] }, { range: `F${row}`, values: [[tNew.n - tCxl.n]] },
            { range: `I${row}`, values: [[fwd.清川]] }, { range: `K${row}`, values: [[fwd.高砂]] },
          ];
          // H列 = CV数(日次)＝前日の全キーイベント合計 → 前日の行に記入（GA4取得失敗時は書かない）
          if (handoff != null) {
            const y = new Date(Date.now() - 24 * 3600 * 1000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
            const ystr = `${+y.slice(5, 7)}/${+y.slice(8, 10)}`;
            const yrow = ((col.values || []) as string[][]).findIndex((r) => (r[0] || "").trim() === ystr) + 1;
            if (yrow > 0) data.push({ range: `H${yrow}`, values: [[handoff.total]] });
          }
          const w = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${TEITEN_SHEET_ID}/values:batchUpdate`, {
            method: "POST",
            headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
            body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
          });
          if (!w.ok) throw new Error(`sheets write ${w.status}: ${(await w.text()).slice(0, 200)}`);
          sheetNote = `シート記入OK: ${dstr}行`;
        } else sheetNote = `シートに ${dstr} 行が見つからず記入スキップ`;
      }


      // ④ サマリメール（特記: 適正帯28〜33%逸脱・3泊以上・キャンセル塊）
      const notes: string[] = [];
      if (fwdRate < 28) notes.push(`先付け率 ${fwdRate}% が適正帯(28〜33%)を下回り`);
      if (fwdRate > 33) notes.push(`先付け率 ${fwdRate}% が適正帯(28〜33%)を上回り`);
      for (const l of events.new) { const n = Number(l.match(/〜(\d+)泊/)?.[1]); if (n >= 3) notes.push(`大型: ${l}`); }
      if (events.cancelled.length >= 3) notes.push(`キャンセル${events.cancelled.length}件（塊）`);

      await mail(
        `【定点】${+today.slice(5, 7)}/${+today.slice(8, 10)} 清川+${kNew.g}組${kNew.n}泊・高砂+${tNew.g}組${tNew.n}泊・先付け${fwdTotal}泊(${fwdRate}%)`,
        [
          `=== Beds24 日次観測 ${today}（前回: ${prev.date ?? "初回"}）===`, ``,
          `【サマリ（定点シート形式）】`,
          `清川　　　　: ${kNew.g - kCxl.g >= 0 ? "+" : ""}${kNew.g - kCxl.g}組 ${kNew.n - kCxl.n >= 0 ? "+" : ""}${kNew.n - kCxl.n}泊`,
          `高砂　　　　: ${tNew.g - tCxl.g >= 0 ? "+" : ""}${tNew.g - tCxl.g}組 ${tNew.n - tCxl.n >= 0 ? "+" : ""}${tNew.n - tCxl.n}泊`,
          `CV数(日次): ${handoff?.total ?? "取得失敗（GA4）"}（前日の全キーイベント合計）`,
          `  内訳 click_airbnb: ${clicks ?? "—"} / click_booking_com: ${handoff?.click_booking_com ?? "—"} / click_booking_calendar: ${handoff?.click_booking_calendar ?? "—"}`,
          `先付け 清川 : ${fwd.清川}泊 (${pct(fwd.清川, 365)})`,
          `先付け 高砂 : ${fwd.高砂}泊 (${pct(fwd.高砂, 365)})`,
          `先付け 合計 : ${fwdTotal}泊 (${fwdRate}%)`, ``,
          `新規予約 ${events.new.length}件:`, ...events.new.map((l) => `  + ${l}`), ``,
          `キャンセル ${events.cancelled.length}件:`, ...events.cancelled.map((l) => `  - ${l}`), ``,
          ...(events.changed.length ? [`変更 ${events.changed.length}件:`, ...events.changed.map((l) => `  * ${l}`), ``] : []),
          `先付け残高: 清川${fwd.清川}泊 / 高砂${fwd.高砂}泊 / 計${fwdTotal}泊（${fwdRate}%）`,
          sheetNote, ``,
          ...(notes.length ? [`MEMO: ${notes.join("・")}`] : []),
        ].join("\n")
      );

      // ⑤ 状態保存（latest＋日次履歴）
      const snap: Record<string, { status: string; arrival: string; n: number; prop: string }> = {};
      for (const b of bookings) snap[String(b.id)] = { status: b.status, arrival: b.arrival, n: nightsOf(b), prop: TEITEN_PROPS[b.propertyId] };
      await stateRef.set({ bookings: snap, date: today, updatedAt: FieldValue.serverTimestamp() });
      await db.collection("beds24_state").doc("daily").collection("snapshots").doc(today)
        .set({ bookings: snap, date: today, createdAt: FieldValue.serverTimestamp() });
      logger.info(`beds24DailyObserver done: new=${events.new.length} cxl=${events.cancelled.length} fwd=${fwdTotal}`);
    } catch (err) {
      logger.error("beds24DailyObserver failed", err);
      await mail(`【定点エラー】${today}`, `日次観測が失敗しました。\n\n${String(err).slice(0, 2000)}`).catch(() => undefined);
      throw err;
    }
  }
);

// 週次スコアカード（spec v0.3）— 日次は上記の beds24DailyObserver（v0.2実装）を正とする
export { beds24WeeklyReport } from "./beds24.js";


// ─── MS1: Beds24 Webhook → Firestore ミラー（v4 §8・全チャネルの予約を自社DBへ） ───
// 受信は即ACK。ペイロードは信用せず webhook_events に保存し、正データはAPIで取り直す。
export const beds24Webhook = onRequest(
  { region: REGION, secrets: [BEDS24_TOKEN, BEDS24_WEBHOOK_KEY], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async (req, res) => {
    if (req.method !== "POST" && req.method !== "GET") {
      res.status(405).send("method_not_allowed");
      return;
    }
    // 共有シークレット（URLクエリ）で照合。不一致は403（内容をログに出さない）
    const key = String(req.query.key ?? "");
    if (!key || key !== BEDS24_WEBHOOK_KEY.value()) {
      res.status(403).send("forbidden");
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const bookingId = String(body.bookingId ?? body.id ?? req.query.bookingId ?? "").trim();
    if (!bookingId) {
      res.status(400).send("missing_booking_id");
      return;
    }

    // 冪等: 同一イベントは一度だけ処理（v4 §8-2）
    const eventId = `beds24_${bookingId}_${String(body.timeStamp ?? body.modifiedTime ?? Date.now())}`;
    const evRef = db.collection("webhook_events").doc(eventId);
    res.status(200).send("ok"); // 先にACK（Beds24の再送嵐を避ける）

    try {
      const fresh = await db.runTransaction(async (tx) => {
        const snap = await tx.get(evRef);
        if (snap.exists) return false;
        tx.set(evRef, {
          provider: "beds24",
          bookingId,
          receivedAt: FieldValue.serverTimestamp(),
          processedAt: null,
          result: null,
        });
        return true;
      });
      if (!fresh) return; // 重複配信

      // 正データをAPIで取り直す（ペイロードを直接信用しない）
      const r = await fetch(`${BEDS24_API}/bookings?id=${bookingId}&includeInvoiceItems=false`, {
        headers: { token: BEDS24_TOKEN.value() },
      });
      const j = (await r.json()) as { success?: boolean; data?: Array<Record<string, unknown>> };
      const b = j.data?.[0];
      if (!j.success || !b) throw new Error(`beds24 booking fetch failed: ${bookingId}`);

      const propKey = TEITEN_PROPS[Number(b.propertyId)] === "清川" ? "kiyokawa"
        : TEITEN_PROPS[Number(b.propertyId)] === "高砂" ? "takasago" : "unknown";
      const arrival = String(b.arrival ?? "");
      const departure = String(b.departure ?? "");
      const nights = arrival && departure
        ? Math.round((Date.parse(departure) - Date.parse(arrival)) / 86400000) : 0;
      const channelRaw = String(b.referer ?? b.apiSource ?? "").toLowerCase();
      const channel = channelRaw.includes("airbnb") ? "airbnb"
        : channelRaw.includes("booking") ? "booking"
        : channelRaw.includes("yah") || channelRaw.includes("direct") ? "direct"
        : channelRaw || "unknown";

      await db.collection("bookings_mirror").doc(bookingId).set({
        beds24Id: bookingId,
        propKey,
        propertyId: b.propertyId ?? null,
        channel,
        status: b.status ?? null,
        arrival,
        departure,
        nights,
        numAdult: b.numAdult ?? null,
        numChild: b.numChild ?? null,
        price: b.price ?? null,
        country: b.country2 ?? null,
        guestName: `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || null,
        updatedAt: FieldValue.serverTimestamp(),
        raw: b, // スキーマ変化に備えた原文保全
      }, { merge: true });

      await evRef.set({ processedAt: FieldValue.serverTimestamp(), result: "ok" }, { merge: true });
      logger.info(`beds24Webhook mirrored ${bookingId} (${propKey}/${channel})`);
    } catch (err) {
      logger.error("beds24Webhook failed", err);
      await evRef.set({ processedAt: FieldValue.serverTimestamp(), result: `error: ${String(err).slice(0, 300)}` }, { merge: true })
        .catch(() => undefined);
    }
  }
);


// ─── MS3: 直販予約の作成と決済（v4 §8-1 状態機械） ───
// bookCreate は PaymentIntent 作成まで。Beds24書込〜captureは stripeWebhook 起点で bookingWorker が実行する。
const stripeClient = () => new Stripe(STRIPE_SECRET_KEY.value(), { apiVersion: "2026-07-29.dahlia" });

type BookingDoc = {
  uid: string; prop: string; checkin: string; checkout: string; guests: number;
  total: number; status: string; stateVersion: number; operationId: string;
  paymentIntentId?: string; beds24Id?: string;
};

/** 状態遷移（CAS）: 想定バージョン一致時のみ更新。古いタスクが最新状態を壊さない（v4 §8-1） */
async function transition(
  ref: FirebaseFirestore.DocumentReference,
  expect: { status: string[]; stateVersion: number },
  next: Record<string, unknown>,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() as BookingDoc | undefined;
    if (!cur) return false;
    if (!expect.status.includes(cur.status) || cur.stateVersion !== expect.stateVersion) return false;
    tx.update(ref, { ...next, stateVersion: cur.stateVersion + 1, updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

/** 予約開始: 検証 → pending作成 → PaymentIntent（manual capture）→ client_secret を返す */
export const bookCreate = onRequest(
  { region: REGION, secrets: [BEDS24_TOKEN, STRIPE_SECRET_KEY], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }

    // 認証必須（v4 §5）
    const authz = String(req.headers["authorization"] ?? "");
    const m = /^Bearer (.+)$/.exec(authz);
    if (!m) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
    let uid = "", email = "";
    try {
      const decoded = await getAuth().verifyIdToken(m[1]);
      uid = decoded.uid;
      email = (decoded.email ?? "").toLowerCase();
    } catch { res.status(401).json({ ok: false, error: "unauthorized" }); return; }

    const b = (req.body ?? {}) as Record<string, unknown>;
    const prop = String(b.prop ?? "");
    const checkin = String(b.checkin ?? "");
    const checkout = String(b.checkout ?? "");
    const guests = Number(b.guests);
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 200) : "";
    const phone = typeof b.phone === "string" ? b.phone.trim().slice(0, 40) : "";
    const leadGuest = typeof b.leadGuest === "string" ? b.leadGuest.trim().slice(0, 200) : "";
    const arrival = typeof b.arrival === "string" ? b.arrival.slice(0, 10) : "";
    const langStr = typeof b.lang === "string" && ["en", "ja", "ko", "zh", "th"].includes(b.lang) ? b.lang : "en";
    const rulesAccepted = b.rulesAccepted === true;
    const marketingOptIn = b.marketingOptIn === true;
    const idempotencyKey = typeof b.idempotencyKey === "string" ? b.idempotencyKey.slice(0, 100) : "";
    // GA4のclient_id・広告のgclid/UTM（購買行動の突合用・個人情報ではない）
    const clientId = typeof b.clientId === "string" ? b.clientId.slice(0, 64) : "";
    const gclid = typeof b.gclid === "string" ? b.gclid.slice(0, 200) : "";
    const utm = typeof b.utm === "object" && b.utm ? b.utm : null;
    const authProvider = typeof b.authProvider === "string" ? b.authProvider.slice(0, 20) : "";

    const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!(prop in PROPERTY_CAPACITY) || !isDate(checkin) || !isDate(checkout) || checkout <= checkin ||
        !Number.isInteger(guests) || guests < 1 || !name || !phone || !rulesAccepted || !idempotencyKey) {
      res.status(400).json({ ok: false, error: "invalid_input" });
      return;
    }

    try {
      // 冪等: 同じキーの予約が既にあれば、その client_secret を返す（二重送信対策）
      const dup = await db.collection("bookings").where("idempotencyKey", "==", idempotencyKey).limit(1).get();
      if (!dup.empty) {
        const d = dup.docs[0].data() as BookingDoc & { clientSecret?: string };
        res.status(200).json({ ok: true, bookingId: dup.docs[0].id, clientSecret: d.clientSecret ?? null, duplicate: true });
        return;
      }

      // 金額はサーバー側で再見積り（改ざん防止・v4 §8-1）
      const q = await fetch(
        `${BEDS24_API}/inventory/rooms/offers?propertyId=${BOOKING_PROP_IDS[prop]}&arrival=${checkin}&departure=${checkout}&numAdults=${guests}`,
        { headers: { token: BEDS24_TOKEN.value() } },
      ).then((r) => r.json() as Promise<{ data?: Array<{ roomId?: number; offers?: Array<{ price?: number; unitsAvailable?: number }> }> }>);
      const offer = q.data?.[0]?.offers?.[0];
      if (!offer || typeof offer.price !== "number" || (offer.unitsAvailable ?? 0) < 1) {
        res.status(409).json({ ok: false, error: "unavailable" });
        return;
      }
      const total = offer.price;

      // 無料キャンセル期限 = チェックイン日の8日前 23:59 JST（v5 §5-1）
      // 特商法・FAQ・決済画面の「8日前まで無料」という表記と一致させる。
      const freeCancelUntilAt = new Date(Date.parse(`${checkin}T23:59:59+09:00`) - 8 * 86400000).toISOString();
      const operationId = `op_${idempotencyKey}`;

      const ref = db.collection("bookings").doc();
      await ref.set({
        uid, email, prop, checkin, checkout, guests, total, currency: "JPY",
        name, phone, leadGuest: leadGuest || null, arrival: arrival || null, lang: langStr,
        status: "PAYMENT_PENDING", stateVersion: 0, operationId, idempotencyKey,
        roomId: q.data?.[0]?.roomId ?? null,
        policyVersion: "2026-08-08", freeCancelUntilAt,
        clientId: clientId || null, gclid: gclid || null, utm, authProvider: authProvider || null,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });

      // 同意証跡（v4 §4.5-1/2）
      await db.collection("consents").add({
        uid, email, bookingId: ref.id,
        houseRules: { accepted: true, version: "2026-08-08" },
        marketing: { optIn: marketingOptIn, version: "2026-08-08" },
        lang: langStr, createdAt: FieldValue.serverTimestamp(),
      });

      // manual capture: Beds24書込に成功してから確定する（v4 §8-1）
      const stripe = stripeClient();
      const pi = await stripe.paymentIntents.create({
        amount: total, currency: "jpy", capture_method: "manual",
        metadata: { bookingId: ref.id, operationId, prop, checkin, checkout, guests: String(guests) },
        description: `yah.homes ${prop} ${checkin}〜${checkout}`,
        receipt_email: email || undefined,
      }, { idempotencyKey: operationId });

      await ref.update({ paymentIntentId: pi.id, clientSecret: pi.client_secret, stateVersion: 1 });
      await db.collection("operations").add({
        operationId, bookingId: ref.id, provider: "stripe", action: "create_payment_intent",
        providerId: pi.id, createdAt: FieldValue.serverTimestamp(),
      });

      res.status(200).json({ ok: true, bookingId: ref.id, clientSecret: pi.client_secret, total });
    } catch (err) {
      logger.error("bookCreate failed", err);
      res.status(500).json({ ok: false, error: "internal" });
    }
  }
);

/** Stripe Webhook: オーソリ確認を受けて履行（Beds24書込→capture）。署名検証・冪等処理（v4 §8-2） */
export const stripeWebhook = onRequest(
  { region: REGION, secrets: [BEDS24_WRITE_REFRESH, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, BEDS24_TOKEN, SMTP_USER, SMTP_PASS, GA4_API_SECRET], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) { res.status(400).send("missing_signature"); return; }

    const stripe = stripeClient();
    let event: Stripe.Event;
    try {
      // 署名検証には raw body が必要（firebase-functions は rawBody を提供）
      event = stripe.webhooks.constructEvent(
        (req as unknown as { rawBody: Buffer }).rawBody,
        String(sig),
        STRIPE_WEBHOOK_SECRET.value(),
      );
    } catch (err) {
      logger.error("stripeWebhook signature verification failed", err);
      res.status(400).send("invalid_signature");
      return;
    }

    res.status(200).send("ok"); // 先にACK（再送嵐を避ける）

    const evRef = db.collection("webhook_events").doc(`stripe_${event.id}`);
    try {
      const fresh = await db.runTransaction(async (tx) => {
        const snap = await tx.get(evRef);
        if (snap.exists) return false;
        tx.set(evRef, { provider: "stripe", type: event.type, receivedAt: FieldValue.serverTimestamp(), processedAt: null, result: null });
        return true;
      });
      if (!fresh) return;

      if (event.type === "payment_intent.amount_capturable_updated") {
        await fulfillBooking(event.data.object as Stripe.PaymentIntent, stripe);
      } else if (event.type === "payment_intent.payment_failed") {
        const pi = event.data.object as Stripe.PaymentIntent;
        const bookingId = pi.metadata?.bookingId;
        if (bookingId) {
          const ref = db.collection("bookings").doc(bookingId);
          const cur = (await ref.get()).data() as BookingDoc | undefined;
          if (cur) await transition(ref, { status: ["PAYMENT_PENDING"], stateVersion: cur.stateVersion }, { status: "PAYMENT_FAILED" });
        }
      }
      await evRef.set({ processedAt: FieldValue.serverTimestamp(), result: "ok" }, { merge: true });
    } catch (err) {
      logger.error("stripeWebhook processing failed", err);
      await evRef.set({ processedAt: FieldValue.serverTimestamp(), result: `error: ${String(err).slice(0, 300)}` }, { merge: true }).catch(() => undefined);
    }
  }
);

/** 履行: 再見積り・再在庫確認 → Beds24書込 → capture → CONFIRMED（失敗系は全てオーソリ解放） */
async function fulfillBooking(pi: Stripe.PaymentIntent, stripe: Stripe): Promise<void> {
  const bookingId = pi.metadata?.bookingId;
  if (!bookingId) return;
  const ref = db.collection("bookings").doc(bookingId);
  const cur = (await ref.get()).data() as BookingDoc | undefined;
  if (!cur) return;
  if (cur.status === "CONFIRMED") return; // 既に確定（重複配信）

  // 所有権照合（v5 §8-1①）: この PaymentIntent が本当にこの予約のものか、
  // 金額・通貨・PI ID の3点まで突き合わせてから履行する。
  // 署名検証を通過しても、metadata だけを信じて金額の異なる履行を行わない。
  const piAmount = typeof pi.amount === "number" ? pi.amount : -1;
  const piCurrency = String(pi.currency ?? "").toLowerCase();
  const mismatch =
    piAmount !== Number(cur.total) ? `amount ${piAmount} != ${cur.total}`
    : piCurrency !== "jpy" ? `currency ${piCurrency}`
    : cur.paymentIntentId && cur.paymentIntentId !== pi.id ? `pi ${pi.id} != ${cur.paymentIntentId}`
    : "";
  if (mismatch) {
    logger.error("fulfillBooking ownership mismatch", { bookingId, pi: pi.id, mismatch });
    await notifyError(
      `[要対応] 決済と予約の内容が一致しません。履行を中止しました。\n` +
      `予約ID: ${bookingId}／PaymentIntent: ${pi.id}／不一致: ${mismatch}`,
    );
    const c = (await ref.get()).data() as BookingDoc;
    await transition(ref, { status: [c.status], stateVersion: c.stateVersion },
      { status: "MANUAL_REVIEW", failureReason: `ownership_mismatch: ${mismatch}` });
    return;
  }

  const ok = await transition(ref, { status: ["PAYMENT_PENDING"], stateVersion: cur.stateVersion }, { status: "AUTHORIZED" });
  if (!ok) return; // 別タスクが処理済み or 状態不一致（stateVersion CAS）

  const fail = async (reason: string, status: string) => {
    await stripe.paymentIntents.cancel(pi.id).catch(() => undefined); // オーソリ解放
    await releaseInventoryLocks(cur.prop, cur.checkin, cur.checkout, bookingId);
    const c = (await ref.get()).data() as BookingDoc;
    await transition(ref, { status: [c.status], stateVersion: c.stateVersion }, { status, failureReason: reason });
    await notifyError(`予約の履行に失敗しました（${reason}）\n予約ID: ${bookingId}\nPaymentIntent: ${pi.id}`);
  };

  try {
    // 確定直前の再在庫確認（v4 §8-1）。参照するのは常に実棟（書込先が検証物件でも本番の在庫で判定する）
    const q = await fetch(
      `${BEDS24_API}/inventory/rooms/offers?propertyId=${BOOKING_PROP_IDS[cur.prop]}&arrival=${cur.checkin}&departure=${cur.checkout}&numAdults=${cur.guests}`,
      { headers: { token: BEDS24_TOKEN.value() } },
    ).then((r) => r.json() as Promise<{ data?: Array<{ offers?: Array<{ price?: number; unitsAvailable?: number }> }> }>);
    const offer = q.data?.[0]?.offers?.[0];
    if (!offer || (offer.unitsAvailable ?? 0) < 1) { await fail("在庫が埋まりました", "VOIDED"); return; }
    if (offer.price !== cur.total) { await fail(`料金が変動しました（${cur.total}→${offer.price}）`, "VOIDED"); return; }

    const c2 = (await ref.get()).data() as BookingDoc & Record<string, unknown>;

    await transition(ref, { status: ["AUTHORIZED"], stateVersion: c2.stateVersion }, { status: "RESERVATION_PENDING" });

    // ① 宿泊日を排他ロック。取れなければ他の予約が先に確定しているので成立させない。
    if (!(await acquireInventoryLocks(cur.prop, cur.checkin, cur.checkout, bookingId))) {
      await fail("同じ日程で先に確定した予約があります", "VOIDED");
      return;
    }

    // ② Beds24 へ予約を作成（失敗したらロックを解放し、オーソリも解放する）
    let beds24Id: number;
    try {
      beds24Id = await createBeds24Booking(bookingId, c2);
    } catch (e) {
      await releaseInventoryLocks(cur.prop, cur.checkin, cur.checkout, bookingId);
      await fail(`Beds24書込に失敗しました: ${String(e).slice(0, 160)}`, "VOIDED");
      return;
    }

    // ③ 書込成功を確認してからキャプチャ（この順序は動かさない・v4 §4）
    try {
      await stripe.paymentIntents.capture(pi.id);
    } catch (e) {
      // 決済は取れていないが Beds24 に予約が残る。人が消す必要があるため要対応で止める。
      await notifyError(
        `[要対応] Beds24に予約を作成後、キャプチャに失敗しました。Beds24側の予約を取り消してください。\n` +
        `予約ID: ${bookingId}／Beds24予約ID: ${beds24Id}／PaymentIntent: ${pi.id}／${String(e).slice(0, 160)}`,
      );
      const c3 = (await ref.get()).data() as BookingDoc;
      await transition(ref, { status: [c3.status], stateVersion: c3.stateVersion },
        { status: "MANUAL_REVIEW", failureReason: "capture_failed_after_beds24_write", beds24Id });
      return;
    }

    const c4 = (await ref.get()).data() as BookingDoc;
    await transition(ref, { status: ["RESERVATION_PENDING"], stateVersion: c4.stateVersion },
      { status: "CONFIRMED", beds24Id, confirmedAt: FieldValue.serverTimestamp() });
    await sendConfirmationMail(bookingId, c2);
    await sendPurchaseEvent({
      id: bookingId, uid: cur.uid, prop: cur.prop, total: cur.total, guests: cur.guests,
      nights: Math.round((Date.parse(cur.checkout) - Date.parse(cur.checkin)) / 86400000),
      lang: String(c2.lang ?? ""), authProvider: String(c2.authProvider ?? ""), clientId: String(c2.clientId ?? ""),
    });
  } catch (err) {
    logger.error("fulfillBooking failed", err);
    await fail(String(err).slice(0, 200), "MANUAL_REVIEW");
  }
}

/**
 * GA4 purchase をサーバー確定後に送信（v4 §10）。
 * クライアントから送らない理由: 離脱・広告ブロック・重複でCVが歪むため。
 * 個人情報（氏名・メール・電話）は送らない。
 */
const GA4_MEASUREMENT_ID = "G-VJ5DDRML79";
async function sendPurchaseEvent(booking: {
  id: string; uid: string; prop: string; total: number; nights?: number; guests: number;
  lang?: string; authProvider?: string; clientId?: string;
}): Promise<void> {
  const secret = GA4_API_SECRET.value();
  if (!secret || secret.startsWith("placeholder")) return; // 未設定時は送らない（障害にしない）
  try {
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${secret}`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: booking.clientId || `srv.${booking.uid.slice(0, 16)}`,
          events: [{
            name: "purchase",
            params: {
              transaction_id: booking.id,
              currency: "JPY",
              value: booking.total,
              lang: booking.lang ?? null,
              auth_provider: booking.authProvider ?? null,
              guests: booking.guests,
              nights: booking.nights ?? null,
              items: [{ item_id: booking.prop, item_name: `yah.homes ${booking.prop}`, price: booking.total, quantity: 1 }],
            },
          }],
        }),
      },
    );
  } catch (err) {
    logger.warn("GA4 purchase send failed", err);
  }
}

/** 障害通知（沈黙禁止・v4 §8-6） */
/* ─── 予約確定メール（お客様宛・予約言語・HTML＋テキスト） ───
   Booking.com の確定メールを参考に、カード単位で情報を切って読める構成にする。
   メールクライアント制約: table レイアウト＋インラインCSS。外部CSS/JS/画像は使わない。 */

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const SITE_URL = "https://yah.homes";

/* ─── メールの共通テンプレート ───
   全ての送信メールを同じ枠に載せる。table＋インラインCSSのみ（外部CSS/JS/画像なし）。
   variant: "brand"=通常（黒ヘッダー） / "alert"=要対応（赤い帯を足す） */
function mailHtml(o: {
  heading: string;
  badge?: string;
  lead?: string;
  rows?: Array<[string, string]>;
  blocks?: Array<{ title: string; body: string }>;
  cta?: { label: string; href: string };
  note?: string;
  variant?: "brand" | "alert";
}): string {
  const alert = o.variant === "alert";
  const row = ([k, v]: [string, string]) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888888;vertical-align:top;white-space:nowrap;">${esc(k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#111111;text-align:right;font-weight:500;word-break:break-word;">${v}</td></tr>`;
  const block = (b: { title: string; body: string }) =>
    `<div style="border-top:1px solid #f0f0f0;padding-top:14px;margin-top:14px;">
       <div style="font-size:13px;font-weight:600;color:#111111;margin-bottom:5px;">${esc(b.title)}</div>
       <div style="font-size:13px;color:#666666;line-height:1.8;white-space:pre-wrap;">${b.body}</div>
     </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',Helvetica,Arial,sans-serif;">
  <tr><td style="background:#111111;padding:18px 24px;">
    <table role="presentation" width="100%"><tr>
      <td style="font-size:16px;font-weight:600;color:#ffffff;letter-spacing:.02em;">yah.homes</td>
      ${o.badge ? `<td style="text-align:right;font-size:11px;color:#bbbbbb;line-height:1.6;">${esc(o.badge.split("|")[0] ?? "")}<br><span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:.06em;">${esc(o.badge.split("|")[1] ?? o.badge)}</span></td>` : ""}
    </tr></table>
  </td></tr>
  ${alert ? `<tr><td style="background:#c0392b;height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>` : ""}
  <tr><td style="padding:26px 24px 24px;">
    <div style="font-size:19px;font-weight:600;color:#111111;line-height:1.5;margin-bottom:${o.lead ? "8px" : "16px"};">${esc(o.heading)}</div>
    ${o.lead ? `<div style="font-size:13px;color:#666666;line-height:1.9;margin-bottom:18px;">${esc(o.lead)}</div>` : ""}
    ${o.rows?.length ? `<table role="presentation" width="100%" style="border:1px solid #e8e8e8;border-radius:6px;"><tr><td style="padding:14px 18px;">
      <table role="presentation" width="100%">${o.rows.map(row).join("")}</table></td></tr></table>` : ""}
    ${(o.blocks ?? []).map(block).join("")}
    ${o.cta ? `<table role="presentation" width="100%" style="margin-top:20px;"><tr><td align="center" style="border-radius:6px;background:#111111;">
      <a href="${esc(o.cta.href)}" style="display:block;padding:14px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(o.cta.label)}</a>
    </td></tr></table>` : ""}
    ${o.note ? `<div style="font-size:12px;color:#999999;line-height:1.8;margin-top:16px;">${esc(o.note)}</div>` : ""}
  </td></tr>
  <tr><td style="padding:16px 24px 22px;border-top:1px solid #f0f0f0;font-size:12px;color:#aaaaaa;">yah.homes ／ ボンファイア株式会社</td></tr>
</table></td></tr></table></body></html>`;
}

// 住所は発注者確認済みのもののみ記載する（未確認の棟は地図リンクのみ）。
const MAIL_PROP = {
  kiyokawa: {
    name: "yah.homes kiyokawa",
    image: `${SITE_URL}/manus-storage/kiyokawa-exterior_18a3409b.webp`,
    address: "〒810-0005 福岡県福岡市中央区清川3-3-1",
    map: "https://www.google.com/maps/search/?api=1&query=33.57879181728365,130.4126724730762",
    register: "https://zfrmz.jp/TcYXUliEZ84JkJSVzSLi", // 宿泊者名簿フォーム（旅館業法）
  },
  takasago: {
    name: "yah.homes takasago",
    image: `${SITE_URL}/manus-storage/takasago-exterior_d4f7ccff.webp`,
    address: "",
    map: "https://www.google.com/maps/search/?api=1&query=33.579953440232984,130.40629424218778",
    register: "https://zfrmz.jp/sZQlLvoM43I0Od6UZPzF", // 宿泊者名簿フォーム（旅館業法）
  },
  test: {
    name: "yah.homes test1（検証用）",
    image: `${SITE_URL}/manus-storage/kiyokawa-exterior_18a3409b.webp`,
    address: "〒810-0005 福岡県福岡市中央区清川3-3-1",
    map: "https://www.google.com/maps/search/?api=1&query=33.57879181728365,130.4126724730762",
  },
} as Record<string, { name: string; image: string; address: string; map: string }>;

const MAIL_L10N: Record<string, Record<string, string>> = {
  ja: {
    registerTitle: "ご宿泊の前にお願いしたいこと",
    registerLead: "宿泊者名簿のご登録（ご宿泊者 全員分）",
    registerDue: "{d} までにお願いします",
    registerBtn: "宿泊者名簿を登録する",
    registerBody: "旅館業法により、ご宿泊されるすべての方の情報をいただくことが義務づけられています。日本国内に住所のない外国籍のお客様は、あわせてご宿泊者全員分のパスポート画像が必要です。",
    registerWarn: "ご登録の確認後、入室方法をお送りします。ご登録がない場合、暗証番号をお送りできません。",
    subject: "【yah.homes】ご予約が確定しました", greetSuffix: " 様",
    lead: "yah.homes をご予約いただきありがとうございます。ご予約が確定しました。",
    bookingNo: "予約番号", checkTitle: "ご予約内容",
    checkin: "チェックイン", checkout: "チェックアウト", stay: "お客様のご予約", guestsRow: "宿泊者の内訳",
    house: "お部屋", arrival: "到着予定時刻", checkinWindow: "{ci}〜（時間の制限はありません）", checkoutWindow: "〜{co}",
    nights: "{n}泊", guests: "大人{g}名",
    cancelTitle: "キャンセル料", cancelFree: "{d} まで", cancelAfter: "{d} 以降", cancelNote: "キャンセル期限は日本時間での表記です。", changeNote: "日程・人数の変更をご希望の場合は、一度キャンセルのうえ、あらためてご予約ください。無料キャンセル期間内であれば追加のご負担はありません。",
    payTitle: "お支払い", payTotal: "合計料金", payPaid: "お支払い済み", payOnSite: "現地でのお支払い",
    payNote: "宿泊料・宿泊税・清掃料が含まれています。追加のご請求はありません。",
    ctaTitle: "予約内容の確認・変更", cta: "予約内容の変更・キャンセル", cta2: "お問い合わせ",
    ctaNote: "ご予約時のアカウントでログインすると、到着予定時刻の登録やご予約の確認ができます。",
    entryTitle: "入室について",
    entryBody: "玄関のキーボックスでの受け渡しです。暗証番号と詳しい入室手順は、ご到着の前日にメールでお送りします。深夜のご到着でも問題ありません。",
    placeTitle: "場所", placeBtn: "地図を開く",
    placeNote: "正確な住所は入室のご案内とあわせてお送りします。",
    safetyTitle: "安全のために",
    safetyBody: "当社からメールやお電話で、カード情報の再入力や追加のお支払いをお願いすることはありません。そのようなご連絡を受け取られた場合は、リンクを開かずに下記までご連絡ください。",
    contactTitle: "ご不明な点", contactBody: "このメールにご返信いただくか、contact@mail.yah.homes までご連絡ください。2〜3営業日以内にご連絡いたします。",
    footer: "yah.homes ／ ボンファイア株式会社",
  },
  en: {
    registerTitle: "One thing before your stay",
    registerLead: "Register the guest list (all guests)",
    registerDue: "Please complete by {d}",
    registerBtn: "Register guest list",
    registerBody: "Japanese law requires us to collect details for every person staying. Guests without an address in Japan also need to submit a passport photo for each person.",
    registerWarn: "We will send your entry instructions once we have your registration. Without it, we cannot send the key box PIN.",
    subject: "[yah.homes] Your booking is confirmed", greetSuffix: "",
    lead: "Thank you for booking with yah.homes. Your reservation is confirmed.",
    bookingNo: "Booking ID", checkTitle: "Booking details",
    checkin: "Check-in", checkout: "Check-out", stay: "Your reservation", guestsRow: "Guests",
    house: "House", arrival: "Estimated arrival", checkinWindow: "from {ci} (no time limit)", checkoutWindow: "until {co}",
    nights: "{n} nights", guests: "{g} adults",
    cancelTitle: "Cancellation fee", cancelFree: "Until {d}", cancelAfter: "From {d}", cancelNote: "Deadlines are shown in Japan time (JST).", changeNote: "To change your dates or party size, please cancel this booking and make a new one. Within the free cancellation period there is no extra cost.",
    payTitle: "Payment", payTotal: "Total", payPaid: "Paid", payOnSite: "Due on arrival",
    payNote: "Room rate, lodging tax and cleaning fee are included. There is nothing more to pay.",
    ctaTitle: "Manage your booking", cta: "Change or cancel your booking", cta2: "Contact us",
    ctaNote: "Sign in with the account you used to book to add your arrival time or review the booking.",
    entryTitle: "Getting in",
    entryBody: "Self check-in with a key box at the entrance. We will email the code and full instructions about 3 days before arrival. Late-night arrivals are fine.",
    placeTitle: "Location", placeBtn: "Open in Maps",
    placeNote: "The exact address is sent together with the check-in instructions.",
    safetyTitle: "Staying safe",
    safetyBody: "We will never email or call you to re-enter your card details or ask for an extra payment. If you receive such a message, do not open the link and contact us below.",
    contactTitle: "Questions?", contactBody: "Reply to this email or write to contact@mail.yah.homes. We answer within 2–3 business days.",
    footer: "yah.homes / Bonfire Inc.",
  },
  ko: {
    registerTitle: "숙박 전 부탁드릴 사항",
    registerLead: "숙박자 명부 등록 (투숙객 전원)",
    registerDue: "{d}까지 부탁드립니다",
    registerBtn: "숙박자 명부 등록하기",
    registerBody: "일본 여관업법에 따라 숙박하시는 모든 분의 정보를 받도록 되어 있습니다. 일본 내 주소가 없는 외국 국적 고객님은 전원의 여권 사진도 함께 제출해 주셔야 합니다.",
    registerWarn: "등록이 확인되면 입실 방법을 보내드립니다. 등록이 없으면 키박스 비밀번호를 보내드릴 수 없습니다.",
    subject: "[yah.homes] 예약이 확정되었습니다", greetSuffix: " 님",
    lead: "yah.homes를 예약해 주셔서 감사합니다. 예약이 확정되었습니다.",
    bookingNo: "예약번호", checkTitle: "예약 내용",
    checkin: "체크인", checkout: "체크아웃", stay: "예약 내용", guestsRow: "인원",
    house: "숙소", arrival: "도착 예정 시각", checkinWindow: "{ci}~ (시간 제한 없음)", checkoutWindow: "~{co}",
    nights: "{n}박", guests: "성인 {g}명",
    cancelTitle: "취소 수수료", cancelFree: "{d}까지", cancelAfter: "{d} 이후", cancelNote: "취소 기한은 일본 시간 기준입니다.", changeNote: "날짜나 인원 변경을 원하시면 예약을 취소하신 후 다시 예약해 주세요. 무료 취소 기간 내라면 추가 부담은 없습니다.",
    payTitle: "결제", payTotal: "총 금액", payPaid: "결제 완료", payOnSite: "현지 결제",
    payNote: "숙박료・숙박세・청소비가 포함되어 있습니다. 추가 청구는 없습니다.",
    ctaTitle: "예약 확인・변경", cta: "예약 변경・취소", cta2: "문의하기",
    ctaNote: "예약하신 계정으로 로그인하면 도착 예정 시각 등록과 예약 확인이 가능합니다.",
    entryTitle: "입실 안내",
    entryBody: "현관 키박스를 이용한 셀프 체크인입니다. 비밀번호와 자세한 안내는 도착 3일 전을 기준으로 메일로 보내드립니다. 늦은 시간 도착도 괜찮습니다.",
    placeTitle: "위치", placeBtn: "지도 열기",
    placeNote: "정확한 주소는 입실 안내와 함께 보내드립니다.",
    safetyTitle: "안전 안내",
    safetyBody: "당사는 메일이나 전화로 카드 정보 재입력이나 추가 결제를 요청하지 않습니다. 그런 연락을 받으시면 링크를 열지 마시고 아래로 연락해 주세요.",
    contactTitle: "문의", contactBody: "이 메일에 회신하시거나 contact@mail.yah.homes로 연락해 주세요. 2~3영업일 이내에 답변드립니다.",
    footer: "yah.homes / Bonfire Inc.",
  },
  zh: {
    registerTitle: "入住前的一項請求",
    registerLead: "登記住宿者名冊（全體住宿者）",
    registerDue: "請於 {d} 前完成",
    registerBtn: "登記住宿者名冊",
    registerBody: "依日本旅館業法規定，我們必須取得每一位住宿者的資料。在日本沒有住址的外籍旅客，另需提供全體住宿者的護照照片。",
    registerWarn: "確認登記後，我們會寄送入住方式。未完成登記，恕無法提供密碼鎖號碼。",
    subject: "【yah.homes】您的預訂已確認", greetSuffix: " 您好",
    lead: "感謝您預訂 yah.homes，您的預訂已確認。",
    bookingNo: "預訂編號", checkTitle: "預訂內容",
    checkin: "入住", checkout: "退房", stay: "您的預訂", guestsRow: "人數",
    house: "房源", arrival: "預計抵達時間", checkinWindow: "{ci} 起（無時間限制）", checkoutWindow: "{co} 前",
    nights: "{n}晚", guests: "成人{g}人",
    cancelTitle: "取消費用", cancelFree: "{d} 前", cancelAfter: "{d} 起", cancelNote: "取消期限以日本時間為準。", changeNote: "如需變更日期或人數，請先取消本次預訂後重新預訂。在免費取消期限內不會產生額外費用。",
    payTitle: "付款", payTotal: "總金額", payPaid: "已付金額", payOnSite: "現場付款",
    payNote: "已含住宿費・住宿稅・清潔費，不會另外收費。",
    ctaTitle: "查看・變更預訂", cta: "變更・取消預訂", cta2: "聯絡我們",
    ctaNote: "以預訂時使用的帳號登入，即可登記抵達時間或查看預訂。",
    entryTitle: "入住方式",
    entryBody: "以門口密碼鎖自助入住。密碼與詳細說明將於抵達3天前以電子郵件寄送。深夜抵達也沒問題。",
    placeTitle: "位置", placeBtn: "開啟地圖",
    placeNote: "詳細地址將與入住說明一併寄送。",
    safetyTitle: "安全提醒",
    safetyBody: "本公司不會以郵件或電話要求您重新輸入信用卡資訊或額外付款。若收到此類訊息，請勿開啟連結並與我們聯繫。",
    contactTitle: "有任何問題", contactBody: "請回覆這封郵件，或來信 contact@mail.yah.homes。我們會在2〜3個工作天內回覆。",
    footer: "yah.homes / Bonfire Inc.",
  },
  th: {
    registerTitle: "สิ่งที่ขอความร่วมมือก่อนเข้าพัก",
    registerLead: "ลงทะเบียนรายชื่อผู้เข้าพัก (ทุกท่าน)",
    registerDue: "กรุณาดำเนินการภายใน {d}",
    registerBtn: "ลงทะเบียนรายชื่อผู้เข้าพัก",
    registerBody: "กฎหมายญี่ปุ่นกำหนดให้เราต้องเก็บข้อมูลของผู้เข้าพักทุกท่าน ผู้เข้าพักที่ไม่มีที่อยู่ในญี่ปุ่นต้องส่งรูปหนังสือเดินทางของทุกท่านด้วย",
    registerWarn: "เราจะส่งวิธีเข้าห้องพักหลังได้รับการลงทะเบียนแล้ว หากไม่ลงทะเบียน เราไม่สามารถส่งรหัสกล่องกุญแจให้ได้",
    subject: "[yah.homes] ยืนยันการจองของคุณแล้ว", greetSuffix: "",
    lead: "ขอบคุณที่จองที่พักกับ yah.homes การจองของคุณได้รับการยืนยันแล้ว",
    bookingNo: "หมายเลขการจอง", checkTitle: "รายละเอียดการจอง",
    checkin: "เช็คอิน", checkout: "เช็คเอาท์", stay: "การจองของคุณ", guestsRow: "ผู้เข้าพัก",
    house: "ที่พัก", arrival: "เวลาที่คาดว่าจะถึง", checkinWindow: "ตั้งแต่ {ci} (ไม่จำกัดเวลา)", checkoutWindow: "ก่อน {co}",
    nights: "{n} คืน", guests: "ผู้ใหญ่ {g} ท่าน",
    cancelTitle: "ค่าธรรมเนียมการยกเลิก", cancelFree: "ถึง {d}", cancelAfter: "ตั้งแต่ {d}", cancelNote: "กำหนดเวลาแสดงตามเวลาญี่ปุ่น (JST)", changeNote: "หากต้องการเปลี่ยนวันที่หรือจำนวนผู้เข้าพัก กรุณายกเลิกการจองนี้แล้วจองใหม่ ภายในระยะเวลายกเลิกฟรีจะไม่มีค่าใช้จ่ายเพิ่ม",
    payTitle: "การชำระเงิน", payTotal: "ราคารวม", payPaid: "ชำระแล้ว", payOnSite: "ชำระที่ที่พัก",
    payNote: "รวมค่าห้อง ภาษีที่พัก และค่าทำความสะอาดแล้ว ไม่มีค่าใช้จ่ายเพิ่มเติม",
    ctaTitle: "จัดการการจอง", cta: "เปลี่ยนแปลงหรือยกเลิกการจอง", cta2: "ติดต่อเรา",
    ctaNote: "เข้าสู่ระบบด้วยบัญชีที่ใช้จอง เพื่อระบุเวลาที่จะมาถึงหรือตรวจสอบการจอง",
    entryTitle: "การเข้าที่พัก",
    entryBody: "เช็คอินด้วยตนเองผ่านกล่องกุญแจที่หน้าประตู เราจะส่งรหัสและคำแนะนำโดยละเอียดทางอีเมลประมาณ 3 วันก่อนวันเข้าพัก มาถึงดึกก็ไม่มีปัญหา",
    placeTitle: "สถานที่", placeBtn: "เปิดแผนที่",
    placeNote: "ที่อยู่โดยละเอียดจะส่งพร้อมกับคำแนะนำการเช็คอิน",
    safetyTitle: "เพื่อความปลอดภัย",
    safetyBody: "เราจะไม่ส่งอีเมลหรือโทรขอให้คุณกรอกข้อมูลบัตรใหม่หรือชำระเงินเพิ่ม หากได้รับข้อความลักษณะนี้ กรุณาอย่าเปิดลิงก์และติดต่อเราตามด้านล่าง",
    contactTitle: "มีคำถาม", contactBody: "ตอบกลับอีเมลฉบับนี้ หรือเขียนถึงเราที่ contact@mail.yah.homes เราจะตอบภายใน 2–3 วันทำการ",
    footer: "yah.homes / Bonfire Inc.",
  },
};

function buildConfirmationMail(
  lang: string,
  d: { id: string; name: string; prop: string; checkin: string; checkout: string; nights: number; guests: number; total: number; arrival: string; freeCancel: string; checkinTime: string; checkoutTime: string; registerDeadline: string },
): { subject: string; text: string; html: string } {
  const L = MAIL_L10N[lang] ?? MAIL_L10N.en;
  const P: { name: string; image: string; address: string; map: string; register?: string } =
    MAIL_PROP[d.prop] ?? { name: d.prop, image: "", address: "", map: "" };
  const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;
  const no = d.id.slice(0, 8).toUpperCase();
  const ciWin = L.checkinWindow.replace("{ci}", d.checkinTime);
  const coWin = L.checkoutWindow.replace("{co}", d.checkoutTime);
  const myPage = `${SITE_URL}/${lang === "en" ? "" : `${lang}/`}account/`;

  // ── 行・カードの部品（メールクライアント互換のため table + インラインCSS） ──
  const row = (k: string, v: string, sub = "") =>
    `<tr>
       <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888888;vertical-align:top;">${k}</td>
       <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#111111;text-align:right;font-weight:500;">
         ${v}${sub ? `<div style="font-size:12px;color:#aaaaaa;font-weight:400;margin-top:2px;">${sub}</div>` : ""}
       </td>
     </tr>`;
  const cardOpen = (title: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:6px;margin:0 0 16px;">
       <tr><td style="padding:18px 20px;">
         <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#999999;margin-bottom:10px;">${title}</div>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0">`;
  const cardClose = (note = "") =>
    `</table>${note ? `<div style="font-size:12px;color:#999999;line-height:1.7;margin-top:12px;">${note}</div>` : ""}</td></tr></table>`;
  const block = (title: string, body: string, extra = "") =>
    `<div style="border-top:1px solid #f0f0f0;padding:16px 0 0;margin-top:4px;">
       <div style="font-size:13px;font-weight:600;color:#111111;margin-bottom:6px;">${title}</div>
       <div style="font-size:13px;color:#666666;line-height:1.8;">${body}</div>${extra}
     </div>`;

  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(L.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',Helvetica,Arial,sans-serif;">

  <tr><td style="background:#111111;padding:20px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:17px;font-weight:600;color:#ffffff;letter-spacing:.02em;">yah.homes</td>
      <td style="text-align:right;font-size:11px;color:#bbbbbb;line-height:1.6;">${esc(L.bookingNo)}<br><span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:.06em;">${esc(no)}</span></td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:28px 24px 0;">
    <div style="font-size:15px;color:#111111;margin-bottom:6px;">${esc(d.name)}${esc(L.greetSuffix)}</div>
    <div style="font-size:21px;font-weight:600;color:#111111;line-height:1.5;margin-bottom:12px;">${esc(L.lead)}</div>
    <div style="font-size:13px;color:#111111;line-height:2;padding:12px 14px;background:#f7f7f7;border-radius:6px;margin-bottom:22px;">
      ✓&nbsp; ${esc(L.checkin)}: <strong>${esc(d.checkin)}</strong> ${esc(ciWin)}<br>
      ✓&nbsp; ${esc(L.cancelFree.replace("{d}", d.freeCancel))} ${yen(0)}
    </div>
  </td></tr>

  ${P.register ? `<tr><td style="padding:0 24px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #111111;border-radius:6px;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#999999;margin-bottom:8px;">${esc(L.registerTitle)}</div>
        <div style="font-size:16px;font-weight:600;color:#111111;line-height:1.6;margin-bottom:4px;">${esc(L.registerLead)}</div>
        <div style="font-size:13px;font-weight:600;color:#111111;margin-bottom:12px;">${esc(L.registerDue.replace("{d}", d.registerDeadline))}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
          <tr><td align="center" style="border-radius:6px;background:#111111;">
            <a href="${esc(P.register)}" style="display:block;padding:14px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(L.registerBtn)}</a>
          </td></tr>
        </table>
        <div style="font-size:12px;color:#666666;line-height:1.8;">${esc(L.registerBody)}</div>
        <div style="font-size:12px;color:#111111;line-height:1.8;margin-top:8px;font-weight:500;">${esc(L.registerWarn)}</div>
      </td></tr>
    </table>
  </td></tr>` : ""}

  ${P.image ? `<tr><td style="padding:0 24px 22px;">
    <img src="${esc(P.image)}" width="552" alt="${esc(P.name)}" style="display:block;width:100%;max-width:552px;height:auto;border-radius:8px;border:0;outline:none;text-decoration:none;" />
    <div style="font-size:15px;font-weight:600;color:#111111;margin-top:12px;">${esc(P.name)}</div>
    ${P.address ? `<div style="font-size:12px;color:#888888;margin-top:3px;">${esc(P.address)}</div>` : ""}
  </td></tr>` : ""}

  <tr><td style="padding:0 24px;">
    ${cardOpen(esc(L.checkTitle))}
      ${row(esc(L.house), esc(P.name))}
      ${row(esc(L.checkin), esc(d.checkin), esc(ciWin))}
      ${row(esc(L.checkout), esc(d.checkout), esc(coWin))}
      ${row(esc(L.stay), esc(L.nights.replace("{n}", String(d.nights))))}
      ${row(esc(L.guestsRow), esc(L.guests.replace("{g}", String(d.guests))))}
      ${d.arrival ? row(esc(L.arrival), esc(d.arrival)) : ""}
    ${cardClose()}

    ${cardOpen(esc(L.cancelTitle))}
      ${row(esc(L.cancelFree.replace("{d}", d.freeCancel)), yen(0))}
      ${row(esc(L.cancelAfter.replace("{d}", d.freeCancel)), yen(d.total))}
    ${cardClose(`${esc(L.cancelNote)}<br>${esc(L.changeNote)}`)}

    ${cardOpen(esc(L.payTitle))}
      ${row(esc(L.payTotal), yen(d.total))}
      ${row(esc(L.payPaid), `<span style="color:#111111;">${yen(d.total)}</span>`)}
      ${row(esc(L.payOnSite), `<span style="color:#111111;">${yen(0)}</span>`)}
    ${cardClose(esc(L.payNote))}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
      <tr><td align="center" style="border-radius:6px;background:#111111;">
        <a href="${esc(myPage)}" style="display:block;padding:15px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(L.cta)}</a>
      </td></tr>
      <tr><td align="center" style="padding-top:10px;">
        <a href="mailto:contact@mail.yah.homes?subject=${encodeURIComponent(`${L.bookingNo} ${no}`)}" style="display:block;padding:13px 24px;border:1px solid #d7d7d7;border-radius:6px;font-size:14px;font-weight:500;color:#111111;text-decoration:none;">${esc(L.cta2)}</a>
      </td></tr>
      <tr><td style="padding-top:10px;font-size:12px;color:#999999;line-height:1.7;text-align:center;">${esc(L.ctaNote)}</td></tr>
    </table>

    ${block(esc(L.entryTitle), esc(L.entryBody))}
    ${P.map ? block(esc(L.placeTitle),
      P.address ? `<span style="color:#111111;font-weight:500;">${esc(P.address)}</span>` : esc(L.placeNote),
      `<div style="margin-top:10px;"><a href="${esc(P.map)}" style="display:inline-block;padding:9px 16px;border:1px solid #d7d7d7;border-radius:5px;font-size:13px;color:#111111;text-decoration:none;">${esc(L.placeBtn)}</a></div>`) : ""}
    ${block(esc(L.safetyTitle), esc(L.safetyBody))}
    ${block(esc(L.contactTitle), esc(L.contactBody))}
  </td></tr>

  <tr><td style="padding:22px 24px 26px;">
    <div style="border-top:1px solid #f0f0f0;padding-top:16px;font-size:12px;color:#aaaaaa;line-height:1.8;">${esc(L.footer)}</div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  const text = [
    `${d.name}${L.greetSuffix}`, "",
    L.lead, "",
    `${L.bookingNo}: ${no}`, "",
    P.register ? `--- ${L.registerTitle} ---` : "",
    P.register ? `${L.registerLead}` : "",
    P.register ? `${L.registerDue.replace("{d}", d.registerDeadline)}` : "",
    P.register ? `${P.register}` : "",
    P.register ? `${L.registerBody}` : "",
    P.register ? `${L.registerWarn}\n` : "",
    `--- ${L.checkTitle} ---`,
    `${L.house}: ${P.name}`,
    `${L.checkin}: ${d.checkin} ${ciWin}`,
    `${L.checkout}: ${d.checkout} ${coWin}`,
    `${L.stay}: ${L.nights.replace("{n}", String(d.nights))}`,
    `${L.guestsRow}: ${L.guests.replace("{g}", String(d.guests))}`,
    d.arrival ? `${L.arrival}: ${d.arrival}` : "",
    "", `--- ${L.cancelTitle} ---`,
    `${L.cancelFree.replace("{d}", d.freeCancel)}: ${yen(0)}`,
    `${L.cancelAfter.replace("{d}", d.freeCancel)}: ${yen(d.total)}`,
    L.cancelNote,
    L.changeNote,
    "", `--- ${L.payTitle} ---`,
    `${L.payTotal}: ${yen(d.total)}`,
    `${L.payPaid}: ${yen(d.total)}`,
    `${L.payOnSite}: ${yen(0)}`,
    L.payNote,
    "", `${L.cta}: ${myPage}`, `${L.cta2}: contact@mail.yah.homes`,
    "", `--- ${L.entryTitle} ---`, L.entryBody,
    P.map ? `\n--- ${L.placeTitle} ---\n${P.address || L.placeNote}\n${P.map}` : "",
    "", `--- ${L.safetyTitle} ---`, L.safetyBody,
    "", L.contactBody, "", L.footer,
  ].filter((x) => x !== "").join("\n");

  return { subject: `${L.subject}（${d.checkin}〜${d.checkout}）`, text, html };
}

/** 予約確定メール（お客様宛・予約言語で送る）。失敗しても確定は取り消さない。 */
async function sendConfirmationMail(bookingId: string, b: BookingDoc & Record<string, unknown>): Promise<void> {
  try {
    const lang = String(b.lang ?? "en");
    const free = b.freeCancelUntilAt
      ? new Date(String(b.freeCancelUntilAt)).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "long", timeStyle: "short" })
      : "-";
    // チェックイン/アウト時刻は物件ファクト（Firestore）を正とする
    let ci = "16:00", co = "10:00";
    try {
      const f = (await db.collection("property_facts").doc(b.prop === "test" ? "kiyokawa" : b.prop).get()).data();
      ci = String(f?.checkinTime ?? ci); co = String(f?.checkoutTime ?? co);
    } catch { /* 既定値のまま送る */ }
    // 宿泊者名簿の期限＝チェックイン2日前（JST）。前日10:00の入室案内より前に締める。
    const LOC: Record<string, string> = { ja: "ja-JP", en: "en-US", ko: "ko-KR", zh: "zh-TW", th: "th-TH" };
    const registerDeadline = new Date(Date.parse(`${b.checkin}T00:00:00+09:00`) - 2 * 86400000)
      .toLocaleDateString(LOC[lang] ?? "en-US", { timeZone: "Asia/Tokyo", dateStyle: "long" });
    const { subject, text, html } = buildConfirmationMail(lang, {
      checkinTime: ci, checkoutTime: co, registerDeadline,
      id: bookingId,
      name: String(b.name ?? ""),
      prop: b.prop,
      checkin: b.checkin,
      checkout: b.checkout,
      nights: Math.round((Date.parse(b.checkout) - Date.parse(b.checkin)) / 86400000),
      guests: Number(b.guests),
      total: Number(b.total),
      arrival: String(b.arrival ?? ""),
      freeCancel: free,
    });
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });
    await transporter.sendMail({
      from: `"yah.homes" <${SMTP_USER.value()}>`,
      to: String(b.email),
      replyTo: SMTP_USER.value(),
      subject, text, html,
    });
  } catch (err) {
    logger.error("sendConfirmationMail failed", err); // 送信失敗で予約は取り消さない
  }
}

const CANCEL_L10N: Record<string, Record<string, string>> = {
  ja: { subject: "【yah.homes】ご予約をキャンセルしました", greetSuffix: " 様", bookingNo: "予約番号",
    lead: "ご予約のキャンセルを承りました。", refundTitle: "ご返金",
    paid: "お支払い済み金額", fee: "キャンセル料", refund: "ご返金額",
    refundNote: "ご利用のカードへ返金処理を行います。カード会社の処理により、反映まで数日から1か月程度かかる場合があります。",
    noRefundNote: "キャンセル期限を過ぎているため、ご返金はありません。",
    again: "またのご利用をお待ちしております。日程を改めてのご予約はこちらから承ります。",
    cta: "空室を見る", contact: "ご不明な点は、このメールにご返信ください。", footer: "yah.homes ／ ボンファイア株式会社" },
  en: { subject: "[yah.homes] Your booking has been cancelled", greetSuffix: "", bookingNo: "Booking ID",
    lead: "We have cancelled your booking.", refundTitle: "Refund",
    paid: "Paid", fee: "Cancellation fee", refund: "Refund",
    refundNote: "We are refunding to the card you used. Depending on your card issuer, it can take from a few days to about a month to appear.",
    noRefundNote: "The free cancellation deadline had passed, so no refund applies.",
    again: "We hope to welcome you another time. You can book new dates any time.",
    cta: "See availability", contact: "Just reply to this email if you have any questions.", footer: "yah.homes / Bonfire Inc." },
  ko: { subject: "[yah.homes] 예약이 취소되었습니다", greetSuffix: " 님", bookingNo: "예약번호",
    lead: "예약 취소를 접수했습니다.", refundTitle: "환불",
    paid: "결제 완료 금액", fee: "취소 수수료", refund: "환불 금액",
    refundNote: "사용하신 카드로 환불 처리됩니다. 카드사 처리에 따라 반영까지 며칠에서 한 달 정도 걸릴 수 있습니다.",
    noRefundNote: "무료 취소 기한이 지나 환불은 없습니다.",
    again: "다음 기회에 다시 모시겠습니다. 새로운 날짜로 언제든지 예약하실 수 있습니다.",
    cta: "빈방 보기", contact: "궁금하신 점은 이 메일에 회신해 주세요.", footer: "yah.homes / Bonfire Inc." },
  zh: { subject: "【yah.homes】您的預訂已取消", greetSuffix: " 您好", bookingNo: "預訂編號",
    lead: "已受理您的預訂取消。", refundTitle: "退款",
    paid: "已付金額", fee: "取消費用", refund: "退款金額",
    refundNote: "將退款至您使用的信用卡。依發卡機構作業，反映時間可能需要數日至一個月左右。",
    noRefundNote: "已超過免費取消期限，故不予退款。",
    again: "期待再次為您服務，隨時歡迎重新選擇日期預訂。",
    cta: "查詢空房", contact: "如有任何問題，請直接回覆這封郵件。", footer: "yah.homes / Bonfire Inc." },
  th: { subject: "[yah.homes] ยกเลิกการจองของคุณแล้ว", greetSuffix: "", bookingNo: "หมายเลขการจอง",
    lead: "เราได้ยกเลิกการจองของคุณแล้ว", refundTitle: "การคืนเงิน",
    paid: "ชำระแล้ว", fee: "ค่าธรรมเนียมการยกเลิก", refund: "จำนวนเงินคืน",
    refundNote: "เราจะคืนเงินไปยังบัตรที่คุณใช้ ขึ้นอยู่กับผู้ออกบัตร อาจใช้เวลาไม่กี่วันถึงประมาณหนึ่งเดือน",
    noRefundNote: "เลยกำหนดยกเลิกฟรีแล้ว จึงไม่มีการคืนเงิน",
    again: "หวังว่าจะได้ต้อนรับคุณอีกครั้ง คุณสามารถจองวันใหม่ได้ตลอดเวลา",
    cta: "ดูห้องว่าง", contact: "หากมีคำถาม กรุณาตอบกลับอีเมลฉบับนี้", footer: "yah.homes / Bonfire Inc." },
};

/** キャンセル確認メール（お客様宛・確定メールと同じカード構成）。失敗しても取消は成立させる。 */
async function sendCancellationMail(
  bookingId: string,
  b: BookingDoc & Record<string, unknown>,
  refundAmount: number,
): Promise<void> {
  try {
    const lang = String(b.lang ?? "en");
    const L = CANCEL_L10N[lang] ?? CANCEL_L10N.en;
    const P = MAIL_PROP[b.prop] ?? { name: b.prop, image: "", address: "", map: "" };
    const yen = (n: number) => `¥${Number(n).toLocaleString("en-US")}`;
    const no = bookingId.slice(0, 8).toUpperCase();
    const total = Number(b.total);
    const fee = total - refundAmount;
    const bookPath = `${SITE_URL}/${lang === "en" ? "" : `${lang}/`}book/`;
    const row = (k: string, v: string, strong = false) =>
      `<tr><td style="padding:11px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888888;">${k}</td>
        <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;font-size:${strong ? "16px" : "14px"};color:#111111;text-align:right;font-weight:${strong ? "600" : "500"};">${v}</td></tr>`;

    const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(L.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',Helvetica,Arial,sans-serif;">
  <tr><td style="background:#111111;padding:20px 24px;">
    <table role="presentation" width="100%"><tr>
      <td style="font-size:17px;font-weight:600;color:#ffffff;">yah.homes</td>
      <td style="text-align:right;font-size:11px;color:#bbbbbb;line-height:1.6;">${esc(L.bookingNo)}<br><span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:.06em;">${esc(no)}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 24px 0;">
    <div style="font-size:15px;color:#111111;margin-bottom:6px;">${esc(String(b.name ?? ""))}${esc(L.greetSuffix)}</div>
    <div style="font-size:20px;font-weight:600;color:#111111;line-height:1.5;margin-bottom:18px;">${esc(L.lead)}</div>
    <div style="font-size:13px;color:#555555;line-height:1.9;padding:12px 14px;background:#f7f7f7;border-radius:6px;margin-bottom:20px;">
      ${esc(P.name)}<br>${esc(String(b.checkin))} 〜 ${esc(String(b.checkout))}
    </div>
    <table role="presentation" width="100%" style="border:1px solid #e8e8e8;border-radius:6px;margin-bottom:16px;"><tr><td style="padding:18px 20px;">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#999999;margin-bottom:10px;">${esc(L.refundTitle)}</div>
      <table role="presentation" width="100%">
        ${row(esc(L.paid), yen(total))}
        ${row(esc(L.fee), yen(fee))}
        ${row(esc(L.refund), yen(refundAmount), true)}
      </table>
      <div style="font-size:12px;color:#999999;line-height:1.7;margin-top:12px;">${esc(refundAmount > 0 ? L.refundNote : L.noRefundNote)}</div>
    </td></tr></table>
    <div style="font-size:13px;color:#666666;line-height:1.9;margin:18px 0 14px;">${esc(L.again)}</div>
    <table role="presentation" width="100%"><tr><td align="center" style="border-radius:6px;background:#111111;">
      <a href="${esc(bookPath)}" style="display:block;padding:14px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(L.cta)}</a>
    </td></tr></table>
    <div style="border-top:1px solid #f0f0f0;margin-top:22px;padding-top:16px;font-size:13px;color:#666666;line-height:1.8;">${esc(L.contact)}</div>
  </td></tr>
  <tr><td style="padding:18px 24px 26px;font-size:12px;color:#aaaaaa;">${esc(L.footer)}</td></tr>
</table></td></tr></table></body></html>`;

    const text = [
      `${String(b.name ?? "")}${L.greetSuffix}`, "", L.lead, "",
      `${P.name}`, `${b.checkin} 〜 ${b.checkout}`, `${L.bookingNo}: ${no}`, "",
      `--- ${L.refundTitle} ---`,
      `${L.paid}: ${yen(total)}`, `${L.fee}: ${yen(fee)}`, `${L.refund}: ${yen(refundAmount)}`,
      refundAmount > 0 ? L.refundNote : L.noRefundNote, "",
      L.again, bookPath, "", L.contact, "", L.footer,
    ].join("\n");

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });
    await transporter.sendMail({
      from: `"yah.homes" <${SMTP_USER.value()}>`, to: String(b.email),
      replyTo: SMTP_USER.value(), subject: L.subject, text, html,
    });
  } catch (err) {
    logger.error("sendCancellationMail failed", err);
  }
}

async function notifyError(text: string): Promise<void> {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });
    await transporter.sendMail({
      from: `"yah.homes 予約" <${SMTP_USER.value()}>`,
      to: await notifyRecipients("notifyBookings"),
      subject: "【予約エラー】直販予約の処理でエラーが発生しました",
      text,
      html: mailHtml({
        heading: "直販予約の処理でエラーが発生しました",
        badge: "状態|要対応",
        variant: "alert",
        blocks: [{ title: "内容", body: esc(text) }],
        cta: { label: "予約管理を開く", href: `${SITE_URL}/admin/bookings/` },
      }),
    });
  } catch (err) {
    logger.error("notifyError failed", err);
  }
}


// ─── MS3.5: My Page API（自分の予約一覧・到着予定時刻の追記・v4 §6） ───
export const accountApi = onRequest(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, BEDS24_WRITE_REFRESH, SMTP_USER, SMTP_PASS],
    serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const authz = String(req.headers["authorization"] ?? "");
    const m = /^Bearer (.+)$/.exec(authz);
    if (!m) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
    let uid = "";
    try {
      uid = (await getAuth().verifyIdToken(m[1])).uid;
    } catch { res.status(401).json({ ok: false, error: "unauthorized" }); return; }

    try {
      if (req.method === "GET") {
        // 確定待ちのポーリング用: 1件だけ返す（本人のUIDに限る）
        const one = String(req.query.bookingId ?? "");
        if (one) {
          const d = await db.collection("bookings").doc(one).get();
          const v = d.data();
          if (!d.exists || !v || v.uid !== uid) { res.status(404).json({ ok: false, error: "not_found" }); return; }
          res.status(200).json({
            ok: true,
            item: {
              id: d.id, prop: v.prop, checkin: v.checkin, checkout: v.checkout, guests: v.guests,
              total: v.total, status: v.status, arrival: v.arrival ?? null, name: v.name ?? "",
              freeCancelUntilAt: v.freeCancelUntilAt ?? null, beds24Id: v.beds24Id ?? null,
            },
          });
          return;
        }
        // 本人のUIDの予約のみ（v4 §8-4）
        const snap = await db.collection("bookings").where("uid", "==", uid).orderBy("checkin", "desc").limit(50).get();
        // 表示対象: 確定・キャンセル・手続き中（＝決済済み）。
        // PAYMENT_PENDING は「決済に進まず離脱した下書き」なので、進行中の1時間だけ見せる。
        // VOIDED / PAYMENT_FAILED は課金が無く、お客様にとって予約ではないので出さない。
        const HIDDEN = new Set(["VOIDED", "PAYMENT_FAILED"]);
        const DRAFT_TTL_MS = 60 * 60 * 1000;
        const items = snap.docs
          .filter((d) => {
            const v = d.data();
            if (HIDDEN.has(String(v.status))) return false;
            if (v.status === "PAYMENT_PENDING") {
              const created = v.createdAt?.toMillis?.() ?? 0;
              return created > 0 && Date.now() - created < DRAFT_TTL_MS;
            }
            return true;
          })
          .map((d) => {
          const v = d.data();
          return {
            id: d.id, prop: v.prop, checkin: v.checkin, checkout: v.checkout, guests: v.guests,
            total: v.total, status: v.status, arrival: v.arrival ?? null,
            freeCancelUntilAt: v.freeCancelUntilAt ?? null,
          };
        });
        res.status(200).json({ ok: true, items });
        return;
      }

      if (req.method === "POST") {
        const { action, bookingId, arrival, reason } = (req.body ?? {}) as Record<string, unknown>;
        const idStr = typeof bookingId === "string" ? bookingId : "";
        if (!idStr || (action !== "arrival" && action !== "cancel")) {
          res.status(400).json({ ok: false, error: "invalid_input" }); return;
        }

        // ── セルフキャンセル（v5 §5-3 / spec_self_cancel_202608.md）──
        if (action === "cancel") {
          const ref = db.collection("bookings").doc(idStr);
          const v = (await ref.get()).data() as (BookingDoc & Record<string, unknown>) | undefined;
          if (!v || v.uid !== uid) { res.status(403).json({ ok: false, error: "forbidden" }); return; }
          if (v.status !== "CONFIRMED") { res.status(409).json({ ok: false, error: "not_cancellable" }); return; }

          // チェックイン当日・滞在中はセルフキャンセル不可（問い合わせのみ・決定事項④）
          const checkinStart = Date.parse(`${v.checkin}T00:00:00+09:00`);
          if (Date.now() >= checkinStart) { res.status(409).json({ ok: false, error: "after_checkin" }); return; }

          // 返金額はサーバー時刻で決める。クライアントの時計は使わない（決定事項①②）
          const freeUntil = v.freeCancelUntilAt ? Date.parse(String(v.freeCancelUntilAt)) : 0;
          const withinFree = freeUntil > 0 && Date.now() < freeUntil;
          const refundAmount = withinFree ? Number(v.total) : 0;

          // 二重実行の防止: CANCELLING へのCASで入口を1つに絞る
          const okLock = await transition(ref,
            { status: ["CONFIRMED"], stateVersion: v.stateVersion },
            { status: "CANCELLING", cancelReason: typeof reason === "string" ? reason.slice(0, 500) : null });
          if (!okLock) { res.status(409).json({ ok: false, error: "in_progress" }); return; }

          const revert = async (failure: string) => {
            const c = (await ref.get()).data() as BookingDoc;
            await transition(ref, { status: ["CANCELLING"], stateVersion: c.stateVersion },
              { status: "MANUAL_REVIEW", failureReason: failure });
          };

          // ① Beds24 を先に取り消す。返金だけ通って部屋が残る状態を作らない。
          if (v.beds24Id) {
            try {
              await cancelBeds24Booking(Number(v.beds24Id));
            } catch (e) {
              await notifyError(
                `[要対応] お客様のキャンセル操作で Beds24 の取り消しに失敗しました。返金は行っていません。\n` +
                `予約ID: ${idStr}／Beds24予約ID: ${v.beds24Id}／${String(e).slice(0, 160)}`,
              );
              await revert(`beds24_cancel_failed: ${String(e).slice(0, 120)}`);
              res.status(500).json({ ok: false, error: "cancel_failed" });
              return;
            }
          }

          // ② 返金（無料期間内のみ）
          if (refundAmount > 0 && v.paymentIntentId) {
            try {
              const stripe = stripeClient();
              const pi = await stripe.paymentIntents.retrieve(String(v.paymentIntentId));
              if (pi.status === "requires_capture") await stripe.paymentIntents.cancel(pi.id);
              else await stripe.refunds.create({ payment_intent: pi.id, amount: refundAmount });
            } catch (e) {
              await notifyError(
                `[要対応] Beds24 は取り消しましたが、返金に失敗しました。手動で返金してください。\n` +
                `予約ID: ${idStr}／返金額: ¥${refundAmount}／${String(e).slice(0, 160)}`,
              );
              await revert(`refund_failed: ${String(e).slice(0, 120)}`);
              res.status(500).json({ ok: false, error: "refund_failed" });
              return;
            }
          }

          // ③ 日付ロックを解放し、確定させる
          await releaseInventoryLocks(String(v.prop), String(v.checkin), String(v.checkout), idStr);
          const c2 = (await ref.get()).data() as BookingDoc;
          await transition(ref, { status: ["CANCELLING"], stateVersion: c2.stateVersion },
            { status: "CANCELLED", refundedAmount: refundAmount, cancelledBy: "guest",
              cancelledAt: FieldValue.serverTimestamp() });
          await db.collection("audit_logs").add({
            actor: `guest:${uid}`, action: "booking_self_cancel", target: idStr,
            amount: refundAmount, withinFree, beds24Id: v.beds24Id ?? null,
            reason: typeof reason === "string" ? reason.slice(0, 500) : null,
            at: FieldValue.serverTimestamp(),
          });

          await sendCancellationMail(idStr, v, refundAmount);
          try {
            const transporter = nodemailer.createTransport({
              host: "smtp.gmail.com", port: 465, secure: true,
              auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
            });
            await transporter.sendMail({
              from: `"yah.homes 予約" <${SMTP_USER.value()}>`,
              to: await notifyRecipients("notifyBookings"),
              subject: `【キャンセル】${v.prop} ${v.checkin}〜${v.checkout}（返金 ¥${refundAmount.toLocaleString("en-US")}）`,
              html: mailHtml({
                heading: "お客様ご自身によるキャンセルが完了しました",
                badge: `予約番号|${idStr.slice(0, 8).toUpperCase()}`,
                rows: [
                  ["棟", esc(PROPERTY_LABEL[String(v.prop)] ?? v.prop)],
                  ["日程", `${esc(v.checkin)} 〜 ${esc(v.checkout)}`],
                  ["人数", `${esc(v.guests)}名`],
                  ["お支払い済み", `¥${Number(v.total).toLocaleString("en-US")}`],
                  ["返金額", `¥${refundAmount.toLocaleString("en-US")}（${withinFree ? "無料期間内" : "期限後・返金なし"}）`],
                  ["Beds24", v.beds24Id ? "取り消し済み" : "書込なし"],
                ],
                blocks: [{ title: "理由", body: esc(typeof reason === "string" && reason ? reason : "（未記入）") }],
                cta: { label: "予約管理を開く", href: `${SITE_URL}/admin/bookings/` },
              }),
              text: [
                "お客様ご自身によるキャンセルが完了しました。",
                "", `棟: ${v.prop}`, `日程: ${v.checkin} 〜 ${v.checkout}`, `人数: ${v.guests}名`,
                `お支払い済み: ¥${Number(v.total).toLocaleString("en-US")}`,
                `返金額: ¥${refundAmount.toLocaleString("en-US")}（${withinFree ? "無料期間内" : "期限後・返金なし"}）`,
                `Beds24: ${v.beds24Id ? "取り消し済み" : "書込なし"}`,
                `理由: ${typeof reason === "string" && reason ? reason : "（未記入）"}`,
                `予約ID: ${idStr}`,
              ].join("\n"),
            });
          } catch (err) {
            logger.warn("cancel notify failed", err);
          }

          res.status(200).json({ ok: true, refunded: refundAmount, withinFree });
          return;
        }

        const arrStr = typeof arrival === "string" && /^(\d{2}:\d{2}|24:00\+|)$/.test(arrival) ? arrival : "";

        const ref = db.collection("bookings").doc(idStr);
        const snap = await ref.get();
        const v = snap.data();
        if (!v || v.uid !== uid) { res.status(403).json({ ok: false, error: "forbidden" }); return; }

        await ref.update({ arrival: arrStr || null, updatedAt: FieldValue.serverTimestamp() });
        // 運営会社へ共有（到着予定の把握・v4 §6）
        try {
          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com", port: 465, secure: true,
            auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
          });
          await transporter.sendMail({
            from: `"yah.homes 予約" <${SMTP_USER.value()}>`,
            to: await notifyRecipients("notifyBookings"),
            subject: `【到着予定】${v.prop} ${v.checkin} — ${arrStr || "未定"}`,
            text: `到着予定時刻が更新されました。\n\n棟: ${v.prop}\nチェックイン: ${v.checkin}\n到着予定: ${arrStr || "未定"}\n予約ID: ${idStr}`,
            html: mailHtml({
              heading: "到着予定時刻が更新されました",
              badge: `予約番号|${idStr.slice(0, 8).toUpperCase()}`,
              rows: [
                ["棟", esc(PROPERTY_LABEL[String(v.prop)] ?? v.prop)],
                ["チェックイン", esc(String(v.checkin))],
                ["到着予定", esc(arrStr || "未定")],
              ],
              cta: { label: "予約管理を開く", href: `${SITE_URL}/admin/bookings/` },
            }),
          });
        } catch (err) {
          logger.warn("arrival notify failed", err);
        }
        res.status(200).json({ ok: true });
        return;
      }

      res.status(405).json({ ok: false, error: "method_not_allowed" });
    } catch (err) {
      logger.error("accountApi failed", err);
      res.status(500).json({ ok: false, error: "internal" });
    }
  }
);


// ─── 管理者台帳API（/admin/users・編集はrootオーナーのみ・v4 §8-5b） ───
export const adminUsers = onRequest(
  { region: REGION, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const email = await verifyAdmin(req as { headers: Record<string, unknown> });
    if (!email) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
    const isRoot = PARTNERS_ADMIN_EMAILS.includes(email);

    try {
      if (req.method === "GET") {
        const snap = await db.collection("admin_users").get();
        const items = snap.docs.map((d) => {
          const v = d.data();
          return { email: d.id, name: v.name ?? "", role: v.role ?? "operator",
            notifyPartners: v.notifyPartners === true, notifyTeiten: v.notifyTeiten === true,
            notifyBookings: v.notifyBookings === true };
        });
        res.status(200).json({ ok: true, root: PARTNERS_ADMIN_EMAILS, isRoot, items });
        return;
      }

      if (req.method === "POST") {
        if (!isRoot) { res.status(403).json({ ok: false, error: "owner_only" }); return; }
        const { action, email: target, name, role, notifyPartners, notifyTeiten, notifyBookings } =
          (req.body ?? {}) as Record<string, unknown>;
        const targetStr = typeof target === "string" ? target.trim().toLowerCase() : "";
        if (!/^\S+@\S+\.\S+$/.test(targetStr)) { res.status(400).json({ ok: false, error: "invalid_email" }); return; }
        if (PARTNERS_ADMIN_EMAILS.includes(targetStr)) { res.status(400).json({ ok: false, error: "root_protected" }); return; }

        const ref = db.collection("admin_users").doc(targetStr);
        if (action === "delete") {
          await ref.delete();
          await db.collection("audit_logs").add({ actor: email, action: "admin_user_delete", target: targetStr, at: FieldValue.serverTimestamp() });
          res.status(200).json({ ok: true });
          return;
        }
        const exists = (await ref.get()).exists;
        await ref.set({
          name: typeof name === "string" ? name.trim().slice(0, 100) : "",
          role: role === "owner" ? "owner" : "operator",
          notifyPartners: notifyPartners === true,
          notifyTeiten: notifyTeiten === true,
          notifyBookings: notifyBookings === true,
          updatedAt: FieldValue.serverTimestamp(), updatedBy: email,
          ...(exists ? {} : { addedAt: FieldValue.serverTimestamp(), addedBy: email }),
        }, { merge: true });
        await db.collection("audit_logs").add({ actor: email, action: exists ? "admin_user_update" : "admin_user_add", target: targetStr, at: FieldValue.serverTimestamp() });
        res.status(200).json({ ok: true });
        return;
      }

      res.status(405).json({ ok: false, error: "method_not_allowed" });
    } catch (err) {
      logger.error("adminUsers failed", err);
      res.status(500).json({ ok: false, error: "internal" });
    }
  }
);


// ─── 直販予約の管理API（/admin/bookings・v4 §8-5） ───
// 一覧＝台帳メンバー、返金＝rootオーナーのみ。全金銭操作を audit_logs に記録。
export const adminBookings = onRequest(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, BEDS24_WRITE_REFRESH, SMTP_USER, SMTP_PASS], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const email = await verifyAdmin(req as { headers: Record<string, unknown> });
    if (!email) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
    const isRoot = PARTNERS_ADMIN_EMAILS.includes(email);

    try {
      if (req.method === "GET") {
        const snap = await db.collection("bookings").orderBy("createdAt", "desc").limit(200).get();
        const items = snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id, prop: v.prop, checkin: v.checkin, checkout: v.checkout, guests: v.guests,
            total: v.total, status: v.status, name: v.name ?? null, email: v.email ?? null,
            phone: v.phone ?? null, leadGuest: v.leadGuest ?? null, arrival: v.arrival ?? null,
            lang: v.lang ?? null, beds24Id: v.beds24Id ?? null, paymentIntentId: v.paymentIntentId ?? null,
            failureReason: v.failureReason ?? null, note: v.note ?? null,
            freeCancelUntilAt: v.freeCancelUntilAt ?? null,
            createdAt: v.createdAt?.toMillis?.() ?? null,
          };
        });
        res.status(200).json({ ok: true, isRoot, items });
        return;
      }

      if (req.method === "POST") {
        const { action, bookingId, memo, amount } = (req.body ?? {}) as Record<string, unknown>;
        const idStr = typeof bookingId === "string" ? bookingId : "";
        if (!idStr) { res.status(400).json({ ok: false, error: "invalid_input" }); return; }
        const ref = db.collection("bookings").doc(idStr);
        const snap = await ref.get();
        const v = snap.data();
        if (!v) { res.status(404).json({ ok: false, error: "not_found" }); return; }

        // 対応メモ（台帳メンバー可）
        if (action === "memo") {
          await ref.update({ adminMemo: typeof memo === "string" ? memo.slice(0, 2000) : "", updatedAt: FieldValue.serverTimestamp() });
          await db.collection("audit_logs").add({ actor: email, action: "booking_memo", target: idStr, at: FieldValue.serverTimestamp() });
          res.status(200).json({ ok: true });
          return;
        }

        // 返金（rootオーナーのみ・v4 §8-5）
        if (action === "refund") {
          if (!isRoot) { res.status(403).json({ ok: false, error: "owner_only" }); return; }
          if (!v.paymentIntentId) { res.status(400).json({ ok: false, error: "no_payment" }); return; }
          const amt = Number(amount);
          const refundAmount = Number.isInteger(amt) && amt > 0 && amt <= v.total ? amt : v.total;
          const stripe = stripeClient();
          const pi = await stripe.paymentIntents.retrieve(String(v.paymentIntentId));
          if (pi.status === "requires_capture") {
            await stripe.paymentIntents.cancel(pi.id); // オーソリのみ＝解放
          } else {
            await stripe.refunds.create({ payment_intent: pi.id, amount: refundAmount });
          }
          // Beds24 側の予約も取り消す（失敗しても返金は成立させ、要対応として通知する）
          let beds24CancelError = "";
          if (v.beds24Id) {
            try {
              await cancelBeds24Booking(Number(v.beds24Id));
            } catch (e) {
              beds24CancelError = String(e).slice(0, 160);
              await notifyError(
                `[要対応] 返金は完了しましたが、Beds24 の予約を取り消せませんでした。手動で取り消してください。\n` +
                `予約ID: ${idStr}／Beds24予約ID: ${v.beds24Id}／${beds24CancelError}`,
              );
            }
          }

          // 押さえていた宿泊日を解放する（これを忘れるとその日程が永久に売れなくなる）
          await releaseInventoryLocks(String(v.prop), String(v.checkin), String(v.checkout), idStr);

          const cur = (await ref.get()).data() as { status: string; stateVersion: number };
          await transition(ref, { status: [cur.status], stateVersion: cur.stateVersion },
            { status: "CANCELLED", refundedAmount: refundAmount, refundedBy: email,
              beds24CancelError: beds24CancelError || null, cancelledAt: FieldValue.serverTimestamp() });
          await db.collection("audit_logs").add({
            actor: email, action: "booking_refund", target: idStr,
            amount: refundAmount, paymentIntentId: v.paymentIntentId,
            beds24Id: v.beds24Id ?? null, beds24CancelError: beds24CancelError || null,
            at: FieldValue.serverTimestamp(),
          });

          // 管理側の返金でもお客様へキャンセル確認メールを送る
          // （セルフキャンセルと同じ体裁。運営が処理したのに何の連絡も無い状態を作らない）
          await sendCancellationMail(idStr, v as BookingDoc & Record<string, unknown>, refundAmount);
          res.status(200).json({ ok: true, refunded: refundAmount, beds24Cancelled: !beds24CancelError });
          return;
        }

        res.status(400).json({ ok: false, error: "invalid_action" });
        return;
      }

      res.status(405).json({ ok: false, error: "method_not_allowed" });
    } catch (err) {
      logger.error("adminBookings failed", err);
      res.status(500).json({ ok: false, error: "internal" });
    }
  }
);


// ─── 物件ファクトSSoT API（/admin/properties・v4 §8-4） ───
// 保存後はサイト再ビルドが必要（ページはビルド時にFirestoreを読み、HTMLに焼き込むため）。
const FACT_FIELDS = ["capacity", "bedrooms", "bedDouble", "bedSingle", "bath", "shower", "sink", "toilet",
  "washer", "dryer", "audio", "tvInch", "studyDesk", "parking", "theater",
  "fromAirportCarMin", "fromStationWalkMin", "toTenjinWalkMin", "toHakataWalkMin",
  "spotMarketMin", "spotMarketM", "spotSumiyoshiMin", "spotSumiyoshiM",
  "spotCanalMin", "spotCanalM", "spotNakasuWalkMin", "spotNakasuTaxiMin",
  "spotOhoriCarMin", "spotOhoriM"] as const;

export const adminProperties = onRequest(
  { region: REGION, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const email = await verifyAdmin(req as { headers: Record<string, unknown> });
    if (!email) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
    // 物件ファクトは表示の正本のため、編集・閲覧ともrootオーナー限定（2026-08-08 発注者指示）
    if (!PARTNERS_ADMIN_EMAILS.includes(email)) { res.status(403).json({ ok: false, error: "owner_only" }); return; }

    try {
      if (req.method === "GET") {
        const snap = await db.collection("property_facts").get();
        const items: Record<string, unknown> = {};
        snap.forEach((d) => { items[d.id] = d.data(); });
        res.status(200).json({ ok: true, items });
        return;
      }

      if (req.method === "POST") {
        const { prop, values, ratingAsOf } = (req.body ?? {}) as Record<string, unknown>;

        // 取得日のみの更新
        if (typeof ratingAsOf === "string" && !prop) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(ratingAsOf)) { res.status(400).json({ ok: false, error: "invalid_date" }); return; }
          await db.collection("property_facts").doc("meta").set({ ratingAsOf, updatedAt: FieldValue.serverTimestamp(), updatedBy: email }, { merge: true });
          await db.collection("audit_logs").add({ actor: email, action: "facts_rating_as_of", value: ratingAsOf, at: FieldValue.serverTimestamp() });
          res.status(200).json({ ok: true });
          return;
        }

        const propStr = typeof prop === "string" ? prop : "";
        if (propStr !== "kiyokawa" && propStr !== "takasago") { res.status(400).json({ ok: false, error: "invalid_prop" }); return; }
        const v = (values ?? {}) as Record<string, unknown>;

        const doc: Record<string, unknown> = {};
        for (const f of FACT_FIELDS) {
          const n = Number(v[f]);
          if (!Number.isInteger(n) || n < 0 || n > 99999) { res.status(400).json({ ok: false, error: `invalid_${f}` }); return; }
          doc[f] = n;
        }
        // 最寄り駅名（文字列）
        const ns = String(v.nearestStation ?? "").trim();
        if (ns) doc.nearestStation = ns.slice(0, 40);
        // チェックイン/アウト時刻（"16:00" 形式）
        for (const f of ["checkinTime", "checkoutTime"] as const) {
          const t = String(v[f] ?? "").trim();
          if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) { res.status(400).json({ ok: false, error: `invalid_${f}` }); return; }
          if (t) doc[f] = t;
        }
        // 評価は表示用の文字列（例 "4.77" / "47"）
        const rating = String(v.rating ?? "").trim();
        const reviewCount = String(v.reviewCount ?? "").trim();
        if (!/^\d(\.\d{1,2})?$/.test(rating) || !/^\d{1,5}$/.test(reviewCount)) {
          res.status(400).json({ ok: false, error: "invalid_rating" });
          return;
        }
        doc.rating = rating;
        doc.reviewCount = reviewCount;
        doc.updatedAt = FieldValue.serverTimestamp();
        doc.updatedBy = email;

        await db.collection("property_facts").doc(propStr).set(doc, { merge: true });
        await db.collection("audit_logs").add({ actor: email, action: "facts_update", target: propStr, at: FieldValue.serverTimestamp() });
        res.status(200).json({ ok: true });
        return;
      }

      res.status(405).json({ ok: false, error: "method_not_allowed" });
    } catch (err) {
      logger.error("adminProperties failed", err);
      res.status(500).json({ ok: false, error: "internal" });
    }
  }
);


// ─── 再ビルド発火（/admin/properties の「サイトに反映」・v4 §8-4） ───
// 静的サイトのため、Firestoreの変更をページへ反映するにはビルドが必要。
// GitHub Actions の repository_dispatch を叩き、deploy.yml が本番へデプロイする。
export const adminRebuild = onRequest(
  { region: REGION, secrets: [GITHUB_DISPATCH_TOKEN], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }

    const email = await verifyAdmin(req as { headers: Record<string, unknown> });
    if (!email) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }

    try {
      const r = await fetch("https://api.github.com/repos/kazuyoshi228/yah-homes-v2/dispatches", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_DISPATCH_TOKEN.value()}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_type: "rebuild", client_payload: { by: email } }),
      });
      if (!r.ok) throw new Error(`github ${r.status}`);
      await db.collection("audit_logs").add({ actor: email, action: "site_rebuild", at: FieldValue.serverTimestamp() });
      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error("adminRebuild failed", err);
      res.status(500).json({ ok: false, error: "dispatch_failed" });
    }
  }
);


// ─── 問い合わせ台帳API（/admin/inbox・オーナー限定） ───
// 本文に個人情報を含むため Function 経由のみ。閲覧は管理者台帳のメンバーに限る
// （運営会社が問い合わせに直接対応できるよう開放・2026-08-08 発注者判断）。
export const adminInbox = onRequest(
  { region: REGION, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    // 閲覧・対応は管理者台帳のメンバー（運営会社を含む）。個人情報を扱うためFunction経由のみ。
    const email = await verifyAdmin(req as { headers: Record<string, unknown> });
    if (!email) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }

    try {
      if (req.method === "GET") {
        const snap = await db.collection("contacts").orderBy("createdAt", "desc").limit(200).get();
        const items = snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id, name: v.name ?? "", email: v.email ?? "", message: v.message ?? "",
            lang: v.lang ?? "", status: v.status ?? "new", memo: v.memo ?? "",
            referer: v.referer ?? null,
            createdAt: v.createdAt?.toMillis?.() ?? null,
          };
        });
        res.status(200).json({ ok: true, items });
        return;
      }

      if (req.method === "POST") {
        const { id, status, memo } = (req.body ?? {}) as Record<string, unknown>;
        const idStr = typeof id === "string" ? id : "";
        if (!idStr) { res.status(400).json({ ok: false, error: "invalid_input" }); return; }
        const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: email };
        if (typeof status === "string" && ["new", "in_progress", "done"].includes(status)) update.status = status;
        if (typeof memo === "string") update.memo = memo.slice(0, 2000);
        await db.collection("contacts").doc(idStr).update(update);
        await db.collection("audit_logs").add({ actor: email, action: "contact_update", target: idStr, at: FieldValue.serverTimestamp() });
        res.status(200).json({ ok: true });
        return;
      }

      res.status(405).json({ ok: false, error: "method_not_allowed" });
    } catch (err) {
      logger.error("adminInbox failed", err);
      res.status(500).json({ ok: false, error: "internal" });
    }
  }
);

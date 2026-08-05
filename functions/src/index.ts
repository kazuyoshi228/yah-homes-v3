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
        `確認: https://console.firebase.google.com/u/0/project/yah-homes/firestore/databases/-default-/data/~2Fcontacts`,
      ].join("\n"),
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
const PROPERTY_CAPACITY: Record<string, number> = { kiyokawa: 7, takasago: 6, either: 7, both: 6 };
const PROPERTY_LABEL: Record<string, string> = { kiyokawa: "清川", takasago: "高砂", either: "どちらでも", both: "両棟はしご泊" };

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
        to: PARTNERS_NOTIFY_TO,
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
          `確認: https://console.firebase.google.com/u/0/project/yah-homes/firestore/databases/-default-/data/~2Fpartner_applications`,
        ].join("\n"),
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
      });
    } catch (err) {
      logger.error("partners auto-reply failed", err);
    }

    res.status(200).json({ ok: true });
  }
);

// ─── Beds24 空き状況API（design_partners_page.md §7 / P1 §7-1 前倒し） ───
// 読み取り専用。refresh token は Secret（M2で保存）。propId/roomId は初回に /properties から自動発見してキャッシュ。
const BEDS24_REFRESH_TOKEN_KIYOKAWA = defineSecret("BEDS24_REFRESH_TOKEN_KIYOKAWA");
const BEDS24_REFRESH_TOKEN_TAKASAGO = defineSecret("BEDS24_REFRESH_TOKEN_TAKASAGO");
const BEDS24_API = "https://beds24.com/api/v2";

type AvailCache = { data: Record<string, boolean>; expires: number };
const availCache: Record<string, AvailCache> = {};
const tokenCache: Record<string, { token: string; expires: number }> = {};

async function beds24Token(slug: "kiyokawa" | "takasago"): Promise<string> {
  const cached = tokenCache[slug];
  if (cached && cached.expires > Date.now()) return cached.token;
  const refresh = slug === "kiyokawa" ? BEDS24_REFRESH_TOKEN_KIYOKAWA.value() : BEDS24_REFRESH_TOKEN_TAKASAGO.value();
  const r = await fetch(`${BEDS24_API}/authentication/token`, { headers: { refreshToken: refresh } });
  const j = (await r.json()) as { token?: string; expiresIn?: number };
  if (!j.token) throw new Error("beds24 token refresh failed");
  tokenCache[slug] = { token: j.token, expires: Date.now() + Math.max(60, (j.expiresIn ?? 86400) - 300) * 1000 };
  return j.token;
}

export const bookingApi = onRequest(
  { region: REGION, secrets: [BEDS24_REFRESH_TOKEN_KIYOKAWA, BEDS24_REFRESH_TOKEN_TAKASAGO] },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const slug = String(req.query.prop ?? "");
    if (slug !== "kiyokawa" && slug !== "takasago") {
      res.status(400).json({ ok: false, error: "invalid_prop" });
      return;
    }

    // 5分キャッシュ（表示用途に十分・Beds24負荷も抑制）
    const cached = availCache[slug];
    if (cached && cached.expires > Date.now()) {
      res.set("Cache-Control", "public, max-age=300");
      res.status(200).json({ ok: true, prop: slug, dates: cached.data, cached: true });
      return;
    }

    try {
      const token = await beds24Token(slug);
      const start = new Date();
      const end = new Date(start.getTime() + 100 * 86400000); // 表示は翌月+翌々月 → 月末まで確実に覆う
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      // 部屋在庫カレンダー（各招待コードは該当propertyスコープ。roomIdは省略して全room取得）
      const r = await fetch(
        `${BEDS24_API}/inventory/rooms/calendar?startDate=${fmt(start)}&endDate=${fmt(end)}&includeNumAvail=true`,
        { headers: { token } },
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
      res.set("Cache-Control", "public, max-age=300");
      res.status(200).json({ ok: true, prop: slug, dates });
    } catch (err) {
      logger.error("bookingApi availability failed", err);
      res.status(502).json({ ok: false, error: "upstream_failed" });
    }
  }
);

// ─── パートナー申請 管理API（/admin/partners・design_partners_page.md §4.6） ───
// 認証: Firebase Auth（Google）IDトークン検証＋許可メール限定。個人情報を扱うためFunction経由のみ。
const PARTNERS_ADMIN_EMAILS = ["kazuyoshi.yamada@bonfire.co.jp"];
const PARTNER_STATUSES = ["new", "contacted", "confirmed", "stayed", "published", "declined"];

async function verifyAdmin(req: { headers: Record<string, unknown> }): Promise<string | null> {
  const authz = String(req.headers["authorization"] ?? "");
  const m = /^Bearer (.+)$/.exec(authz);
  if (!m) return null;
  try {
    const decoded = await getAuth().verifyIdToken(m[1]);
    const email = (decoded.email ?? "").toLowerCase();
    if (decoded.email_verified && PARTNERS_ADMIN_EMAILS.includes(email)) return email;
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
const BEDS24_TOKEN = defineSecret("BEDS24_TOKEN");
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
async function ga4ClickAirbnbYesterday(): Promise<number | null> {
  try {
    const tok = await gcpAccessToken("https://www.googleapis.com/auth/analytics.readonly");
    const r: any = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "click_airbnb" } } },
      }),
    }).then((x) => x.json());
    if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 200));
    return Number(r.rows?.[0]?.metricValues?.[0]?.value ?? 0);
  } catch (err) {
    logger.warn("ga4 click_airbnb fetch failed", err);
    return null; // GA4障害でも定点本体は止めない
  }
}

export const beds24DailyObserver = onSchedule(
  { schedule: "0 8 * * *", timeZone: "Asia/Tokyo", region: REGION, secrets: [BEDS24_TOKEN, SMTP_USER, SMTP_PASS], timeoutSeconds: 300 },
  async () => {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });
    const mail = (subject: string, text: string) =>
      transporter.sendMail({ from: `"yah.homes 定点" <${SMTP_USER.value()}>`, to: PARTNERS_NOTIFY_TO, subject, text });

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
        b.status !== "black" && !/オーナー|yamada|工事|テスト/i.test(`${b.firstName ?? ""} ${b.lastName ?? ""}`);

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
          const w = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${TEITEN_SHEET_ID}/values:batchUpdate`, {
            method: "POST",
            headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
            body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
          });
          if (!w.ok) throw new Error(`sheets write ${w.status}: ${(await w.text()).slice(0, 200)}`);
          sheetNote = `シート記入OK: ${dstr}行`;
        } else sheetNote = `シートに ${dstr} 行が見つからず記入スキップ`;
      }

      const clicks = await ga4ClickAirbnbYesterday();

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
          `click_airbnb: ${clicks ?? "取得失敗（GA4）"}（前日分）`,
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

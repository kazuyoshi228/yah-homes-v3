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

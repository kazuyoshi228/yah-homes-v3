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
const BEDS24_TOKEN = defineSecret("BEDS24_TOKEN");
const BEDS24_WEBHOOK_KEY = defineSecret("BEDS24_WEBHOOK_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const GITHUB_DISPATCH_TOKEN = defineSecret("GITHUB_DISPATCH_TOKEN");
const GA4_API_SECRET = defineSecret("GA4_API_SECRET"); // read専用（bookingApi・定点観測で共用）
const BEDS24_API = "https://beds24.com/api/v2";
// 認証: read専用 long life token（BEDS24_TOKEN・定点観測と共用・2026-08-08に招待コード方式から差替）
const BOOKING_PROP_IDS: Record<string, number> = { kiyokawa: 278158, takasago: 291238 };

type AvailCache = { data: Record<string, boolean>; expires: number };
const availCache: Record<string, AvailCache> = {};

// 見積りの短時間キャッシュ（表示用のみ・15〜30秒）。予約確定時の再検証はこれを経由しない。
const quoteCache: Record<string, { data: Record<string, unknown>; expires: number }> = {};
const QUOTE_TTL_MS = 20_000;

/** 1棟ぶんの見積り。Beds24 offers を叩き、表示用に20秒だけキャッシュする。 */
async function quoteFor(
  slug: "kiyokawa" | "takasago",
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
async function calendarFor(slug: "kiyokawa" | "takasago"): Promise<{ dates: Record<string, boolean>; cached: boolean }> {
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

const ALL_PROPS: Array<"kiyokawa" | "takasago"> = ["kiyokawa", "takasago"];

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

    const all = String(req.query.props ?? "") === "all";
    const slug = String(req.query.prop ?? "");
    if (!all && slug !== "kiyokawa" && slug !== "takasago") {
      res.status(400).json({ ok: false, error: "invalid_prop" });
      return;
    }
    const props = all ? ALL_PROPS : [slug as "kiyokawa" | "takasago"];

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
      transporter.sendMail({ from: `"yah.homes 定点" <${SMTP_USER.value()}>`, to: teitenTo, subject, text });

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

      // 無料キャンセル期限 = チェックイン7日前 00:00 JST（v4 §4）
      const freeCancelUntilAt = new Date(Date.parse(`${checkin}T00:00:00+09:00`) - 7 * 86400000).toISOString();
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
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, BEDS24_TOKEN, SMTP_USER, SMTP_PASS, GA4_API_SECRET], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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

  const ok = await transition(ref, { status: ["PAYMENT_PENDING"], stateVersion: cur.stateVersion }, { status: "AUTHORIZED" });
  if (!ok) return; // 別タスクが処理済み or 状態不一致（stateVersion CAS）

  const fail = async (reason: string, status: string) => {
    await stripe.paymentIntents.cancel(pi.id).catch(() => undefined); // オーソリ解放
    const c = (await ref.get()).data() as BookingDoc;
    await transition(ref, { status: [c.status], stateVersion: c.stateVersion }, { status, failureReason: reason });
    await notifyError(`予約の履行に失敗しました（${reason}）\n予約ID: ${bookingId}\nPaymentIntent: ${pi.id}`);
  };

  try {
    // 確定直前の再在庫確認（v4 §8-1）
    const q = await fetch(
      `${BEDS24_API}/inventory/rooms/offers?propertyId=${BOOKING_PROP_IDS[cur.prop]}&arrival=${cur.checkin}&departure=${cur.checkout}&numAdults=${cur.guests}`,
      { headers: { token: BEDS24_TOKEN.value() } },
    ).then((r) => r.json() as Promise<{ data?: Array<{ offers?: Array<{ price?: number; unitsAvailable?: number }> }> }>);
    const offer = q.data?.[0]?.offers?.[0];
    if (!offer || (offer.unitsAvailable ?? 0) < 1) { await fail("在庫が埋まりました", "VOIDED"); return; }
    if (offer.price !== cur.total) { await fail(`料金が変動しました（${cur.total}→${offer.price}）`, "VOIDED"); return; }

    // TODO(MS3.9): Beds24 への書き込み（POST /bookings）。書込トークン発行後に有効化する。
    // 現段階は検証用物件が未作成のため書込を行わず、CONFIRMED まで進めない。
    await notifyError(
      `[要対応] オーソリ済みですが Beds24 書込は未実装のため保留中です。\n` +
      `予約ID: ${bookingId}／PaymentIntent: ${pi.id}／${cur.prop} ${cur.checkin}〜${cur.checkout} ${cur.guests}名 ¥${cur.total}`,
    );
    const c2 = (await ref.get()).data() as BookingDoc & Record<string, unknown>;
    await transition(ref, { status: ["AUTHORIZED"], stateVersion: c2.stateVersion }, { status: "MANUAL_REVIEW", note: "beds24_write_pending" });
    // Beds24書込が有効になったら、この位置を CONFIRMED 遷移に置き換え、下の purchase を確定後に送る
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
    });
  } catch (err) {
    logger.error("notifyError failed", err);
  }
}


// ─── MS3.5: My Page API（自分の予約一覧・到着予定時刻の追記・v4 §6） ───
export const accountApi = onRequest(
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

    const authz = String(req.headers["authorization"] ?? "");
    const m = /^Bearer (.+)$/.exec(authz);
    if (!m) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
    let uid = "";
    try {
      uid = (await getAuth().verifyIdToken(m[1])).uid;
    } catch { res.status(401).json({ ok: false, error: "unauthorized" }); return; }

    try {
      if (req.method === "GET") {
        // 本人のUIDの予約のみ（v4 §8-4）
        const snap = await db.collection("bookings").where("uid", "==", uid).orderBy("checkin", "desc").limit(50).get();
        const items = snap.docs.map((d) => {
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
        const { action, bookingId, arrival } = (req.body ?? {}) as Record<string, unknown>;
        const idStr = typeof bookingId === "string" ? bookingId : "";
        if (action !== "arrival" || !idStr) { res.status(400).json({ ok: false, error: "invalid_input" }); return; }
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
  { region: REGION, secrets: [STRIPE_SECRET_KEY], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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
          const cur = (await ref.get()).data() as { status: string; stateVersion: number };
          await transition(ref, { status: [cur.status], stateVersion: cur.stateVersion },
            { status: "CANCELLED", refundedAmount: refundAmount, refundedBy: email });
          await db.collection("audit_logs").add({
            actor: email, action: "booking_refund", target: idStr,
            amount: refundAmount, paymentIntentId: v.paymentIntentId, at: FieldValue.serverTimestamp(),
          });
          res.status(200).json({ ok: true, refunded: refundAmount });
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
const FACT_FIELDS = ["capacity", "bedrooms", "bedDouble", "bedSingle", "bath", "shower", "sink", "toilet"] as const;

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
          if (!Number.isInteger(n) || n < 0 || n > 99) { res.status(400).json({ ok: false, error: `invalid_${f}` }); return; }
          doc[f] = n;
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
// 本文に個人情報を含むため、閲覧・操作は root オーナーのみに限定する（2026-08-08 発注者指示）。
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

    const email = await verifyAdmin(req as { headers: Record<string, unknown> });
    if (!email) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
    if (!PARTNERS_ADMIN_EMAILS.includes(email)) { res.status(403).json({ ok: false, error: "owner_only" }); return; }

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

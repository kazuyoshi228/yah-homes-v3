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
import { createHmac, createHash } from "node:crypto";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import nodemailer from "nodemailer";

initializeApp();
const db = getFirestore();

const GCP_PROJECT = "yah-homes";
const REGION = "asia-northeast1";

/* 同時起動数の上限。暴走・連打時に課金と下流API（Beds24・Stripe・SMTP）の消費へ
   天井を作るための保険。2棟・1日数十予約の規模には十分に大きい。
   引き上げるのは「本物の客が429で弾かれた」実測が出てからにする。 */
const MAX_INSTANCES = 10;

/* 素朴なレート制限。インスタンスのメモリに持つので厳密ではないが、
   maxInstances と組み合わせると全体の上限が決まる（10インスタンス × 下記の上限）。
   目的は連打で Beds24 の API 枠を食い潰させないこと。ログインの要る画面には掛けない。 */
const rateBuckets = new Map<string, number[]>();
function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  rateBuckets.set(key, hits);
  if (rateBuckets.size > 5000) rateBuckets.clear();   // メモリの上限（雑に捨てる）
  return hits.length > max;
}
/** 呼び出し元のIP。Cloud Functions は X-Forwarded-For の先頭が実クライアント。 */
function clientIp(req: { headers: Record<string, unknown>; ip?: string }): string {
  const xf = String(req.headers["x-forwarded-for"] ?? "");
  return (xf.split(",")[0] || String(req.ip ?? "")).trim() || "unknown";
}

// メール通知用シークレット（`firebase functions:secrets:set` で登録）
// SMTP_USER: 送信元 Gmail/Workspace アドレス / SMTP_PASS: アプリパスワード /
const BEDS24_WRITE_REFRESH = defineSecret("BEDS24_WRITE_REFRESH");
const INQUIRY_LINK_SECRET = defineSecret("INQUIRY_LINK_SECRET");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");

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

export const health = onRequest({ region: REGION, maxInstances: MAX_INSTANCES }, (_req, res) => {
  res.status(200).json({ status: "ok", service: "yah.homes", ts: Date.now() });
});

/* ─── 問い合わせのマジックリンク（docs/spec_inquiry_threads.md） ───
   トークン = threadId.sig.expires（base64url）。DB にはトークンの SHA-256 だけを置き、
   DB を読まれてもリンクを再構成できない。期限は最終活動から90日（送信のたび延長）。 */
const INQUIRY_TOKEN_DAYS = 90;
function signInquiry(threadId: string, expires: number): string {
  return createHmac("sha256", INQUIRY_LINK_SECRET.value())
    .update(`${threadId}.${expires}`).digest("base64url");
}
function makeInquiryToken(threadId: string): { token: string; hash: string; expiresAt: number } {
  const expiresAt = Date.now() + INQUIRY_TOKEN_DAYS * 86400000;
  const token = Buffer.from(`${threadId}.${signInquiry(threadId, expiresAt)}.${expiresAt}`).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex"), expiresAt };
}
/** 検証。threadId を返す（失敗は null）。呼び出し側で tokenHash と kind を必ず照合すること。 */
function parseInquiryToken(raw: string): { threadId: string; hash: string } | null {
  try {
    const [threadId, sig, expStr] = Buffer.from(raw, "base64url").toString().split(".");
    const expires = Number(expStr);
    if (!threadId || !sig || !Number.isFinite(expires)) return null;
    if (Date.now() > expires) return null;
    const want = signInquiry(threadId, expires);
    if (sig.length !== want.length || sig !== want) return null;
    return { threadId, hash: createHash("sha256").update(raw).digest("hex") };
  } catch { return null; }
}
const INQUIRY_URL = (lang: string, token: string) =>
  `${SITE_URL}/${lang === "en" ? "" : `${lang}/`}inquiry/?t=${token}`;

export const contact = onRequest(
  { region: REGION, maxInstances: MAX_INSTANCES, serviceAccount: "yah-homes@appspot.gserviceaccount.com",
    secrets: [SMTP_USER, SMTP_PASS, INQUIRY_LINK_SECRET, BEDS24_WRITE_REFRESH] },
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

  // 無認証でメールを飛ばせる口。スパムの連投を止める。
  if (rateLimited(`contact:${clientIp(req)}`, 5, 600000)) {
    res.set("Retry-After", "600");
    res.status(429).json({ ok: false, error: "too_many_requests" });
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
  if (!isSafeEmail(emailStr)) {
    res.status(400).json({ ok: false, error: "invalid_email" });
    return;
  }
  if (!messageStr || messageStr.length > 5000) {
    res.status(400).json({ ok: false, error: "invalid_message" });
    return;
  }

  const contactRef = await db.collection("contacts").add({
    name: nameStr,
    email: emailStr,
    message: messageStr,
    lang: langStr,
    createdAt: FieldValue.serverTimestamp(),
    userAgent: (req.headers["user-agent"] as string | undefined)?.slice(0, 500) ?? null,
    referer: (req.headers.referer as string | undefined)?.slice(0, 500) ?? null,
    status: "new",
  });

  // スレッド化（B案）。問い合わせも予約メッセージと同じ器に入れ、/admin/messages に並べる。
  // 1通目は from:"guest" のメッセージ。返信用のマジックリンクを発行して自動返信に載せる。
  let inquiryLink = "";
  try {
    const tref = db.collection("threads").doc();
    const tok = makeInquiryToken(tref.id);
    await tref.set({
      kind: "inquiry", uid: null,
      guestName: nameStr, guestEmail: emailStr, lang: langStr,
      contactId: contactRef.id, bookingId: null,
      tokenHash: tok.hash, tokenExpiresAt: tok.expiresAt,
      lastMessageAt: FieldValue.serverTimestamp(), lastFrom: "guest",
      lastBody: messageStr.slice(0, 120), lastSystem: false,
      unreadForGuest: 0, unreadForHost: 1,
      createdAt: FieldValue.serverTimestamp(),
    });
    await tref.collection("messages").add({
      from: "guest", body: messageStr, at: FieldValue.serverTimestamp(),
    });
    inquiryLink = INQUIRY_URL(langStr, tok.token);

    // Beds24 の受信箱にも載せる。失敗しても問い合わせの受付は成立させる
    // （通知メールと管理画面には既に届いており、Beds24 同期は上乗せの導線のため）
    try {
      const bid = await createBeds24Inquiry(tref.id, nameStr, emailStr, messageStr);
      if (bid) await tref.update({ beds24Id: bid });
    } catch (e) {
      logger.warn("beds24 inquiry mirror failed", { e: String(e).slice(0, 160) });
    }
  } catch (err) {
    logger.error("inquiry thread create failed", err);   // スレッド化に失敗しても受付は成立させる
  }

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
      // 宛先は台帳の notifyBookings（2通目以降・予約系の通知と同じ名簿に統一・2026-08-16 発注者決定）。
      // 台帳が空のときのフォールバック（オーナー宛）は notifyRecipients が持つ
      to: await notifyRecipients("notifyBookings"),
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
        `確認: https://yah.homes/admin/messages/`,
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
        cta: { label: "メッセージを開く", href: `${SITE_URL}/admin/messages/` },
        note: "このメールに返信すると、お客様へ直接届きます。",
      }),
    });
  } catch (err) {
    logger.error("contact mail notification failed", err);
  }

  // 送信者向け自動返信（5言語・非致命 — 通知/保存とは独立して失敗を許容）
  // 件名にユーザー入力を含めない（差し込みは本文の名前とメッセージ引用のみ）
  try {
    const { subject, text, html } = await buildContactReply(langStr, nameStr, messageStr, inquiryLink);
    await transporter.sendMail({
      from: `"yah.homes" <${SMTP_USER.value()}>`,
      to: emailStr, replyTo: SMTP_USER.value(),
      subject, text, html,
    });
  } catch (err) {
    logger.error("contact auto-reply failed", err);
  }

  res.status(200).json({ ok: true });
  }
);

/* メールアドレスの検証。ここを緩くすると、フォームが「yah.homes の名前で
   任意の相手に送れる踏み台」になる（実測でカンマ区切りが通っていた・P0-4）。
   このアドレスは to / replyTo に入るため、ヘッダを割れる文字を1つも通さない。
   ドメインの評価が落ちると、無人運営で唯一の入室手段である案内メールが
   迷惑メール判定される＝暗証番号が届かなくなる。 */
function isSafeEmail(v: string): boolean {
  if (!v || v.length > 254) return false;
  // 制御文字・改行（ヘッダ挿入）、カンマ・セミコロン（複数宛先）、山括弧（表示名の偽装）
  if (/[\x00-\x1f\x7f,;<>"'\\()\[\]]/.test(v)) return false;
  if (v.includes("..") || v.startsWith(".") || v.includes("@.")) return false;
  const m = /^([A-Za-z0-9!#$%&*+/=?^_`{|}~.-]+)@([A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+)$/.exec(v);
  if (!m) return false;
  // ドメインは丸ごとではなくラベル単位で見る（"b-.co" のような形を通さない）
  const labels = m[2].split(".");
  if (labels.some((l) => !l || l.startsWith("-") || l.endsWith("-"))) return false;
  return m[1].length <= 64;
}

const CONTACT_L10N: Record<string, Record<string, string>> = {
  ja: {
    subject: "【yah.homes】お問い合わせありがとうございます",
    heading: "お問い合わせありがとうございます",
    lead: "{name} 様、お問い合わせを承りました。24時間以内に担当よりご連絡いたします。",
    msgTitle: "いただいた内容",
    cta: "空室を見る",
    note: "お急ぎの場合は、このメールにそのままご返信ください。",
    footer: "yah.homes【Operated by AIRSTAR】",
  },
  en: {
    subject: "Thank you for contacting yah.homes",
    heading: "Thank you for contacting yah.homes",
    lead: "Dear {name}, we have received your inquiry. A member of our team will get back to you within 24 hours.",
    msgTitle: "Your message",
    cta: "See availability",
    note: "If you have any urgent questions, simply reply to this email.",
    footer: "yah.homes【Operated by AIRSTAR】",
  },
  ko: {
    subject: "[yah.homes] 문의해 주셔서 감사합니다",
    heading: "문의해 주셔서 감사합니다",
    lead: "{name} 님, 문의를 접수했습니다. 24시간 이내에 담당자가 연락드리겠습니다.",
    msgTitle: "보내주신 내용",
    cta: "빈방 보기",
    note: "급하신 경우 이 메일에 그대로 회신해 주세요.",
    footer: "yah.homes【Operated by AIRSTAR】",
  },
  zh: {
    subject: "【yah.homes】感謝您的來信",
    heading: "感謝您的來信",
    lead: "{name} 您好，我們已收到您的詢問，將於 24 小時內與您聯繫。",
    msgTitle: "您的訊息",
    cta: "查詢空房",
    note: "如有急事，請直接回覆這封郵件。",
    footer: "yah.homes【Operated by AIRSTAR】",
  },
  th: {
    subject: "[yah.homes] ขอบคุณที่ติดต่อเรา",
    heading: "ขอบคุณที่ติดต่อเรา",
    lead: "เรียนคุณ {name} เราได้รับข้อความของคุณแล้ว ทีมงานจะติดต่อกลับภายใน 24 ชั่วโมง",
    msgTitle: "ข้อความของคุณ",
    cta: "ดูห้องว่าง",
    note: "หากมีเรื่องเร่งด่วน กรุณาตอบกลับอีเมลฉบับนี้ได้เลย",
    footer: "yah.homes【Operated by AIRSTAR】",
  },
};

// ─── パートナー日程申請フォーム（/ja/partners/・design_partners_page.md §4.5-1） ───
// 通知先はページ掲載の連絡先と同一（Secretにしない公開情報）。送信元は既存SMTP_USERを流用。
const PARTNERS_NOTIFY_TO = "kazuyoshi.yamada@bonfire.co.jp";
/* 受け付ける物件キーの一覧。定員などの「値」はここに置かない（正は property_facts）。
   以前は capacity をここにも持っており、SSoT とズレうる二重管理になっていた。 */
const PROP_KEYS = ["kiyokawa", "takasago", "either", "both", "test"] as const;
/* パートナー申請フォームの人数上限。予約の定員判定とは別物（申請は仮の希望人数で、
   実際の定員判定は予約時に property_facts で行う）。安全側に振った固定値。 */
const PARTNER_MAX_GUESTS = 7;

/* 直販の予約ルール。正本は property_facts（/admin/properties で編集）。
   Firestore が読めないときも予約を止めないよう、既定値へ倒す。
   OTA経由の予約には効かない（そちらは Beds24 側の設定が効く）。 */
/* 既定は「前日23:59まで」＝運営会社（Airstar）の OTA 側の締めと同一。
   前日10:00の定期ジョブに間に合わない予約は、確定時に入室案内を即送る
   （sendReminderIfLate）ので、この時間まで開けても案内は必ず届く。 */
/* 予約ルールの正は property_facts のみ。既定値は持たない（2026-08-17 発注者判断）。
   1項目でも欠けたら null を返し、呼び出し側で予約・照会を断る。
   既定値に倒すと、管理画面の設定と実際の挙動が食い違っていても誰も気づけない。
   定員なら定員超過、無料取消日数なら返金額の食い違いに直結する。
   稀な障害時に1件諦める方が、間違った条件で1件成立させるより安い。 */
async function bookingRules(prop: string): Promise<{ capacity: number; cutoffDays: number; cutoffTime: string; maxMonths: number; freeCancelDays: number } | null> {
  try {
    const f = (await db.collection("property_facts").doc(prop === "test" ? "kiyokawa" : prop).get()).data();
    if (!f) return null;
    const cap = Number(f.capacity);
    const mon = Number(f.bookingMaxMonths);
    const days = Number(f.bookingCutoffDays);
    const cut = String(f.bookingCutoffTime ?? "");
    const fcd = Number(f.freeCancelDays);
    // 0 も有効な設定（当日まで受ける／当日まで無料）なので >= 0 で見る
    const ok = Number.isInteger(cap) && cap > 0
      && Number.isInteger(days) && days >= 0
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(cut)
      && Number.isInteger(mon) && mon > 0
      && Number.isInteger(fcd) && fcd >= 0;
    if (!ok) {
      logger.error("property_facts の予約ルールが不完全です", { prop, cap, days, cut, mon, fcd });
      return null;
    }
    return { capacity: cap, cutoffDays: days, cutoffTime: cut, maxMonths: mon, freeCancelDays: fcd };
  } catch (e) {
    logger.error("property_facts を読めませんでした", { prop, e: String(e).slice(0, 160) });
    return null;
  }
}
/** 予約を受け付けてよい日程か。理由つきで返す（画面に何が起きたか出せるように）。 */
function checkBookingWindow(
  checkin: string, guests: number, r: { capacity: number; cutoffDays: number; cutoffTime: string; maxMonths: number },
): { ok: true } | { ok: false; error: string } {
  if (guests > r.capacity) return { ok: false, error: "over_capacity" };
  // 締切 = チェックインの cutoffDays 日前の cutoffTime（JST）。過ぎた日程は受け付けない。
  // 既定は「前日18:00」。前日10:00に暗証番号を配るジョブが走るため、
  // cutoffDays を 0（当日まで受ける）にするなら、案内メールの即時送信を別途入れること。
  const cutoffAt = Date.parse(`${checkin}T${r.cutoffTime}:00+09:00`) - r.cutoffDays * 86400000;
  if (Date.now() > cutoffAt) return { ok: false, error: "too_late" };
  const limit = new Date(Date.now() + r.maxMonths * 30 * 86400000).toISOString().slice(0, 10);
  if (checkin > limit) return { ok: false, error: "too_far" };
  return { ok: true };
}
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
  { region: REGION, maxInstances: MAX_INSTANCES, secrets: [SMTP_USER, SMTP_PASS] },
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
    const propStr = typeof property === "string" && (PROP_KEYS as readonly string[]).includes(property) ? property : "";
    const date1Str = typeof date1 === "string" ? date1.trim() : "";
    const date2Str = typeof date2 === "string" ? date2.trim() : "";
    const guestsNum = Number(guests);
    const messageStr = typeof message === "string" ? message.trim().slice(0, 5000) : "";

    if (!nameStr || nameStr.length > 200) { res.status(400).json({ ok: false, error: "invalid_name" }); return; }
    if (!isSafeEmail(emailStr)) { res.status(400).json({ ok: false, error: "invalid_email" }); return; }
    if (!/^https?:\/\/\S+/.test(mediaStr) || mediaStr.length > 500) { res.status(400).json({ ok: false, error: "invalid_media_url" }); return; }
    if (!propStr) { res.status(400).json({ ok: false, error: "invalid_property" }); return; }
    if (!isMonToWed(date1Str) || !isMonToWed(date2Str)) { res.status(400).json({ ok: false, error: "invalid_date" }); return; }
    if (!Number.isInteger(guestsNum) || guestsNum < 1 || guestsNum > PARTNER_MAX_GUESTS) { res.status(400).json({ ok: false, error: "invalid_guests" }); return; }

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
          `我們已收到以下申請內容，將於24小時內與您聯繫。`,
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
          `아래 내용으로 접수되었습니다. 24시간 이내에 담당자가 연락드리겠습니다.`,
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
          `以下の内容で受け付けました。24時間以内に担当よりご連絡いたします。`,
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
            ? { h: "파트너 숙박 신청이 접수되었습니다", lead: `${nameStr} 님, 신청해 주셔서 감사합니다. 24시간 이내에 담당자가 연락드립니다.`,
                prop: "희망 숙소", d1: "1지망 체크인", d2: "2지망 체크인", g: "인원", unit: "명",
                label: PROPERTY_LABEL_KO[propStr] ?? propStr, note: "문의는 이 메일에 그대로 회신해 주세요." }
            : applyLang === "zh"
            ? { h: "已收到您的夥伴住宿申請", lead: `${nameStr} 您好，感謝您的申請。我們將於24小時內與您聯繫。`,
                prop: "希望房源", d1: "第1希望入住日", d2: "第2希望入住日", g: "人數", unit: "人",
                label: PROPERTY_LABEL_ZH[propStr] ?? propStr, note: "如有問題，請直接回覆這封郵件。" }
            : { h: "パートナー宿泊のお申し込みを受け付けました", lead: `${nameStr} 様　お申し込みありがとうございます。24時間以内に担当よりご連絡いたします。`,
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
const BEDS24_WEBHOOK_KEY = defineSecret("BEDS24_WEBHOOK_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const GITHUB_DISPATCH_TOKEN = defineSecret("GITHUB_DISPATCH_TOKEN");
const GA4_API_SECRET = defineSecret("GA4_API_SECRET"); // read専用（bookingApi・定点観測で共用）
const META_CAPI_TOKEN = defineSecret("META_CAPI_TOKEN"); // Meta Conversions API のアクセストークン
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

/** 新規予約を Beds24 の受信箱に知らせる（2026-08-16 発注者指摘）。
    予約自体は API で Beds24 に作られるが、それだけでは**受信箱に何も出ない**ため、
    受信箱を見ている運営会社は新規予約に気づけない（キャンセルだけ通知していた）。
    キャンセル通知と同じ2本立て（受信箱に出る guest ＋ 記録用の internalNote）。
    失敗しても予約確定は止めない。 */
async function noteBeds24NewBooking(beds24Id: number, text: string): Promise<void> {
  try {
    await postBeds24Note(beds24Id, "guest", `【直販システム】公式サイトから新しいご予約が入りました。\n${text}`);
    await postBeds24Note(beds24Id, "internalNote", text);
  } catch (err) {
    logger.warn("beds24 new booking note failed", { beds24Id, err: String(err).slice(0, 120) });
  }
}

/** bookings/messages への投稿（新規予約・キャンセル通知で共用） */
async function postBeds24Note(beds24Id: number, source: string, message: string): Promise<void> {
  const r = await fetch(`${BEDS24_API}/bookings/messages`, {
    method: "POST",
    headers: { token: await beds24WriteToken(), "Content-Type": "application/json" },
    body: JSON.stringify([{ bookingId: beds24Id, message: message.slice(0, 500), source }]),
  });
  const j = (await r.json()) as Array<{ success?: boolean }>;
  if (!j?.[0]?.success) logger.warn("beds24 note failed", { beds24Id, source });
}

/** キャンセルの経緯を Beds24 に残す（運営がBeds24だけ見ていても分かるように）。
    2本立てにする理由: internalNote は予約のInfoタブにしか出ず、運営会社が日常的に見ている
    メッセージ受信箱の一覧には並ばない（2026-08-15 発注者指摘・実画面で確認）。
    受信箱に出るのは guest ソースのメッセージだけなので、通知はそちらで送り、
    経緯の記録として internalNote も残す。失敗してもキャンセル処理は止めない。 */
async function noteBeds24Cancellation(beds24Id: number, text: string): Promise<void> {
  try {
    await postBeds24Note(beds24Id, "guest", `【直販システム】このご予約はキャンセルされました。\n${text}`);
    await postBeds24Note(beds24Id, "internalNote", text);
  } catch (err) {
    logger.warn("beds24 cancel note failed", { beds24Id, err: String(err).slice(0, 120) });
  }
}

/** Beds24 の予約に内部メモを残す。運営がBeds24画面（Infoタブ）で経緯を追えるようにする。
    記録の失敗でキャンセル・返金を止めない。 */
async function noteBeds24(beds24Id: number, message: string): Promise<void> {
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

type AvailCache = { data: Record<string, boolean>; prices: Record<string, number>; expires: number };
const availCache: Record<string, AvailCache> = {};

// 見積りの短時間キャッシュ（表示用のみ・15〜30秒）。予約確定時の再検証はこれを経由しない。
const quoteCache: Record<string, { data: Record<string, unknown>; expires: number }> = {};
const QUOTE_TTL_MS = 20_000;

/** 1棟ぶんの見積り。Beds24 offers を叩き、表示用に20秒だけキャッシュする。 */
/* 「なぜ取れないのか」を Beds24 のカレンダーから引く。
   これまで満室・最低泊数割れ・API障害を全部「満室」の1つに畳んでいたため、
   最低泊数で落ちたお客様は「この宿は空いていない」と誤解して離脱し、
   こちら側のログにも原因が残らなかった（最も単価の高い日程ほど起きる）。 */
async function unavailableReason(
  slug: PropSlug, checkin: string, checkout: string, nights: number,
): Promise<{ reason: string; minStay?: number }> {
  try {
    const r = await fetch(
      `${BEDS24_API}/inventory/rooms/calendar?propertyId=${BOOKING_PROP_IDS[slug]}` +
        `&startDate=${checkin}&endDate=${checkout}&includeNumAvail=true&includeMinStay=true`,
      { headers: { token: BEDS24_TOKEN.value() } },
    );
    const j = (await r.json()) as {
      success?: boolean;
      data?: Array<{ calendar?: Array<{ from: string; to: string; numAvail?: number; minStay?: number }> }>;
    };
    if (!j.success || !j.data?.length) return { reason: "unavailable" };
    // 判定は「チェックアウト当日を除く滞在日」で行う（最終日は在庫を消費しない）
    const last = new Date(Date.parse(`${checkout}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    let soldOut = false;
    let need = 0;
    for (const room of j.data) {
      for (const seg of room.calendar ?? []) {
        if (seg.to < checkin || seg.from > last) continue;
        if ((seg.numAvail ?? 0) < 1) soldOut = true;
        if (seg.from <= checkin && (seg.minStay ?? 0) > need) need = seg.minStay ?? 0;
      }
    }
    if (soldOut) return { reason: "sold_out" };
    if (need > nights) return { reason: "min_stay", minStay: need };
    return { reason: "unavailable" };
  } catch {
    return { reason: "unavailable" };   // 理由の照会に失敗しても「満室」とは言い切らない
  }
}

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
  if (!j.success && !j.data) {
    // Beds24 が落ちているときに「満室」と言わない（本物の空室を潰す）
    data = { id: slug, prop: slug, available: false, reason: "upstream_failed" };
  } else if (!offer || typeof offer.price !== "number" || (offer.unitsAvailable ?? 0) < 1) {
    const nightsQ = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000);
    const why = await unavailableReason(slug, checkin, checkout, nightsQ);
    data = { id: slug, prop: slug, available: false, reason: why.reason, ...(why.minStay ? { minStay: why.minStay } : {}) };
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
async function calendarFor(slug: PropSlug): Promise<{ dates: Record<string, boolean>; prices: Record<string, number>; cached: boolean }> {
  const cached = availCache[slug];
  if (cached && cached.expires > Date.now()) return { dates: cached.data, prices: cached.prices, cached: true };

  const start = new Date();
  const end = new Date(start.getTime() + 400 * 86400000); // 1年先まで月送りできるよう13ヶ月分を先読み
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  // 部屋在庫カレンダー（アカウントスコープのreadトークン・propertyIdで棟を指定）。
  // includePrices の price1 は Beds24 のデイリー料金＝OTAに出しているのと同じ値。
  // これをカレンダーに直接出す（Airbnb と同じ見せ方）ことで、価格の別管理を作らない。
  const r = await fetch(
    `${BEDS24_API}/inventory/rooms/calendar?propertyId=${BOOKING_PROP_IDS[slug]}&startDate=${fmt(start)}&endDate=${fmt(end)}&includeNumAvail=true&includePrices=true`,
    { headers: { token: BEDS24_TOKEN.value() } },
  );
  const j = (await r.json()) as { success?: boolean; data?: Array<{ roomId?: number; calendar?: Array<{ from: string; to: string; numAvail?: number; price1?: number }> }> };
  if (!j.success || !j.data) throw new Error("beds24 calendar fetch failed");

  // 日別: いずれかのroomでnumAvail>=1なら空き。価格は最安のroomを採用
  const dates: Record<string, boolean> = {};
  const prices: Record<string, number> = {};
  for (const room of j.data) {
    for (const seg of room.calendar ?? []) {
      const from = new Date(`${seg.from}T00:00:00Z`);
      const to = new Date(`${seg.to}T00:00:00Z`);
      for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
        const key = d.toISOString().slice(0, 10);
        const avail = (seg.numAvail ?? 0) >= 1;
        dates[key] = dates[key] || avail;
        const p1 = Number(seg.price1);
        if (Number.isFinite(p1) && p1 > 0 && (!prices[key] || p1 < prices[key])) prices[key] = p1;
      }
    }
  }
  availCache[slug] = { data: dates, prices, expires: Date.now() + 5 * 60 * 1000 };
  return { dates, prices, cached: false };
}

type PropSlug = keyof typeof BOOKING_PROP_IDS & string;
const ALL_PROPS: PropSlug[] = ["kiyokawa", "takasago"];

// 空室・見積りAPI。
//   ?props=all                                  → 2棟のカレンダーを1レスポンスで
//   ?props=all&checkin=&checkout=&guests=       → 2棟の見積りを1レスポンスで（Beds24は並列）
//   ?prop=kiyokawa[&checkin=...]                → 従来の1棟モード（代替日の照会などで使用）
// minInstances: 1 — コールドスタート（実測で+0.77秒）が p95 の主因のため常時1台を温める。
export const bookingApi = onRequest(
  { region: REGION, maxInstances: MAX_INSTANCES, secrets: [BEDS24_TOKEN], serviceAccount: "yah-homes@appspot.gserviceaccount.com", minInstances: 1 },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    // 連打で Beds24 の API 枠を食い潰させない。人が日程を選ぶ操作としては十分な余裕がある。
    if (rateLimited(`avail:${clientIp(req)}`, 60, 60000)) {
      res.set("Retry-After", "60");
      res.status(429).json({ ok: false, error: "too_many_requests" });
      return;
    }

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
      // 定員・締切・先の上限は property_facts が正（/admin/properties）。
      // ここを定数のままにすると、検索では選べるのに決済で弾かれる、が起きる。
      const rules = Object.fromEntries(await Promise.all(props.map(async (k) => [k, await bookingRules(k)] as const)));
      // 定員が取れない棟があれば照会自体を断る（推測して受けると定員超過が通るため）
      if (props.some((k) => !rules[k])) {
        logger.warn("bookingApi: property_facts を読めず照会を中止", { props });
        res.status(503).json({ ok: false, error: "facts_unavailable" });
        return;
      }
      const maxCap = Math.max(...props.map((k) => rules[k]!.capacity));
      if (!isDate(checkin) || !isDate(checkout) || checkout <= checkin ||
          !Number.isInteger(guests) || guests < 1 || guests > maxCap) {
        res.status(400).json({ ok: false, error: "invalid_quote_params" });
        return;
      }
      try {
        // 複数棟でも直列に待たない（各棟のBeds24呼び出しを並列化）
        const results = await Promise.all(
          props.map(async (k) => {
            // 受け付けられない棟はBeds24を叩かずに理由つきで返す（満室と混ぜない）
            const w = checkBookingWindow(checkin, guests, rules[k]!);
            if (!w.ok) {
              return { data: { id: k, prop: k, available: false, reason: w.error }, cached: true };
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
          properties: props.map((k, i) => ({ id: k, dates: results[i].dates, prices: results[i].prices })),
        });
      } else {
        res.status(200).json({ ok: true, prop: props[0], dates: results[0].dates, prices: results[0].prices, cached: results[0].cached });
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
    coSubject: "【yah.homes】本日 {co} チェックアウトです",
    coHeading: "本日がチェックアウトです",
    coLead: "ご滞在ありがとうございました。本日 {co} がチェックアウトのお時間です。",
    coTitle: "お帰りの前に",
    coBody: "・鍵はキーボックスへお戻しください。<br>・駐車場も {co} までにお願いします。<br>・お忘れ物、大型のゴミ（スーツケース・衣類など）の置き忘れにご注意ください。",
    coNoteTitle: "お掃除は不要です",
    coNote: "特別な清掃や片付けは必要ありません。そのままお発ちください。",
    coBye: "またお会いできる日を楽しみにしています。",
    remSubject: "【yah.homes】明日のご宿泊について",
    remHeading: "明日、お待ちしております",
    remLead: "ご到着が明日となりました。当日の流れをご確認ください。",
    remCheckin: "チェックイン", remCheckout: "チェックアウト", remGuests: "人数", remArrival: "到着予定時刻",
    remPlace: "場所", remEntry: "入室について",
    remEntryBody: "玄関のキーボックスでの受け渡しです。暗証番号は別途お送りしています。届いていない場合は My Page のメッセージからご連絡ください。",
    remCodeLabel: "暗証番号 / PIN",
    remEntryBodyCode: "玄関のキーボックスでの受け渡しです。上の暗証番号でキーボックスを開き、中の鍵でご入室ください。",
    remArrivalNote: "到着時刻に制限はありません。深夜のご到着でも問題ありません。",
    remHelp: "お困りのとき", remHelpBody: "鍵が取り出せない、場所が分からないなど、その場でお困りの際はお電話ください。",
    remManual: "入室の手順（写真つき）", remManualBody: "住所・玄関の場所・鍵の開け方・駐車場を写真でご案内しています。ご到着前にご覧ください。",
    remCta: "予約を確認する",
    footer: "yah.homes【Operated by AIRSTAR】",
    revTplTitle: "レビュー",
    revCatClean: "清潔度",
    revCatComm: "コミュニケーション",
    revCatLoc: "ロケーション",
    revCatOther: "備品・設備",
    revCommentLabel: "コメント",
    revTplHint: "下のボタンを押すと、記入用の返信メールが開きます。★の数（1〜5）を調整し、コメントを添えてそのままお送りください。このメールへの普通のご返信でも、もちろん構いません。",
    revTplAdjust: "（★を1〜5個に調整してください）",
    revMailSubject: "【レビュー】ご滞在の感想（予約 {no}）",
    revCta: "レビューを書いて返信する",
    revSubject: "【yah.homes】ご滞在はいかがでしたか",
    revHeading: "ご利用ありがとうございました",
    revLead: "先日はyah.homesにご宿泊いただきありがとうございました。お気づきの点があれば、このメールにご返信ください。良かった点も、直すべき点も、そのままお聞かせいただけると助かります。",
    revNote: "いただいたご意見は、次のお客様のために必ず反映します。実際に、大通りに面したロールスクリーンを遮光タイプに変更したのもお客様のご指摘がきっかけでした。",
    stay: "ご滞在", nights: "{n}泊",
  },
  en: {
    coSubject: "[yah.homes] Check-out is today at {co}",
    coHeading: "Check-out is today",
    coLead: "Thank you for staying with us. Check-out is today at {co}.",
    coTitle: "Before you go",
    coBody: "・Return the key to the key box.<br>・Please vacate the parking space by {co}.<br>・Please double-check you haven't left anything behind, especially larger items (suitcases, clothing).",
    coNoteTitle: "No cleaning needed",
    coNote: "No need to clean or tidy up — just head out as you are.",
    coBye: "We hope to see you again.",
    remSubject: "[yah.homes] Your stay starts tomorrow",
    remHeading: "See you tomorrow",
    remLead: "Your arrival is tomorrow. Here is what to expect on the day.",
    remCheckin: "Check-in", remCheckout: "Check-out", remGuests: "Guests", remArrival: "Estimated arrival",
    remPlace: "Location", remEntry: "Getting in",
    remEntryBody: "Self check-in with a key box at the entrance. The code has been sent separately — if you have not received it, message us from My Page.",
    remCodeLabel: "PIN",
    remEntryBodyCode: "Self check-in with a key box at the entrance. Use the PIN above to open the box, then unlock the door with the key inside.",
    remArrivalNote: "There's no cut-off time for arrival — late-night check-ins are no problem at all.",
    remHelp: "Need help?", remHelpBody: "If you cannot get the key out or you cannot find the house, please call us.",
    remManual: "Step-by-step guide (with photos)", remManualBody: "The address, the entrance, how to open the key box, and parking — all with photos. Worth a look before you arrive.",
    remCta: "View your booking",
    footer: "yah.homes【Operated by AIRSTAR】",
    revTplTitle: "Your review",
    revCatClean: "Cleanliness",
    revCatComm: "Communication",
    revCatLoc: "Location",
    revCatOther: "Amenities & facilities",
    revCommentLabel: "Comments",
    revTplHint: "The button below opens a pre-filled reply. Adjust the stars (1–5), add your comments, and just hit send. A plain reply to this email works too, of course.",
    revTplAdjust: "(adjust to 1–5 stars)",
    revMailSubject: "[Review] My stay (booking {no})",
    revCta: "Write your review",
    revSubject: "[yah.homes] How was your stay?",
    revHeading: "Thank you for staying with us",
    revLead: "Thank you for choosing yah.homes. If anything stood out — good or bad — just hit reply and let us know.",
    revNote: "We act on what we hear. The blackout roller blind facing the main street was added because a guest told us the light was too bright.",
    stay: "Your stay", nights: "{n} nights",
  },
  ko: {
    coSubject: "[yah.homes] 오늘 {co} 체크아웃입니다",
    coHeading: "오늘이 체크아웃일입니다",
    coLead: "이용해 주셔서 감사합니다. 오늘 {co}가 체크아웃 시간입니다.",
    coTitle: "나가시기 전에",
    coBody: "・열쇠는 키박스에 넣어 주세요.<br>・주차장도 {co}까지 비워 주세요.<br>・분실물이 없는지 확인해 주시고, 큰 쓰레기(캐리어·의류 등)는 두고 가지 말아 주세요.",
    coNoteTitle: "청소는 필요 없습니다",
    coNote: "따로 청소하거나 정리하실 필요는 없습니다. 그대로 나가셔도 됩니다.",
    coBye: "다시 뵐 수 있기를 기다리겠습니다.",
    remSubject: "[yah.homes] 내일 체크인 안내",
    remHeading: "내일 뵙겠습니다",
    remLead: "내일 도착 예정이시네요. 당일 안내 사항을 미리 확인해 주세요.",
    remCheckin: "체크인", remCheckout: "체크아웃", remGuests: "인원", remArrival: "도착 예정 시각",
    remPlace: "위치", remEntry: "입실 안내",
    remEntryBody: "현관 키박스를 이용한 셀프 체크인입니다. 비밀번호는 별도로 보내드렸습니다. 받지 못하셨다면 My Page 메시지로 연락해 주세요.",
    remCodeLabel: "비밀번호",
    remEntryBodyCode: "현관 키박스를 이용한 셀프 체크인입니다. 위의 비밀번호로 키박스를 열고, 안에 있는 열쇠로 입실해 주세요.",
    remArrivalNote: "도착 시간 제한은 없습니다. 늦은 밤 도착도 괜찮습니다.",
    remHelp: "곤란하실 때는", remHelpBody: "열쇠를 꺼낼 수 없거나 위치를 찾기 어려우실 때는 전화해 주세요.",
    remManual: "입실 안내 (사진 포함)", remManualBody: "주소・현관 위치・열쇠 여는 법・주차장을 사진으로 안내해 드립니다. 도착 전에 확인해 주세요.",
    remCta: "예약 확인하기",
    footer: "yah.homes【Operated by AIRSTAR】",
    revTplTitle: "리뷰",
    revCatClean: "청결도",
    revCatComm: "커뮤니케이션",
    revCatLoc: "위치",
    revCatOther: "비품·설비",
    revCommentLabel: "코멘트",
    revTplHint: "아래 버튼을 누르면 작성용 회신 메일이 열립니다. 별 개수(1~5)를 조정하고 코멘트를 적어 그대로 보내 주세요. 이 메일에 일반 회신을 주셔도 물론 괜찮습니다.",
    revTplAdjust: "(별을 1~5개로 조정해 주세요)",
    revMailSubject: "[리뷰] 숙박 후기 (예약 {no})",
    revCta: "리뷰 작성하고 회신하기",
    revSubject: "[yah.homes] 숙박은 어떠셨나요?",
    revHeading: "이용해 주셔서 감사합니다",
    revLead: "yah.homes를 이용해 주셔서 감사합니다. 좋았던 점도 아쉬웠던 점도, 이 메일에 회신해 편하게 알려주세요.",
    revNote: "보내주신 의견은 다음 고객님을 위해 반드시 반영합니다. 큰길 쪽 롤스크린을 암막 타입으로 바꾼 것도 고객님의 의견이 계기가 되었습니다.",
    stay: "숙박", nights: "{n}박",
  },
  zh: {
    coSubject: "【yah.homes】今日 {co} 退房",
    coHeading: "今天是退房日",
    coLead: "感謝您的入住。今日 {co} 為退房時間。",
    coTitle: "離開前請確認",
    coBody: "・請將鑰匙放回密碼鑰匙盒。<br>・停車位也請於 {co} 前騰出。<br>・請確認是否遺留物品或大型垃圾（行李箱、衣物等）。",
    coNoteTitle: "無需打掃",
    coNote: "不需要特別清潔或整理，直接離開即可。",
    coBye: "期待再次與您相見。",
    remSubject: "【yah.homes】明天入住提醒",
    remHeading: "明天見",
    remLead: "您的入住日就在明天，請確認當天的流程。",
    remCheckin: "入住", remCheckout: "退房", remGuests: "人數", remArrival: "預計抵達時間",
    remPlace: "位置", remEntry: "入住方式",
    remEntryBody: "以門口密碼鎖自助入住。密碼已另行寄送，若未收到請透過 My Page 訊息與我們聯繫。",
    remCodeLabel: "密碼",
    remEntryBodyCode: "透過玄關的密碼鑰匙盒自助入住。請以上方密碼打開鑰匙盒，再用裡面的鑰匙開門進入。",
    remArrivalNote: "抵達時間沒有限制，深夜抵達也沒問題。",
    remHelp: "遇到問題時", remHelpBody: "若無法取出鑰匙或找不到位置，請撥打電話與我們聯繫。",
    remManual: "入住步驟（附照片）", remManualBody: "以照片說明地址、玄關位置、開鎖方式與停車場。抵達前建議先看一下。",
    remCta: "查看預訂",
    footer: "yah.homes【Operated by AIRSTAR】",
    revTplTitle: "您的評價",
    revCatClean: "清潔度",
    revCatComm: "溝通",
    revCatLoc: "位置",
    revCatOther: "設備與備品",
    revCommentLabel: "意見",
    revTplHint: "按下方按鈕會開啟已填好格式的回覆郵件。調整星數（1～5）、寫下您的意見後直接寄出即可。直接回覆這封郵件也完全沒問題。",
    revTplAdjust: "（請將★調整為1～5個）",
    revMailSubject: "【評價】住宿心得（預訂 {no}）",
    revCta: "撰寫評價並回覆",
    revSubject: "【yah.homes】這次入住還滿意嗎",
    revHeading: "感謝您的入住",
    revLead: "感謝您選擇 yah.homes。無論是好的地方還是需要改進的地方，都歡迎直接回覆這封郵件告訴我們。",
    revNote: "您的意見我們一定會落實。面向大馬路的遮光捲簾，就是因為住客反映光線太亮才更換的。",
    stay: "住宿", nights: "{n}晚",
  },
  th: {
    coSubject: "[yah.homes] เช็คเอาท์วันนี้ เวลา {co}",
    coHeading: "วันนี้เป็นวันเช็คเอาท์",
    coLead: "ขอบคุณที่เข้าพักกับเรา เวลาเช็คเอาท์ของวันนี้คือ {co}",
    coTitle: "ก่อนออกจากที่พัก",
    coBody: "・กรุณาใส่กุญแจกลับเข้ากล่องกุญแจ<br>・กรุณานำรถออกจากที่จอดภายในเวลา {co}<br>・กรุณาตรวจสอบสิ่งของและขยะชิ้นใหญ่ (กระเป๋าเดินทาง เสื้อผ้า) ที่อาจลืมไว้",
    coNoteTitle: "ไม่ต้องทำความสะอาด",
    coNote: "ไม่จำเป็นต้องทำความสะอาดหรือเก็บกวาด ออกจากที่พักได้เลย",
    coBye: "หวังว่าจะได้พบกันอีก",
    remSubject: "[yah.homes] เข้าพักพรุ่งนี้",
    remHeading: "พบกันพรุ่งนี้",
    remLead: "วันเข้าพักของคุณคือพรุ่งนี้ กรุณาตรวจสอบรายละเอียดของวันนั้น",
    remCheckin: "เช็คอิน", remCheckout: "เช็คเอาท์", remGuests: "จำนวนผู้เข้าพัก", remArrival: "เวลาถึงโดยประมาณ",
    remPlace: "สถานที่", remEntry: "การเข้าที่พัก",
    remEntryBody: "เช็คอินด้วยตนเองผ่านกล่องกุญแจที่หน้าประตู รหัสได้ส่งแยกไปแล้ว หากยังไม่ได้รับ กรุณาติดต่อเราผ่านข้อความใน My Page",
    remCodeLabel: "รหัส",
    remEntryBodyCode: "เช็คอินด้วยตนเองผ่านกล่องกุญแจที่หน้าประตู ใช้รหัสด้านบนเปิดกล่อง แล้วใช้กุญแจด้านในเปิดประตูเข้าห้องพัก",
    remArrivalNote: "ไม่มีข้อจำกัดเรื่องเวลามาถึง มาดึกก็ไม่มีปัญหา",
    remHelp: "หากพบปัญหา", remHelpBody: "หากไม่สามารถนำกุญแจออกมาได้ หรือหาที่พักไม่พบ กรุณาโทรหาเรา",
    remManual: "ขั้นตอนการเข้าพัก (มีรูปประกอบ)", remManualBody: "อธิบายที่อยู่ ตำแหน่งประตู วิธีเปิดกล่องกุญแจ และที่จอดรถพร้อมรูปภาพ ควรดูก่อนเดินทางมาถึง",
    remCta: "ดูการจอง",
    footer: "yah.homes【Operated by AIRSTAR】",
    revTplTitle: "รีวิวของคุณ",
    revCatClean: "ความสะอาด",
    revCatComm: "การสื่อสาร",
    revCatLoc: "ทำเลที่ตั้ง",
    revCatOther: "สิ่งอำนวยความสะดวก",
    revCommentLabel: "ความคิดเห็น",
    revTplHint: "กดปุ่มด้านล่างเพื่อเปิดอีเมลตอบกลับที่เตรียมแบบฟอร์มไว้แล้ว ปรับจำนวนดาว (1–5) เขียนความคิดเห็น แล้วส่งได้เลย หรือจะตอบกลับอีเมลนี้ตามปกติก็ได้เช่นกัน",
    revTplAdjust: "(ปรับดาวเป็น 1–5 ดวง)",
    revMailSubject: "[รีวิว] การเข้าพัก (การจอง {no})",
    revCta: "เขียนรีวิวและตอบกลับ",
    revSubject: "[yah.homes] การเข้าพักเป็นอย่างไรบ้าง",
    revHeading: "ขอบคุณที่เข้าพักกับเรา",
    revLead: "ขอบคุณที่เลือก yah.homes หากมีสิ่งใดที่ประทับใจหรือควรปรับปรุง กรุณาตอบกลับอีเมลนี้และบอกเราตรง ๆ",
    revNote: "เรานำความเห็นไปปรับปรุงจริง ม่านม้วนกันแสงฝั่งถนนใหญ่ก็เปลี่ยนเพราะผู้เข้าพักบอกว่าแสงจ้าเกินไป",
    stay: "การเข้าพัก", nights: "{n} คืน",
  },
};



// ─── Beds24側キャンセルの検知（毎朝9時JST） ───
// 運営会社がBeds24上で直販予約をキャンセルしても、Firestore・Stripe・在庫ロックは
// それを知らない。返金されず部屋も塞がったままになるため、毎日照合して差分を通知する。
// 自動で返金はしない（金銭の自動実行はオーナー判断を挟む・v5 §8-1の思想）。
export const beds24CancelWatcher = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Asia/Tokyo", region: REGION,
    secrets: [BEDS24_WRITE_REFRESH, SMTP_USER, SMTP_PASS], timeoutSeconds: 300,
    serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async () => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    // これから泊まる CONFIRMED だけを見る（過去分は照合しても意味がない）
    const snap = await db.collection("bookings")
      .where("status", "==", "CONFIRMED").where("checkout", ">=", today).get();
    const targets = snap.docs.filter((d) => d.data().beds24Id);
    if (!targets.length) { logger.info("cancelWatcher: 対象なし"); return; }

    const token = await beds24WriteToken();
    const mismatched: string[] = [];
    for (const d of targets) {
      const v = d.data() as BookingDoc & Record<string, unknown>;
      try {
        const r = await fetch(`${BEDS24_API}/bookings?id=${v.beds24Id}`, { headers: { token } });
        const j = (await r.json()) as { data?: Array<{ status?: string }> };
        const st = j.data?.[0]?.status ?? "";
        // Beds24側で消えている / cancelled になっている＝こちらの CONFIRMED と食い違う
        if (!j.data?.length || st === "cancelled") {
          mismatched.push(
            `・${d.id.slice(0, 8).toUpperCase()}／${v.name}様／${v.prop}／${v.checkin}〜${v.checkout}／` +
            `¥${Number(v.total).toLocaleString("en-US")}／Beds24 ${v.beds24Id}（${st || "見つかりません"}）`,
          );
          await d.ref.set({ beds24Mismatch: true, beds24MismatchAt: FieldValue.serverTimestamp() }, { merge: true });
        }
      } catch (err) {
        logger.warn("cancelWatcher 照会失敗", { bookingId: d.id, err: String(err).slice(0, 120) });
      }
    }

    logger.info(`cancelWatcher: ${targets.length}件照合 / 不一致 ${mismatched.length}件`);
    if (!mismatched.length) return;

    const body =
      `Beds24 側でキャンセル（または削除）されているのに、yah.homes 側が「確定」のままの予約があります。\n` +
      `返金と在庫の解放が行われていません。管理画面から返金するか、Beds24側を元に戻してください。\n\n` +
      mismatched.join("\n");
    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
      });
      await transporter.sendMail({
        from: `"yah.homes 予約" <${SMTP_USER.value()}>`,
        to: await notifyRecipients("notifyBookings"),
        subject: `【要対応】Beds24とのキャンセル不一致 ${mismatched.length}件`,
        text: body,
        html: mailHtml({
          heading: "Beds24とのキャンセル不一致",
          lead: "Beds24側でキャンセルされた予約が、yah.homes側で確定のままです。返金と在庫解放が未実行です。",
          blocks: [{ title: "対象", body: mismatched.map(esc).join("<br>") }],
          cta: { label: "直販予約 管理を開く", href: `${SITE_URL}/admin/bookings/` },
          variant: "alert",
        }),
      });
    } catch (err) {
      logger.error("cancelWatcher 通知失敗", err);
    }
  }
);

// ─── 定型メールのSSoT（/admin/templates が送信文言を支配する） ───
// 設計は docs/spec_mail_templates_ssot_202608.md。
// テンプレートが持つのは「文言キーの上書き辞書」だけ。HTMLの骨格・表・ボタンの配置は
// コードが持ち続ける。編集でレイアウトが壊れないこと、テンプレートが欠けても
// 必ず送れることの2点を、この形で担保する。
export type MailKind = "confirm" | "checkin" | "checkout" | "review" | "cancel" | "contact";

/** その通・その言語のコード既定（＝テンプレート未設定時に出る文言） */
export function mailDefaults(kind: MailKind, lang: string): Record<string, string> {
  const src = kind === "confirm" ? MAIL_L10N : kind === "cancel" ? CANCEL_L10N
    : kind === "contact" ? CONTACT_L10N : LIFECYCLE_L10N;
  return { ...(src[lang] ?? src.en) };
}

/** コード既定にテンプレートを重ねる。読めない・空なら既定のまま送る。 */
async function mailStrings(kind: MailKind, lang: string): Promise<Record<string, string>> {
  const base = mailDefaults(kind, lang);
  try {
    const snap = await db.collection("mail_templates").doc(`${kind}_${lang}`).get();
    const over = (snap.data()?.strings ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(over)) {
      if (typeof v === "string" && v.trim() !== "") base[k] = v;
    }
  } catch (err) {
    // Firestoreの一時障害でメールを止めない
    logger.warn("mailStrings fallback to defaults", { kind, lang, err: String(err).slice(0, 120) });
  }
  return base;
}

/** {{var}} を展開する。未知の記号は空にしてお客様に見せない（警告は残す）。 */
/** "1 nights" のような英語の単複崩れを直す（他言語は数詞に単複がないため無影響） */
function fixPlural(s: string): string {
  return s.replace(/\b1 (nights|adults|guests)\b/g, (_m, w: string) => `1 ${w.slice(0, -1)}`);
}

function expandMailVars(L: Record<string, string>, vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(L)) {
    out[k] = v.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name: string) => {
      if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
      logger.warn("mail template unknown variable", { key: k, name });
      return "";
    });
  }
  return out;
}


// ─── メール送信ログ（/admin/mail-log） ───
// お客様宛メールを送るたびに1行記録する。「届いていない」調査の一次資料。
// 記録の失敗は握りつぶす（ログのために送信を止めない）。
function logMail(kind: string, to: string, ok: boolean, extra?: { bookingId?: string; lang?: string; subject?: string; error?: string }): void {
  db.collection("mail_logs").add({
    kind, to, ok,
    bookingId: extra?.bookingId ?? null,
    lang: extra?.lang ?? null,
    subject: (extra?.subject ?? "").slice(0, 200),
    error: (extra?.error ?? "").slice(0, 300),
    at: FieldValue.serverTimestamp(),
  }).catch(() => { /* noop */ });
}

async function buildLifecycleMail(
  kind: "reminder" | "review" | "checkout",
  bookingId: string,
  b: BookingDoc & Record<string, unknown>,
): Promise<{ subject: string; text: string; html: string }> {
  const lang = String(b.lang ?? "en");
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

  // 前日案内には暗証番号を直接載せる（/admin/secrets が正）。読めない場合はカードを出さず、
  // 「別途お送りしています／ご返信ください」の予備文面に切り替える。
  let keybox = "";
  if (kind === "reminder") {
    // プレビュー・テスト送信では本物の番号を読まない（レイアウト確認が目的であり、
    // 実値を出すと /admin/secrets の権限制限を迂回できてしまう）。
    if (String(bookingId).startsWith("PREVIEW") || String(bookingId).startsWith("TESTTEST")) {
      keybox = "0000";
    } else {
      try {
        const sec = await db.collection("property_secrets").doc(b.prop === "test" ? "kiyokawa" : String(b.prop)).get();
        keybox = String(sec.data()?.keyboxCode ?? "");
      } catch { /* カードなしで送る */ }
    }
  }

  // 内部の kind 名（reminder）と、画面・テンプレートの通名（checkin）を対応させる
  const tplKind: MailKind = kind === "reminder" ? "checkin" : kind;
  const L = expandMailVars(await mailStrings(tplKind, lang), {
    guestName: String(b.name ?? ""), bookingNo: no,
    propertyName: P.name, guests: String(b.guests ?? ""), nights: String(nights),
    checkin: String(b.checkin), checkout: String(b.checkout),
    checkinTime: ci, checkoutTime: co,
    mapUrl: P.map ?? "", manualUrl: P.manual ?? "", phone: OPERATOR_PHONE,
    myPageUrl: myPage, bookUrl: bookPath,
  });

  const html = kind === "checkout"
    ? mailHtml({
        heading: L.coHeading,
        badge: `${lang === "ja" ? "予約番号" : "Booking"}|${no}`,
        lead: L.coLead.replace("{co}", co),
        rows: [
          [L.stay, esc(P.name)],
          [L.remCheckout, `${esc(b.checkout)}　〜${esc(co)}`],
        ],
        blocks: [
          { title: L.coTitle, body: L.coBody.replace(/\{co\}/g, esc(co)) },
          { title: L.coNoteTitle, body: esc(L.coNote) },
        ],
        cta: { label: L.remCta, href: myPage }, footer: L.footer,
      })
    : kind === "reminder"
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
        codeCard: keybox ? { label: L.remCodeLabel, code: keybox } : undefined,
        blocks: [
          { title: L.remEntry, body: `${esc(keybox ? L.remEntryBodyCode : L.remEntryBody)}<br>${esc(L.remArrivalNote)}` },
          // 写真つきの手順ページ。暗証番号の数字だけでは、玄関の場所も車庫の寸法も伝わらない
          ...(P.manual ? [{ title: L.remManual, body: `${esc(L.remManualBody)}<br><a href="${esc(P.manual)}" style="color:#111111;">${esc(P.manual)}</a>` }] : []),
          // 無人運営なので、その場で詰まったときの電話を必ず載せる（案内の最後ではなく入室の直後に置く）
          { title: L.remHelp, body: `${esc(L.remHelpBody)}<br><a href="tel:+815017214419" style="color:#111111;font-weight:600;">${esc(OPERATOR_PHONE)}</a>` },
          ...(P.address || P.map
            ? [{ title: L.remPlace, body: `${P.address ? `<strong>${esc(P.address)}</strong><br>` : ""}${P.map ? `<a href="${esc(P.map)}" style="color:#111111;">${esc(P.map)}</a>` : ""}` }]
            : []),
        ],
        cta: { label: L.remCta, href: myPage }, footer: L.footer,
      })
    : (() => {
        // 返信で完結するレビュー。mailto で雛形入りの返信メールを開かせ、
        // ★の数を調整して送ってもらう（ページ遷移もログインも要らない）。
        const cats = [L.revCatClean, L.revCatComm, L.revCatLoc, L.revCatOther];
        const mailtoBody = [
          ...cats.map((c) => `${c}: ★★★★★`),
          L.revTplAdjust, "",
          `${L.revCommentLabel}:`, "", "", "",
          `${L.stay}: ${P.name} (${b.checkin} - ${b.checkout})`,
        ].join("\n");
        const mailto = `mailto:${MAIL_FROM}?subject=${encodeURIComponent(L.revMailSubject.replace("{no}", no))}&body=${encodeURIComponent(mailtoBody)}`;
        const starRow = (c: string) =>
          `<tr><td style="padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#111111;">${esc(c)}</td>
             <td style="padding:9px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-size:15px;letter-spacing:.18em;color:#d7d7d7;">★★★★★</td></tr>`;
        return mailHtml({
          heading: L.revHeading,
          badge: `${lang === "ja" ? "予約番号" : "Booking"}|${no}`,
          lead: L.revLead,
          rows: [
            [L.stay, `${esc(P.name)}`],
            [`${esc(b.checkin)} 〜 ${esc(b.checkout)}`, fixPlural(L.nights.replace("{n}", String(nights)))],
          ],
          blocks: [
            {
              title: L.revTplTitle,
              body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cats.map(starRow).join("")}
                <tr><td style="padding:9px 0;font-size:13px;color:#111111;vertical-align:top;">${esc(L.revCommentLabel)}</td>
                  <td style="padding:9px 0 0 12px;"><div style="border:1px solid #e8e8e8;border-radius:6px;min-height:56px;">&nbsp;</div></td></tr>
              </table>
              <div style="font-size:12px;color:#999999;line-height:1.8;margin-top:10px;">${esc(L.revTplHint)}</div>`,
            },
            { title: "—", body: esc(L.revNote) },
          ],
          cta: { label: L.revCta, href: mailto }, footer: L.footer,
        });
      })();

  return {
    subject: kind === "checkout" ? L.coSubject.replace("{co}", co)
      : kind === "reminder" ? L.remSubject : L.revSubject,
    text: [
      kind === "checkout" ? L.coHeading : kind === "reminder" ? L.remHeading : L.revHeading, "",
      kind === "checkout" ? L.coLead.replace("{co}", co) : kind === "reminder" ? L.remLead : L.revLead, "",
      `${P.name}`, `${b.checkin} 〜 ${b.checkout}`,
      kind === "checkout"
        ? `${L.coTitle}: ${L.coBody.replace(/<br>/g, "\n").replace(/\{co\}/g, co)}\n${L.coNote}\n${L.coBye}`
        : kind === "reminder"
        ? `${keybox ? `${L.remCodeLabel}: ${keybox}\n` : ""}${L.remEntry}: ${keybox ? L.remEntryBodyCode : L.remEntryBody}`
        : [
            `--- ${L.revTplTitle} ---`,
            ...[L.revCatClean, L.revCatComm, L.revCatLoc, L.revCatOther].map((c) => `${c}: ★★★★★`),
            L.revTplAdjust, "", `${L.revCommentLabel}:`, "", L.revNote,
          ].join("\n"), "",
      myPage, "",
      L.footer,
    ].join("\n"),
    html,
  };
}

async function sendLifecycleMail(
  kind: "reminder" | "review" | "checkout",
  bookingId: string,
  b: BookingDoc & Record<string, unknown>,
): Promise<void> {
  const { subject, text, html } = await buildLifecycleMail(kind, bookingId, b);
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  });
  try {
    await transporter.sendMail({
      from: `"yah.homes" <${SMTP_USER.value()}>`,
      to: String(b.email),
      // お客様との連絡は My Page のメッセージに集約する（2026-08-14 発注者指示）。
      // 例外はレビュー依頼だけ。あの通は mailto で★入りの返信を書かせる仕組みそのものなので、
      // no-reply にすると機能が死ぬ。/review ページの実装（docs/design_reviews_page.md・承認待ち）
      // と一緒に My Page へ寄せること。
      replyTo: kind === "review" ? SMTP_USER.value() : "no-reply@mail.yah.homes",
      subject, text, html,
    });
    logMail(kind === "reminder" ? "checkin" : kind, String(b.email), true, { bookingId, lang: String(b.lang ?? ""), subject });
    await mirrorMailToThread(bookingId, b, kind === "reminder" ? "checkin" : kind, subject, text, html);
  } catch (err) {
    logMail(kind === "reminder" ? "checkin" : kind, String(b.email), false, { bookingId, lang: String(b.lang ?? ""), subject, error: String(err) });
    throw err; // 呼び出し側の失敗処理（再送フラグを立てない）を維持する
  }
}

/** 07:00 JST: 本日チェックアウトの予約へ退室のご案内。
    10:00 JST: 明日チェックインの予約へリマインド、昨日チェックアウトの予約へフォロー。
    退室案内だけ早いのは、チェックアウトが10:00で、10時の便では間に合わないため。 */
export const guestLifecycleMailer = onSchedule(
  { schedule: "0 7,10 * * *", timeZone: "Asia/Tokyo", region: REGION,
    secrets: [SMTP_USER, SMTP_PASS], timeoutSeconds: 300,
    serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async () => {
    const jst = (offsetDays: number) =>
      new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const tomorrow = jst(1);
    const yesterday = jst(-1);

    const run = async (kind: "reminder" | "review" | "checkout", field: "checkin" | "checkout", date: string, flag: string) => {
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

    const hourJst = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false }));
    if (hourJst < 9) {
      await run("checkout", "checkout", jst(0), "checkoutSentAt");
      await db.collection("ops").doc("lifecycle").set({ lastRunAt: FieldValue.serverTimestamp() }, { merge: true })
        .catch(() => { /* noop */ });
      return;
    }
    await run("reminder", "checkin", tomorrow, "reminderSentAt");
    await run("review", "checkout", yesterday, "reviewSentAt");
    await db.collection("ops").doc("lifecycle").set({ lastRunAt: FieldValue.serverTimestamp() }, { merge: true })
      .catch(() => { /* ハートビート失敗は無視 */ });
  }
);


// ─── 定型メール／メッセージのSSoT（/admin/templates） ───
// 運営会社がBeds24・OTAで送っている定型文を1箇所に集約する。
// 閲覧・編集は管理者台帳のメンバー。差し込み記号は {{...}} で統一する。
/** 画面に並べるキーの定義。ラベルは編集者向けの日本語。ここに無いキーは編集させない
    （文言でないもの＝日付書式や単位のプレースホルダを触らせないため）。 */
const MAIL_FIELDS: Record<MailKind, { key: string; label: string; multiline?: boolean }[]> = {
  confirm: [
    { key: "subject", label: "件名" },
    { key: "lead", label: "書き出し", multiline: true },
    { key: "registerTitle", label: "宿泊者名簿・見出し" },
    { key: "registerLead", label: "宿泊者名簿・主文" },
    { key: "registerDue", label: "宿泊者名簿・期限の言い方（{d}に日付が入る）" },
    { key: "registerBtn", label: "宿泊者名簿・ボタンの文字" },
    { key: "registerBody", label: "宿泊者名簿・説明", multiline: true },
    { key: "registerWarn", label: "宿泊者名簿・未登録時の注意", multiline: true },
    { key: "cancelNote", label: "キャンセル料・注記", multiline: true },
    { key: "changeNote", label: "日程変更について", multiline: true },
    { key: "payNote", label: "お支払い・注記", multiline: true },
    { key: "cta", label: "主ボタンの文字" },
    { key: "cta2", label: "副ボタンの文字" },
    { key: "ctaNote", label: "ボタン下の注記", multiline: true },
    { key: "entryTitle", label: "入室について・見出し" },
    { key: "entryBody", label: "入室について・本文", multiline: true },
    { key: "safetyTitle", label: "お願い・見出し" },
    { key: "safetyBody", label: "お願い・本文", multiline: true },
    { key: "contactBody", label: "問い合わせ・本文", multiline: true },
    { key: "footer", label: "フッター" },
  ],
  checkin: [
    { key: "remSubject", label: "件名" },
    { key: "remHeading", label: "見出し" },
    { key: "remLead", label: "書き出し", multiline: true },
    { key: "remEntry", label: "入室について・見出し" },
    { key: "remEntryBodyCode", label: "入室について・本文（暗証番号カードの下に出る）", multiline: true },
    { key: "remEntryBody", label: "入室について・予備文面（番号が読めなかった場合）", multiline: true },
    { key: "remArrivalNote", label: "到着時刻の注記", multiline: true },
    { key: "remManual", label: "入室の手順・見出し" },
    { key: "remManualBody", label: "入室の手順・本文", multiline: true },
    { key: "remHelp", label: "お困りのとき・見出し" },
    { key: "remHelpBody", label: "お困りのとき・本文", multiline: true },
    { key: "remPlace", label: "場所・見出し" },
    { key: "remCta", label: "ボタンの文字" },
    { key: "footer", label: "フッター" },
  ],
  checkout: [
    { key: "coSubject", label: "件名（{co}に時刻が入る）" },
    { key: "coHeading", label: "見出し" },
    { key: "coLead", label: "書き出し", multiline: true },
    { key: "coTitle", label: "お帰りの前に・見出し" },
    { key: "coBody", label: "お帰りの前に・本文（改行は <br>）", multiline: true },
    { key: "coNoteTitle", label: "掃除について・見出し" },
    { key: "coNote", label: "掃除について・本文", multiline: true },
    { key: "coBye", label: "結び" },
    { key: "footer", label: "フッター" },
  ],
  cancel: [
    { key: "subject", label: "件名" },
    { key: "lead", label: "書き出し" },
    { key: "refundNote", label: "返金の説明（返金がある場合）", multiline: true },
    { key: "noRefundNote", label: "返金なしの説明（期限超過の場合）", multiline: true },
    { key: "again", label: "結び（再訪の誘い）", multiline: true },
    { key: "cta", label: "ボタンの文字" },
    { key: "contact", label: "問い合わせ文" },
    { key: "footer", label: "フッター" },
  ],
  contact: [
    { key: "subject", label: "件名" },
    { key: "heading", label: "見出し" },
    { key: "lead", label: "書き出し（{name}にお名前が入る）", multiline: true },
    { key: "msgTitle", label: "引用ブロックの見出し" },
    { key: "cta", label: "ボタンの文字" },
    { key: "note", label: "結びの注記", multiline: true },
    { key: "footer", label: "フッター" },
  ],
  review: [
    { key: "revSubject", label: "件名" },
    { key: "revHeading", label: "見出し" },
    { key: "revLead", label: "書き出し", multiline: true },
    { key: "revCatClean", label: "評価項目1" },
    { key: "revCatComm", label: "評価項目2" },
    { key: "revCatLoc", label: "評価項目3" },
    { key: "revCatOther", label: "評価項目4" },
    { key: "revCommentLabel", label: "記載欄のラベル" },
    { key: "revTplHint", label: "記入方法の説明", multiline: true },
    { key: "revNote", label: "補足", multiline: true },
    { key: "revCta", label: "ボタンの文字" },
    { key: "footer", label: "フッター" },
  ],
};
const MAIL_KINDS: MailKind[] = ["confirm", "checkin", "checkout", "review", "cancel", "contact"];
const MAIL_KIND_LABEL: Record<MailKind, string> = {
  confirm: "予約確定メッセージ", checkin: "チェックイン案内",
  checkout: "チェックアウト当日の案内", review: "レビューのお願い",
  contact: "お問い合わせ自動返信",
  cancel: "キャンセル確認",
};
/** サイドバーの区分。main=滞在の流れ4通 / other=その他定型文 */
const MAIL_KIND_GROUP: Record<MailKind, "main" | "other"> = {
  confirm: "main", checkin: "main", checkout: "main", review: "main",
  cancel: "other", contact: "other",
};
const MAIL_LANGS = ["ja", "en", "ko", "zh", "th"];
/** 本文で使える差し込み記号。保存時にこれ以外を弾く。 */
const MAIL_VARS = [
  "guestName", "bookingNo", "propertyName", "guests", "nights",
  "checkin", "checkout", "checkinTime", "checkoutTime",
  "registerUrl", "registerDeadline", "manualUrl", "mapUrl", "phone", "myPageUrl", "bookUrl",
];

export const adminTemplates = onRequest(
  { region: REGION, maxInstances: MAX_INSTANCES, serviceAccount: "yah-homes@appspot.gserviceaccount.com",
    secrets: [SMTP_USER, SMTP_PASS] },
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
    // 文面はお客様への体験に直結するため、編集はオーナーのみに限定する。
    if (await requireAdmin(email, res)) return;

    try {
      if (req.method === "GET") {
        const snap = await db.collection("mail_templates").get();
        const saved = new Map(snap.docs.map((d) => [d.id, d.data()]));
        res.status(200).json({
          ok: true,
          vars: MAIL_VARS,
          kinds: MAIL_KINDS.map((k) => ({ kind: k, label: MAIL_KIND_LABEL[k], group: MAIL_KIND_GROUP[k], fields: MAIL_FIELDS[k] })),
          langs: MAIL_LANGS,
          items: MAIL_KINDS.flatMap((kind) =>
            MAIL_LANGS.map((lang) => {
              const v = saved.get(`${kind}_${lang}`) ?? {};
              const over = (v.strings ?? {}) as Record<string, string>;
              const def = mailDefaults(kind, lang);
              return {
                id: `${kind}_${lang}`, kind, lang,
                // 既定と上書きを両方返す。画面で「どこを変えたか」を出すため。
                defaults: Object.fromEntries(MAIL_FIELDS[kind].map((f) => [f.key, def[f.key] ?? ""])),
                strings: Object.fromEntries(
                  MAIL_FIELDS[kind].map((f) => [f.key, typeof over[f.key] === "string" ? over[f.key] : ""]),
                ),
                updatedAt: v.updatedAt?.toMillis?.() ?? null, updatedBy: v.updatedBy ?? null,
              };
            }),
          ),
        });
        return;
      }

      if (req.method === "POST") {
        const { kind, lang, strings, testTo } = (req.body ?? {}) as Record<string, unknown>;
        const k = String(kind ?? "") as MailKind;
        const l = String(lang ?? "");
        if (!MAIL_KINDS.includes(k) || !MAIL_LANGS.includes(l)) {
          res.status(400).json({ ok: false, error: "invalid_target" }); return;
        }

        // テスト送信: ダミーの予約で実物を1通送る
        if (typeof testTo === "string" && testTo) {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) {
            res.status(400).json({ ok: false, error: "invalid_email" }); return;
          }
          await sendTestMail(k, l, testTo);
          res.status(200).json({ ok: true, sent: testTo });
          return;
        }

        if (typeof strings !== "object" || strings === null) {
          res.status(400).json({ ok: false, error: "invalid_input" }); return;
        }
        const allowed = new Set(MAIL_FIELDS[k].map((f) => f.key));
        // 画面には既定の文言を初期値として出す。そのまま保存されたぶんは
        // 上書きとして持たない（コード側の文言改善が伝わらなくなるため）。
        const def = mailDefaults(k, l);
        const clean: Record<string, string> = {};
        const unknownVars = new Set<string>();
        for (const [key, val] of Object.entries(strings as Record<string, unknown>)) {
          if (!allowed.has(key) || typeof val !== "string") continue;
          if (val.length > 4000) { res.status(400).json({ ok: false, error: "too_long" }); return; }
          for (const m of val.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
            if (!MAIL_VARS.includes(m[1])) unknownVars.add(m[1]);
          }
          // 空文字・既定と同一＝上書きなし。キーごと持たせない。
          if (val.trim() !== "" && val !== (def[key] ?? "")) clean[key] = val;
        }
        if (unknownVars.size) {
          res.status(400).json({ ok: false, error: "unknown_vars", vars: [...unknownVars] }); return;
        }

        await db.collection("mail_templates").doc(`${k}_${l}`).set({
          kind: k, lang: l, strings: clean,
          updatedAt: FieldValue.serverTimestamp(), updatedBy: email,
        }, { merge: false });
        await db.collection("audit_logs").add({
          actor: email, action: "mail_template_update", target: `${k}_${l}`,
          changed: Object.keys(clean).length, at: FieldValue.serverTimestamp(),
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

export const adminMailPreview = onRequest(
  { region: REGION, maxInstances: MAX_INSTANCES, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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
    // メールの実物プレビュー（読み取り専用）。OPERATOR も閲覧可（2026-08-14 発注者指示）。

    /* 実物のテスト送信。実在の予約からメールを組み立て、宛先は「操作した本人」に固定する。
       お客様には絶対に飛ばさない。送信済みフラグ（reminderSentAt 等）も立てず、
       スレッドへの控えも残さない＝本番の配信計画に一切影響しない。
       ADMIN 限定（OPERATOR はプレビューまで）。 */
    if (req.method === "POST") {
      if (await requireAdmin(email, res)) return;
      const { kind: kindRaw, bookingId } = (req.body ?? {}) as Record<string, unknown>;
      const kindStr = String(kindRaw ?? "");
      const idStr = String(bookingId ?? "");
      if (!idStr || !["confirm", "checkin", "checkout", "review", "cancel"].includes(kindStr)) {
        res.status(400).json({ ok: false, error: "invalid_target" }); return;
      }
      try {
        const snap = await db.collection("bookings").doc(idStr).get();
        if (!snap.exists) { res.status(404).json({ ok: false, error: "not_found" }); return; }
        const b = snap.data() as BookingDoc & Record<string, unknown>;
        const built = kindStr === "confirm" ? await buildConfirmationMailFor(idStr, b)
          // 返金額は実際のキャンセル処理でしか決まらないため、テストでは0で組む
          : kindStr === "cancel" ? await buildCancellationMail(idStr, b, 0)
          : await buildLifecycleMail(kindStr === "checkin" ? "reminder" : (kindStr as "review" | "checkout"), idStr, b);
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com", port: 465, secure: true,
          auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
        });
        await transporter.sendMail({
          from: `"yah.homes" <${SMTP_USER.value()}>`,
          to: email, replyTo: "no-reply@mail.yah.homes",
          subject: `[テスト送信] ${built.subject}`,
          text: built.text, html: built.html,
        });
        await db.collection("audit_logs").add({
          actor: email, action: "mail_test_send", target: `${kindStr}:${idStr}`, at: FieldValue.serverTimestamp(),
        });
        res.status(200).json({ ok: true, sentTo: email, subject: built.subject });
      } catch (err) {
        logger.error("adminMailPreview test send failed", err);
        res.status(500).json({ ok: false, error: "internal" });
      }
      return;
    }

    const kind = String(req.query.kind ?? "") as MailKind;
    const lang = String(req.query.lang ?? "ja");
    if (!MAIL_KINDS.includes(kind) || !MAIL_LANGS.includes(lang)) {
      res.status(400).json({ ok: false, error: "invalid_target" }); return;
    }
    try {
      const { subject, html } = await buildPreviewMail(kind, lang);
      res.status(200).json({ ok: true, kind, lang, subject, html });
    } catch (err) {
      logger.error("adminMailPreview failed", err);
      res.status(500).json({ ok: false, error: "internal" });
    }
  }
);

const DUMMY_INQUIRY: Record<string, string> = {
  ja: "9月の連休に4名で泊まりたいのですが、駐車場は空いていますか。",
  en: "We are 4 people looking to stay in September. Is the parking space available?",
  ko: "9월 연휴에 4명이 숙박하고 싶은데 주차 공간이 있나요?",
  zh: "我們9月連假想4人入住，請問還有停車位嗎？",
  th: "เราต้องการเข้าพัก 4 คนในเดือนกันยายน ที่จอดรถยังว่างไหมคะ",
};

/** お問い合わせ自動返信の組み立て（実送信・プレビュー・テストで共用） */
const INQUIRY_REPLY_L10N: Record<string, { title: string; body: string; cta: string }> = {
  ja: { title: "ご返信について", body: "ご返信は下のボタンからご覧いただけます。やり取りはすべて同じ画面に残ります。", cta: "返信を確認・続きを送る" },
  en: { title: "Replies", body: "You can read and continue this conversation from the button below. Everything stays in one place.", cta: "View replies & continue" },
  ko: { title: "답변 안내", body: "답변은 아래 버튼에서 확인하실 수 있습니다. 대화는 모두 같은 화면에 남습니다.", cta: "답변 확인・이어서 보내기" },
  zh: { title: "關於回覆", body: "您可以從下方按鈕查看回覆並繼續對話，所有內容都保留在同一頁面。", cta: "查看回覆並繼續" },
  th: { title: "การตอบกลับ", body: "คุณสามารถอ่านและตอบกลับต่อได้จากปุ่มด้านล่าง บทสนทนาทั้งหมดอยู่ในหน้าเดียว", cta: "ดูการตอบกลับ" },
};
async function buildContactReply(lang: string, name: string, message: string, inquiryLink = ""): Promise<{ subject: string; text: string; html: string }> {
  const CL = await mailStrings("contact", lang);
  const IR = INQUIRY_REPLY_L10N[lang] ?? INQUIRY_REPLY_L10N.en;
  return {
    subject: CL.subject,
    text: [
      CL.heading, "",
      CL.lead.replace("{name}", name), "",
      `--- ${CL.msgTitle} ---`, message, "---", "",
      ...(inquiryLink ? [IR.body, inquiryLink, ""] : []),
      CL.note, "", CL.footer,
    ].join("\n"),
    html: mailHtml({
      heading: CL.heading,
      lead: CL.lead.replace("{name}", name),
      blocks: [
        { title: CL.msgTitle, body: esc(message) },
        ...(inquiryLink ? [{ title: IR.title, body: esc(IR.body) }] : []),
      ],
      // リンクがあるときの主導線は「返信を見る」。無ければ従来どおり空室へ
      cta: inquiryLink ? { label: IR.cta, href: inquiryLink }
        : { label: CL.cta, href: `${SITE_URL}/${lang === "en" ? "" : `${lang}/`}book/` },
      note: CL.note,
      footer: CL.footer,
    }),
  };
}

/** プレビュー・テスト送信で使う仮の予約。実データに触れずに実物の見た目を出すため。 */
const DUMMY_NAME: Record<string, string> = {
  ja: "山田 太郎", en: "Taro Yamada", ko: "야마다 타로", zh: "山田 太郎", th: "ทาโร่ ยามาดะ",
};
function dummyBooking(lang: string, to = "guest@example.com"): BookingDoc & Record<string, unknown> {
  const d = (n: number) => new Date(Date.now() + n * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  return {
    name: DUMMY_NAME[lang] ?? DUMMY_NAME.en,
    email: to, lang, prop: "kiyokawa",
    checkin: d(7), checkout: d(9), guests: 4, total: 62000,
    arrival: "", status: "CONFIRMED",
    freeCancelUntilAt: new Date(Date.now() + 5 * 86400000).toISOString(),
  } as unknown as BookingDoc & Record<string, unknown>;
}

/** 仮の予約でメールを組み立てて返す（送信はしない）。/admin/mail-preview 用。 */
async function buildPreviewMail(kind: MailKind, lang: string): Promise<{ subject: string; html: string }> {
  const b = dummyBooking(lang);
  if (kind === "confirm") return buildConfirmationMailFor("PREVIEW0-0000", b);
  if (kind === "cancel") return buildCancellationMail("PREVIEW0-0000", b, Number(b.total)); // 全額返金の例
  if (kind === "contact") return buildContactReply(lang, String(b.name), DUMMY_INQUIRY[lang] ?? DUMMY_INQUIRY.en);
  const { subject, html } = await buildLifecycleMail(kind === "checkin" ? "reminder" : kind, "PREVIEW0-0000", b);
  return { subject, html };
}

/** テスト送信。ダミーの予約データで実際の送信経路をそのまま通す。 */
async function sendTestMail(kind: MailKind, lang: string, to: string): Promise<void> {
  const dummy = dummyBooking(lang, to);
  if (kind === "confirm") { await sendConfirmationMail("TESTTEST-0000", dummy); return; }
  if (kind === "cancel") { await sendCancellationMail("TESTTEST-0000", dummy, Number(dummy.total)); return; }
  if (kind === "contact") {
    const { subject, text, html } = await buildContactReply(lang, String(dummy.name), DUMMY_INQUIRY[lang] ?? DUMMY_INQUIRY.en);
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });
    await transporter.sendMail({ from: `"yah.homes" <${SMTP_USER.value()}>`, to, replyTo: SMTP_USER.value(), subject, text, html });
    return;
  }
  await sendLifecycleMail(kind === "checkin" ? "reminder" : kind, "TESTTEST-0000", dummy);
}





// ─── 運用ビューAPI（/admin/mail-log・/admin/audit・/admin/health が読む） ───
export const adminOps = onRequest(
  { region: REGION, maxInstances: MAX_INSTANCES, serviceAccount: "yah-homes@appspot.gserviceaccount.com",
    secrets: [BEDS24_TOKEN, STRIPE_SECRET_KEY] },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Authorization");
    }
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const email = await verifyAdmin(req as { headers: Record<string, unknown> });
    if (!email) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }

    const view = String(req.query.view ?? "");
    try {
      if (view === "me") {
        // ログイン中の本人の権限。メニューの出し分けに使う（機微情報は返さない）。
        const role = await getRole(email);
        // isAdmin は旧クライアント互換（admin 以上で true）
        res.status(200).json({ ok: true, email, role, isAdmin: !!role && ROLE_RANK[role] >= ROLE_RANK.admin });
        return;
      }
      if (view === "mail") {
        // OPERATOR も閲覧可（運営会社が「案内は届いたか」を自分で確認できるように・2026-08-14 発注者指示）。
        // 宛先メールアドレスが見える点は許容の判断。verifyAdmin が台帳メンバーであることは保証している。
        const snap = await db.collection("mail_logs").orderBy("at", "desc").limit(200).get();
        res.status(200).json({ ok: true, items: snap.docs.map((d) => ({ id: d.id, ...d.data(), at: d.data().at?.toMillis?.() ?? null })) });
        return;
      }
      if (view === "audit") {
        if (await requireAdmin(email, res)) return;
        const snap = await db.collection("audit_logs").orderBy("at", "desc").limit(200).get();
        res.status(200).json({ ok: true, items: snap.docs.map((d) => ({ id: d.id, ...d.data(), at: d.data().at?.toMillis?.() ?? null })) });
        return;
      }
      if (view === "health") {
        if (await requireAdmin(email, res)) return;
        const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

        // Beds24 読み取りトークン
        try {
          const r = await fetch("https://api.beds24.com/v2/authentication/details", { headers: { token: BEDS24_TOKEN.value() } });
          const j = (await r.json()) as { validToken?: boolean };
          checks.push({ name: "Beds24 トークン", ok: j.validToken === true, detail: j.validToken ? "有効" : "無効・要再発行" });
        } catch (e) { checks.push({ name: "Beds24 トークン", ok: false, detail: `照会失敗 ${String(e).slice(0, 80)}` }); }

        // Stripe モード
        const sk = STRIPE_SECRET_KEY.value();
        checks.push({ name: "Stripe", ok: true, detail: sk.startsWith("sk_live_") ? "本番モード" : "テストモード（公開前に本番キーへ）" });

        // 自動メール便（cron）の最終実行
        try {
          const hb = (await db.collection("ops").doc("lifecycle").get()).data();
          const last = hb?.lastRunAt?.toMillis?.() ?? 0;
          const hours = last ? (Date.now() - last) / 3600000 : Infinity;
          checks.push({ name: "自動メール便（7時・10時）", ok: hours < 26, detail: last ? `最終実行 ${new Date(last).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}` : "実行記録なし（次回実行で記録開始）" });
        } catch { checks.push({ name: "自動メール便（7時・10時）", ok: false, detail: "照会失敗" }); }

        // 直近24時間のメール送信失敗
        try {
          const since = new Date(Date.now() - 24 * 3600000);
          const snap = await db.collection("mail_logs").where("at", ">", since).get();
          const fail = snap.docs.filter((d) => d.data().ok === false).length;
          checks.push({ name: "メール送信（24時間）", ok: fail === 0, detail: `${snap.size}件送信・失敗${fail}件` });
        } catch { checks.push({ name: "メール送信（24時間）", ok: false, detail: "照会失敗" }); }

        // 要対応の予約
        try {
          const snap = await db.collection("bookings").where("status", "in", ["PENDING", "MANUAL_REVIEW", "CANCELLING"]).get();
          checks.push({ name: "要対応の予約", ok: snap.size === 0, detail: snap.size ? `${snap.size}件（直販予約管理へ）` : "なし" });
        } catch { checks.push({ name: "要対応の予約", ok: false, detail: "照会失敗" }); }

        res.status(200).json({ ok: true, checks });
        return;
      }
      res.status(400).json({ ok: false, error: "invalid_view" });
    } catch (err) {
      logger.error("adminOps failed", err);
      res.status(500).json({ ok: false, error: "internal" });
    }
  }
);


// ─── メッセージ（Airbnb同等・予約ごとのスレッド） ───
// 仕様: docs/spec_admin_messages.md
// 読み取りはクライアントが Firestore を直接購読する（リアルタイム・ルールで保護）。
// 書き込みは必ずこのAPIを通す（文字数・連投制限・通知・Beds24複製・翻訳をサーバで強制）。

const MSG_MAX = 2000;          // 1通の上限
const MSG_RATE_WINDOW = 60000; // 1分あたり
const MSG_RATE_MAX = 5;

/** 予約からスレッドを作る（無ければ）。予約確定時とメッセージ送信時に呼ぶ。 */
async function ensureThread(bookingId: string, b: BookingDoc & Record<string, unknown>): Promise<void> {
  const ref = db.collection("threads").doc(bookingId);
  if ((await ref.get()).exists) return;
  await ref.set({
    uid: String(b.uid ?? ""), prop: String(b.prop ?? ""),
    guestName: String(b.name ?? ""), guestEmail: String(b.email ?? ""),
    checkin: String(b.checkin ?? ""), checkout: String(b.checkout ?? ""),
    lang: String(b.lang ?? "en"), beds24Id: b.beds24Id ?? null,
    lastMessageAt: null, lastFrom: null,
    unreadForGuest: 0, unreadForHost: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** 原文を日本語へ（運営が読むため）／日本語を相手の言語へ。失敗しても送信は止めない。 */
async function translateText(text: string, target: string): Promise<string> {
  // APIキーは持たず、Functions のサービスアカウントで直接呼ぶ（鍵の管理が不要）。
  // Cloud Translation API が未有効・権限なしでも、訳が出ないだけで送信は成立させる。
  try {
    const token = await gcpAccessToken("https://www.googleapis.com/auth/cloud-platform");
    const r = await fetch(
      `https://translation.googleapis.com/v3/projects/${GCP_PROJECT}/locations/global:translateText`,
      { method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [text.slice(0, 2000)], targetLanguageCode: target, mimeType: "text/plain" }) },
    );
    if (!r.ok) { logger.warn("translate http", { status: r.status }); return ""; }
    const j = (await r.json()) as { translations?: Array<{ translatedText?: string; detectedLanguageCode?: string }> };
    const t = j.translations?.[0];
    if (!t?.translatedText) return "";
    if ((t.detectedLanguageCode ?? "").startsWith(target.split("-")[0])) return ""; // 同じ言語なら訳は不要
    return t.translatedText;
  } catch (err) {
    logger.warn("translate failed", { err: String(err).slice(0, 120) });
    return "";
  }
}


/* ─── 問い合わせスレッドの処理（docs/spec_inquiry_threads.md §4） ─── */

/** お客様（トークン経路）。read は履歴も返す（/inquiry/ はポーリングでこれを呼ぶ）。 */
async function handleInquiryByToken(
  req: { headers: Record<string, unknown> },
  res: { status: (n: number) => { json: (b: unknown) => void } },
  action: string, rawToken: string, body: unknown,
): Promise<void> {
  if (rateLimited(`inq:${clientIp(req as { headers: Record<string, unknown>; ip?: string })}`, 30, 60000)) {
    res.status(429).json({ ok: false, error: "too_many_requests" }); return;
  }
  const parsed = parseInquiryToken(rawToken);
  if (!parsed) { res.status(410).json({ ok: false, error: "gone" }); return; }
  const tref = db.collection("threads").doc(parsed.threadId);
  const tsnap = await tref.get();
  const t = tsnap.data();
  // kind と tokenHash の両方を照合。どちらか欠けたら 410（存在も明かさない）
  // 現行と1つ前のリンクを有効とする（通知のたびに再発行するため、直前のメールのリンクも生かす）
  const hashOk = t?.tokenHash === parsed.hash || t?.prevTokenHash === parsed.hash;
  if (!tsnap.exists || t?.kind !== "inquiry" || !hashOk) {
    res.status(410).json({ ok: false, error: "gone" }); return;
  }

  if (action === "read") {
    await tref.update({ unreadForGuest: 0 });
    const ms = await tref.collection("messages").orderBy("at", "asc").limit(200).get();
    res.status(200).json({
      ok: true, guestName: t.guestName ?? "", lang: t.lang ?? "en",
      messages: ms.docs.map((d) => {
        const v = d.data();
        return { from: v.from, body: v.body, translated: v.translated ?? null,
          system: v.system === true, title: v.title ?? null, at: v.at?.toMillis?.() ?? null };
      }),
    });
    return;
  }
  if (action !== "send") { res.status(400).json({ ok: false, error: "invalid_action" }); return; }

  const text = String(body ?? "").trim();
  if (!text) { res.status(400).json({ ok: false, error: "empty" }); return; }
  if (text.length > MSG_MAX) { res.status(400).json({ ok: false, error: "too_long" }); return; }
  const since = new Date(Date.now() - MSG_RATE_WINDOW);
  const recent = await tref.collection("messages").where("from", "==", "guest").where("at", ">", since).get();
  if (recent.size >= MSG_RATE_MAX) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }

  const guestLang = String(t.lang ?? "en");
  const translated = guestLang === "ja" ? "" : await translateText(text, "ja");
  await tref.collection("messages").add({
    from: "guest", body: text, translated: translated || null, at: FieldValue.serverTimestamp(),
  });
  await tref.update({
    lastMessageAt: FieldValue.serverTimestamp(), lastFrom: "guest",
    lastBody: text.slice(0, 120), lastSystem: false,
    unreadForHost: FieldValue.increment(1),
    tokenExpiresAt: Date.now() + INQUIRY_TOKEN_DAYS * 86400000,   // 活動で延長
  });
  notifyInquiry(parsed.threadId, t as Record<string, unknown>, "guest", text, translated)
    .catch((e: unknown) => logger.warn("notifyInquiry failed", { e: String(e).slice(0, 120) }));
  mirrorInquiryToBeds24(t as Record<string, unknown>, "guest", text)
    .catch((e: unknown) => logger.warn("beds24 inquiry mirror failed", { e: String(e).slice(0, 120) }));
  res.status(200).json({ ok: true });
}

/** 運営（/admin/messages から）。Beds24 複製は無し（予約が無い）。 */
async function handleInquiryAsHost(
  res: { status: (n: number) => { json: (b: unknown) => void } },
  threadId: string, action: string, body: unknown, email: string,
): Promise<void> {
  const tref = db.collection("threads").doc(threadId);
  if (action === "read") {
    await tref.update({ unreadForHost: 0 });
    res.status(200).json({ ok: true });
    return;
  }
  if (action === "revoke") {
    // マジックリンクの無効化（誤送信・転送の非常口）。owner/admin のみ
    const role = await getRole(email);
    if (!role || ROLE_RANK[role] < ROLE_RANK.admin) { res.status(403).json({ ok: false, error: "admin_only" }); return; }
    await tref.update({ tokenHash: null, prevTokenHash: null, tokenExpiresAt: 0 });
    await db.collection("audit_logs").add({ actor: email, action: "inquiry_link_revoke", target: threadId, at: FieldValue.serverTimestamp() });
    res.status(200).json({ ok: true });
    return;
  }
  if (action !== "send") { res.status(400).json({ ok: false, error: "invalid_action" }); return; }

  const text = String(body ?? "").trim();
  if (!text) { res.status(400).json({ ok: false, error: "empty" }); return; }
  if (text.length > MSG_MAX) { res.status(400).json({ ok: false, error: "too_long" }); return; }
  const t = (await tref.get()).data() ?? {};
  const guestLang = String(t.lang ?? "en");
  const translated = guestLang === "ja" ? "" : await translateText(text, guestLang === "zh" ? "zh-TW" : guestLang);
  await tref.collection("messages").add({
    from: "host", body: text, translated: translated || null, author: email, at: FieldValue.serverTimestamp(),
  });
  await tref.update({
    lastMessageAt: FieldValue.serverTimestamp(), lastFrom: "host",
    lastBody: text.slice(0, 120), lastSystem: false,
    unreadForGuest: FieldValue.increment(1),
    tokenExpiresAt: Date.now() + INQUIRY_TOKEN_DAYS * 86400000,
  });
  notifyInquiry(threadId, t, "host", text, translated)
    .catch((e: unknown) => logger.warn("notifyInquiry failed", { e: String(e).slice(0, 120) }));
  mirrorInquiryToBeds24(t, "host", text)
    .catch((e: unknown) => logger.warn("beds24 inquiry mirror failed", { e: String(e).slice(0, 120) }));
  res.status(200).json({ ok: true });
}

/** 通知。ゲスト→運営は notifyBookings 宛、運営→ゲストはリンク付きメール。5分まとめは予約側と同じ。 */
async function notifyInquiry(
  threadId: string, t: Record<string, unknown>, from: "guest" | "host", text: string, translated: string,
): Promise<void> {
  const tref = db.collection("threads").doc(threadId);
  const key = from === "guest" ? "notifiedHostAt" : "notifiedGuestAt";
  const last = (t[key] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
  if (Date.now() - last < 5 * 60000) return;
  await tref.set({ [key]: FieldValue.serverTimestamp() }, { merge: true });

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  });
  const name = String(t.guestName ?? "");
  if (from === "guest") {
    await transporter.sendMail({
      from: `"yah.homes メッセージ" <${SMTP_USER.value()}>`,
      to: await notifyRecipients("notifyBookings"), replyTo: "no-reply@mail.yah.homes",
      subject: `【お問い合わせ】${name}様より`,
      text: [`お問い合わせに新しいメッセージが届きました。`, "", text,
        ...(translated ? ["", `【訳】${translated}`] : []), "",
        `返信: ${SITE_URL}/admin/messages/#${threadId}`].join("\n"),
      html: mailHtml({
        heading: "お問い合わせにメッセージが届きました",
        rows: [["お客様", esc(name)]],
        blocks: [{ title: "メッセージ", body: esc(text) + (translated ? `<br><br><span style="color:#666666;">【訳】${esc(translated)}</span>` : "") }],
        cta: { label: "返信する", href: `${SITE_URL}/admin/messages/#${threadId}` },
        note: "このメールには返信できません。返信は管理画面から行ってください。",
      }),
    });
    return;
  }
  /* 運営→ゲスト。会話に戻るリンクが無いと通知の意味が薄いので、トークンを再発行して載せる。
     旧リンクは prevTokenHash として1世代だけ生かす（直前のメールから開いても死なない）。
     revoke 済み（tokenHash=null）のスレッドには再発行しない＝無効化の意思を上書きしない。 */
  if (!t.tokenHash) return;
  const lang = String(t.lang ?? "en");
  const tok = makeInquiryToken(threadId);
  await tref.update({ prevTokenHash: t.tokenHash, tokenHash: tok.hash, tokenExpiresAt: tok.expiresAt });
  const link = INQUIRY_URL(lang, tok.token);
  const L = MSG_NOTIFY_L10N[lang] ?? MSG_NOTIFY_L10N.en;
  const IR = INQUIRY_REPLY_L10N[lang] ?? INQUIRY_REPLY_L10N.en;
  const shown = translated || text;
  await transporter.sendMail({
    from: `"yah.homes" <${SMTP_USER.value()}>`,
    to: String(t.guestEmail ?? ""), replyTo: "no-reply@mail.yah.homes",
    subject: L.subject,
    text: [L.heading, "", `--- ${L.title} ---`, shown, "", link, "", L.note].join("\n"),
    html: mailHtml({
      heading: L.heading,
      lead: L.lead,
      blocks: [{ title: L.title, body: esc(shown) }],
      cta: { label: IR.cta, href: link },
      note: L.note,
    }),
  });
}

export const messagesApi = onRequest(
  { region: REGION, maxInstances: MAX_INSTANCES, serviceAccount: "yah-homes@appspot.gserviceaccount.com",
    secrets: [SMTP_USER, SMTP_PASS, BEDS24_WRITE_REFRESH, INQUIRY_LINK_SECRET] },
  async (req, res) => {
    const origin = corsOrigin(req.headers.origin as string | undefined);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }

    const { action, bookingId, body, as, inquiryToken } = (req.body ?? {}) as Record<string, unknown>;

    /* 問い合わせスレッド（kind=inquiry）はマジックリンクのトークンで本人確認する。
       アカウントが無い予約前のお客様のための経路（docs/spec_inquiry_threads.md §4）。
       予約スレッドには一切触れない: kind と tokenHash を必ず照合する。 */
    if (typeof inquiryToken === "string" && inquiryToken) {
      await handleInquiryByToken(req, res, String(action ?? ""), inquiryToken, body);
      return;
    }

    // 認証: ゲスト（uid）か、管理者台帳のメンバーか
    const authz = String(req.headers["authorization"] ?? "");
    const m = /^Bearer (.+)$/.exec(authz);
    if (!m) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
    let uid = "", email = "";
    try {
      const decoded = await getAuth().verifyIdToken(m[1]);
      uid = decoded.uid; email = (decoded.email ?? "").toLowerCase();
    } catch { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
    const isStaff = !!email && (isAdmin(email) || !!(await getAdminUser(email)));

    const idStr = String(bookingId ?? "");
    if (!idStr) { res.status(400).json({ ok: false, error: "invalid_input" }); return; }

    /* 運営が inquiry スレッドへ返信する経路（bookings に該当ドキュメントは無い） */
    const tprobe = await db.collection("threads").doc(idStr).get();
    if (tprobe.exists && tprobe.data()?.kind === "inquiry") {
      if (!isStaff) { res.status(403).json({ ok: false, error: "forbidden" }); return; }
      await handleInquiryAsHost(res, idStr, String(action ?? ""), body, email);
      return;
    }

    try {
      const bref = db.collection("bookings").doc(idStr);
      const bsnap = await bref.get();
      if (!bsnap.exists) { res.status(404).json({ ok: false, error: "not_found" }); return; }
      const b = bsnap.data() as BookingDoc & Record<string, unknown>;

      // 所有者チェック: 自分の予約か、運営か。これ以外は一切触れない。
      const isOwnerGuest = !!b.uid && b.uid === uid;
      if (!isOwnerGuest && !isStaff) { res.status(403).json({ ok: false, error: "forbidden" }); return; }
      // 送信元は「どの画面から出したか」で決める。
      // 運営が自分名義で予約を持つ検証ケースでは両方に当てはまるため、
      // 資格だけで機械的に決めると全部 host になり、会話が片側に寄る。
      // 画面が as を申告し、サーバはその資格があるかだけを検証する。
      const asStr = as === "guest" || as === "host" ? as : null;
      const from: "guest" | "host" = asStr ?? (isStaff ? "host" : "guest");
      if (from === "guest" && !isOwnerGuest) { res.status(403).json({ ok: false, error: "forbidden" }); return; }
      if (from === "host" && !isStaff) { res.status(403).json({ ok: false, error: "forbidden" }); return; }

      await ensureThread(idStr, b);
      const tref = db.collection("threads").doc(idStr);

      if (action === "read") {
        await tref.update(from === "guest" ? { unreadForGuest: 0 } : { unreadForHost: 0 });
        res.status(200).json({ ok: true });
        return;
      }

      if (action !== "send") { res.status(400).json({ ok: false, error: "invalid_action" }); return; }
      const text = String(body ?? "").trim();
      if (!text) { res.status(400).json({ ok: false, error: "empty" }); return; }
      if (text.length > MSG_MAX) { res.status(400).json({ ok: false, error: "too_long" }); return; }

      // 連投制限（同一スレッド・同一送信者）
      const since = new Date(Date.now() - MSG_RATE_WINDOW);
      const recent = await tref.collection("messages")
        .where("from", "==", from).where("at", ">", since).get();
      if (recent.size >= MSG_RATE_MAX) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }

      const guestLang = String(b.lang ?? "en");
      // 運営が読むための日本語訳／お客様が読むための現地語訳
      const translated = from === "guest"
        ? (guestLang === "ja" ? "" : await translateText(text, "ja"))
        : (guestLang === "ja" ? "" : await translateText(text, guestLang === "zh" ? "zh-TW" : guestLang));

      const msg = await tref.collection("messages").add({
        from, body: text,
        translated: translated || null,
        author: from === "host" ? email : null,
        at: FieldValue.serverTimestamp(),
      });
      await tref.update({
        lastMessageAt: FieldValue.serverTimestamp(), lastFrom: from,
        lastBody: text.slice(0, 120), lastSystem: false,   // 人が書いたもの
        ...(from === "guest" ? { unreadForHost: FieldValue.increment(1) } : { unreadForGuest: FieldValue.increment(1) }),
      });

      // 通知と Beds24 複製は、送信の成否を左右しない
      notifyMessage(idStr, b, from, text, translated).catch((e: unknown) => logger.warn("notifyMessage failed", { e: String(e).slice(0, 120) }));
      if (b.beds24Id) {
        const label = from === "guest" ? "【直販ゲスト】" : "【yah.homes 運営】";
        noteBeds24Message(Number(b.beds24Id), from, `${label}${text}`).catch(() => { /* 複製失敗は無視 */ });
      }

      res.status(200).json({ ok: true, id: msg.id });
    } catch (err) {
      logger.error("messagesApi failed", err);
      res.status(500).json({ ok: false, error: "internal" });
    }
  }
);


/** メッセージの相手へ通知する。5分以内の連投は1通にまとめる。 */
const MSG_NOTIFY_L10N: Record<string, Record<string, string>> = {
  ja: { subject: "【yah.homes】メッセージが届いています", heading: "メッセージが届いています",
        lead: "yah.homes からご返信しました。My Page からご確認・ご返信いただけます。",
        title: "メッセージ", cta: "My Page で開く",
        note: "このメールには返信できません。ご返信は My Page からお願いいたします。" },
  en: { subject: "[yah.homes] You have a new message", heading: "You have a new message",
        lead: "We have replied to you. You can read and reply from My Page.",
        title: "Message", cta: "Open My Page",
        note: "This email cannot receive replies. Please reply from My Page." },
  ko: { subject: "[yah.homes] 새 메시지가 도착했습니다", heading: "새 메시지가 도착했습니다",
        lead: "yah.homes에서 답변드렸습니다. My Page에서 확인하고 답장하실 수 있습니다.",
        title: "메시지", cta: "My Page 열기",
        note: "이 메일에는 회신할 수 없습니다. 답장은 My Page에서 부탁드립니다." },
  zh: { subject: "【yah.homes】您有一則新訊息", heading: "您有一則新訊息",
        lead: "yah.homes 已回覆您。可於 My Page 查看並回覆。",
        title: "訊息", cta: "開啟 My Page",
        note: "本郵件無法回覆，請至 My Page 回覆。" },
  th: { subject: "[yah.homes] คุณมีข้อความใหม่", heading: "คุณมีข้อความใหม่",
        lead: "yah.homes ได้ตอบกลับคุณแล้ว สามารถอ่านและตอบกลับได้ที่ My Page",
        title: "ข้อความ", cta: "เปิด My Page",
        note: "อีเมลฉบับนี้ไม่สามารถตอบกลับได้ กรุณาตอบกลับผ่าน My Page" },
};

async function notifyMessage(
  bookingId: string, b: BookingDoc & Record<string, unknown>,
  from: "guest" | "host", text: string, translated: string,
): Promise<void> {
  const tref = db.collection("threads").doc(bookingId);
  const t = (await tref.get()).data() ?? {};
  const key = from === "guest" ? "notifiedHostAt" : "notifiedGuestAt";
  const last = t[key]?.toMillis?.() ?? 0;
  if (Date.now() - last < 5 * 60000) return; // 5分以内はまとめる（通知は出さない）
  await tref.set({ [key]: FieldValue.serverTimestamp() }, { merge: true });

  const no = bookingId.slice(0, 8).toUpperCase();
  const P = MAIL_PROP[String(b.prop)] ?? { name: String(b.prop), image: "", address: "", map: "" };
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  });

  if (from === "host") {
    // お客様へ（本文はお客様の言語の訳を優先して見せる）
    const lang = String(b.lang ?? "en");
    const L = MSG_NOTIFY_L10N[lang] ?? MSG_NOTIFY_L10N.en;
    const myPage = `${SITE_URL}/${lang === "en" ? "" : `${lang}/`}account/#messages`;
    const shown = translated || text;
    try {
      await transporter.sendMail({
        from: `"yah.homes" <${SMTP_USER.value()}>`,
        to: String(b.email), replyTo: `no-reply@mail.yah.homes`,
        subject: L.subject,
        text: [L.heading, "", L.lead, "", `--- ${L.title} ---`, shown, "", L.note, myPage].join("\n"),
        html: mailHtml({
          heading: L.heading, badge: `${lang === "ja" ? "予約番号" : "Booking"}|${no}`,
          lead: L.lead,
          rows: [[P.name, `${esc(String(b.checkin))} 〜 ${esc(String(b.checkout))}`]],
          blocks: [{ title: L.title, body: esc(shown) }],
          cta: { label: L.cta, href: myPage }, note: L.note,
        }),
      });
      logMail("message", String(b.email), true, { bookingId, lang, subject: L.subject });
    } catch (err) {
      logMail("message", String(b.email), false, { bookingId, error: String(err) });
    }
    return;
  }

  // 運営へ
  const body = translated ? `${text}\n\n【訳】${translated}` : text;
  await transporter.sendMail({
    from: `"yah.homes メッセージ" <${SMTP_USER.value()}>`,
    to: await notifyRecipients("notifyBookings"),
    replyTo: `no-reply@mail.yah.homes`,
    subject: `【メッセージ】${String(b.name ?? "")}様（${P.name} ${String(b.checkin)}〜）`,
    text: `${body}\n\n${SITE_URL}/admin/booking/?id=${bookingId}`,
    html: mailHtml({
      heading: "お客様からメッセージが届きました",
      badge: `予約番号|${no}`,
      rows: [["お客様", esc(String(b.name ?? ""))], [P.name, `${esc(String(b.checkin))} 〜 ${esc(String(b.checkout))}`]],
      blocks: [{ title: "メッセージ", body: esc(text) + (translated ? `<br><br><span style="color:#888888;">【訳】${esc(translated)}</span>` : "") }],
      cta: { label: "返信する", href: `${SITE_URL}/admin/booking/?id=${bookingId}` },
      note: "このメールには返信できません。返信は管理画面から行ってください。",
    }),
  });
}

/** Beds24 の予約へメッセージを複製する（Airbnb等と同じ受信箱に並べる） */
// ─── 問い合わせを Beds24 の受信箱に載せる（spec_inquiry_to_beds24_202608.md）───
// Beds24 のメッセージは予約IDにしか紐づかないため、問い合わせ1件につき
// status:"inquiry" の予約を1件作り、その受信箱にやり取りを流す。
// 宛先は本番サイトに出ない専用物件（346442）— 清川・高砂の在庫と受信箱を汚さない。
const INQUIRY_BEDS24 = { propertyId: 346442, roomId: 715198 };

async function createBeds24Inquiry(
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
async function mirrorInquiryToBeds24(
  t: Record<string, unknown>, from: "guest" | "host", text: string,
): Promise<void> {
  const id = Number(t.beds24Id ?? 0);
  if (!id) return;
  const label = from === "guest" ? "【お問い合わせ】" : "【yah.homes 運営】";
  await noteBeds24Message(id, "guest", `${label}${text}`);
}

async function noteBeds24Message(beds24Id: number, from: "guest" | "host", message: string): Promise<void> {
  const r = await fetch(`${BEDS24_API}/bookings/messages`, {
    method: "POST",
    headers: { token: await beds24WriteToken(), "Content-Type": "application/json" },
    body: JSON.stringify([{ bookingId: beds24Id, message: message.slice(0, 900), source: from }]),
  });
  const j = (await r.json()) as Array<{ success?: boolean }>;
  if (!j?.[0]?.success) logger.warn("beds24 message mirror not saved", { beds24Id });
}

// ─── 入室案内の暗証番号（/how-to/:prop から取得） ───
// 番号を静的HTMLへ焼き込むと、gitとビルド成果物に残り、番号を変えるたび再デプロイが要る。
// 実行時に property_secrets から読むことで、/admin/secrets の変更が即座にページへ反映される。
// 認証は掛けない（OTA経由のお客様もURLだけで開くため）。したがって守っているのは
// 「URLを知っていること」のみ＝Google Sitesと同水準。トークン化はv5 §9の未決事項。
/* 【廃止】暗証番号を返す無認証API（P0-1③・2026-08-16 発注者決定で C 案を採用）。
   番号は「メール（直販）と 予約サイトのメッセージ（OTA）」でのみ届ける。
   入室案内ページは番号を表示しなくなったため、このAPIの用途は消滅した。
   エンドポイントは 410 を返して残す（旧ページのキャッシュや古いブックマークが
   叩いても、404 で「壊れた」と誤解させないため）。次の大掃除で削除してよい。 */
export const checkinInfo = onRequest(
  { region: REGION, maxInstances: MAX_INSTANCES, cors: true },
  async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(410).json({ ok: false, error: "gone",
      note: "The PIN is delivered by email (direct bookings) or via the booking site's messages (OTA)." });
  }
);

// ─── セキュリティ鍵番号の管理（/admin/secrets） ───
// キーボックス番号は物理キーそのもの。property_facts は公開読み取りを許可しているため、
// ここには絶対に置かず、専用コレクション property_secrets に隔離する
// （Firestoreルールは既定deny。読み書きはこの関数＝Admin SDK 経由のみ）。
// 閲覧・変更はオーナーのみ（運営会社は不可）。変更は必ず audit_logs に残す。
export const adminSecrets = onRequest(
  { region: REGION, maxInstances: MAX_INSTANCES, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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
    if (await requireAdmin(email, res)) return;

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
/* 権限は2階層のみ。用語は ADMIN / OPERATOR で統一する（旧: owner / root / PARTNERS_ADMIN）。
   ADMIN    … 台帳から削除できない固定アカウント。鍵番号・文面・物件・返金・台帳編集・再デプロイ。
   OPERATOR … 管理者台帳のメンバー。予約閲覧・問い合わせ対応など日々の運用のみ。
   判定は必ず isAdmin() / requireAdmin() を通す（各APIに条件を手書きしない）。 */
const ADMIN_EMAILS = ["kazuyoshi.yamada@bonfire.co.jp"];
const PARTNERS_ADMIN_EMAILS = ADMIN_EMAILS; // 後方互換（通知宛先の既定値として参照）

/** ADMIN か（台帳の role には依存しない・固定アカウントのみ） */
function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email);
}

/* ロールは3種（2026-08-16 発注者決定）:
     owner    … 管理者台帳の管理までできる。コードの ADMIN_EMAILS は常に owner
                （台帳をどう操作しても root を締め出せない）
     admin    … 台帳「以外」の管理操作すべて（SSoT・返金・設定・テスト送信）
     operator … 閲覧・お客様対応
   台帳の role フィールドで付与する。旧データの "owner" はそのまま owner として扱う。 */
type Role = "owner" | "admin" | "operator";
async function getRole(email: string): Promise<Role | null> {
  if (isAdmin(email)) return "owner";
  const u = await getAdminUser(email);
  if (!u) return null;
  return u.role === "owner" ? "owner" : u.role === "admin" ? "admin" : "operator";
}
const ROLE_RANK: Record<Role, number> = { operator: 1, admin: 2, owner: 3 };

/** admin 以上でなければ 403 を返して true。`if (await requireAdmin(email, res)) return;` */
async function requireAdmin(email: string, res: { status: (n: number) => { json: (b: unknown) => void } }): Promise<boolean> {
  const r = await getRole(email);
  if (r && ROLE_RANK[r] >= ROLE_RANK.admin) return false;
  res.status(403).json({ ok: false, error: "admin_only" });
  return true;
}
/** owner でなければ 403。管理者台帳の変更にだけ使う。 */
function requireOwner(email: string, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (isAdmin(email)) return false;
  res.status(403).json({ ok: false, error: "owner_only" });
  return true;
}

// 管理者台帳（/admin/users）: { name, role: "owner"|"operator", notifyPartners, notifyTeiten, notifyBookings }
async function getAdminUser(email: string): Promise<{ role: string } | null> {
  const doc = await db.collection("admin_users").doc(email).get();
  return doc.exists ? (doc.data() as { role: string }) : null;
}

/** 通知宛先: root ＋ 該当フラグONの台帳メンバー（ハードコード宛先を廃止・v4 §8-5b） */
async function notifyRecipients(kind: "notifyPartners" | "notifyTeiten" | "notifyBookings"): Promise<string> {
  /* 宛先は管理者台帳（/admin/notify-emails）が正。
     以前はここに ADMIN を必ず混ぜていたため、台帳で外しても届き続けていた。
     ただし「誰にも届かない」は事故なので、台帳に該当者がいないときだけ ADMIN に倒す。 */
  const set = new Set<string>();
  try {
    const snap = await db.collection("admin_users").where(kind, "==", true).get();
    snap.forEach((d) => set.add(d.id));
  } catch (err) {
    logger.warn("notifyRecipients fallback", err);
  }
  if (set.size === 0) {
    logger.warn("notifyRecipients: no recipient in ledger, falling back to ADMIN", { kind });
    return PARTNERS_ADMIN_EMAILS.join(", ");
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
    if (isAdmin(email)) return email;
    if (await getAdminUser(email)) return email; // 台帳メンバー（operator以上）
    return null;
  } catch {
    return null;
  }
}

export const partnersAdmin = onRequest({ region: REGION, maxInstances: MAX_INSTANCES, secrets: [SMTP_USER, SMTP_PASS] }, async (req, res) => {
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
  custom1?: string;
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
    const out: Record<string, number> = { click_airbnb: 0, click_booking_com: 0, click_booking_calendar: 0, purchase: 0, total: 0 };
    for (const row of r.rows ?? []) {
      const v = Number(row.metricValues[0].value);
      out[row.dimensionValues[0].value] = v;
      out.total += v;
    }
    // 直販の分母（訪問）と売上。2026-08-16のCV定義切替以降、日次の主指標も purchase にしたため併せて取る。
    const one = (body: unknown) =>
      fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`, {
        method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then((x) => x.json());
    const s: any = await one({ dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }], metrics: [{ name: "sessions" }] });
    out.sessions = Number(s.rows?.[0]?.metricValues?.[0]?.value ?? 0);
    const p: any = await one({
      dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
      metrics: [{ name: "eventValue" }],
      dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "purchase" } } },
    });
    out.revenue = Number(p.rows?.[0]?.metricValues?.[0]?.value ?? 0);
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
    /** 定点メール。stats/rows/blocks を渡すと構造化して表示し、省略時は text をそのまま1ブロックに流す（エラー通知用）。 */
    const mail = (
      subject: string,
      text: string,
      opts?: {
        heading?: string;
        stats?: Array<{ label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }>;
        rows?: Array<[string, string]>;
        blocks?: Array<{ title: string; body: string }>;
        lead?: string;
        variant?: "brand" | "alert";
      },
    ) =>
      transporter.sendMail({
        from: `"yah.homes 定点" <${SMTP_USER.value()}>`, to: teitenTo, subject, text,
        html: mailHtml({
          heading: opts?.heading ?? (subject.replace(/^【定点】\s*/, "") || "定点観測"),
          badge: `日次定点|${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })}`,
          lead: opts?.lead,
          stats: opts?.stats,
          rows: opts?.rows,
          blocks: opts?.blocks ?? [{ title: "サマリー", body: esc(text) }],
          cta: { label: "予約管理を開く", href: `${SITE_URL}/admin/bookings/` },
          variant: opts?.variant,
        }),
      });

    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    try {
      // ① 取得（過去90日到着〜18ヶ月先・キャンセル込み）
      const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 550 * 86400000).toISOString().slice(0, 10);
      // TEITEN_PROPS に無い物件（検証用 test1 等）は観測対象外＝ここで除外する。
      // 除外しないと prop が undefined になり Firestore への状態保存が失敗する。
      const bookings = (await beds24FetchAll(
        `https://beds24.com/api/v2/bookings?arrivalFrom=${from}&arrivalTo=${to}&pageSize=200&includeCancelled=true`,
        BEDS24_TOKEN.value()
      )).filter((b) => TEITEN_PROPS[b.propertyId]);

      const nightsOf = (b: Beds24Booking) => Math.round((Date.parse(b.departure) - Date.parse(b.arrival)) / 86400000);
      const active = (b: Beds24Booking) => b.status === "confirmed" || b.status === "new";
      const isDirect = (b: Beds24Booking) => (b.custom1 ?? "").startsWith("yah.homes direct");
      const isGuest = (b: Beds24Booking) =>
        b.status !== "black" &&
        !/オーナー|yamada|山田|sugimoto|杉本|工事|テスト/i.test(`${b.firstName ?? ""} ${b.lastName ?? ""} ${b.referer ?? ""} ${b.apiSource ?? ""}`) &&
        // API直作成は原則観測対象外だが、直販サイト経由（custom1に直販印・§P1）は正規ゲストとして採用
        (isDirect(b) || !(!b.referer && /^api$/i.test(b.apiSource ?? "")));

      // ② 差分（Firestoreスナップショットと照合）
      const stateRef = db.collection("beds24_state").doc("latest");
      const prevDoc = await stateRef.get();
      const prev = (prevDoc.data() as { bookings: Record<string, { status: string; arrival: string; n: number; prop: string; guest?: boolean }>; date: string | null } | undefined)
        ?? { bookings: {}, date: null };

      const events: { new: string[]; cancelled: string[]; changed: string[]; deleted: string[] } = { new: [], cancelled: [], changed: [], deleted: [] };
      const seenIds = new Set<string>();
      for (const b of bookings) {
        seenIds.add(String(b.id));
        if (!isGuest(b)) continue;
        const p = prev.bookings[String(b.id)];
        const label = `${TEITEN_PROPS[b.propertyId]} ${b.arrival}〜${nightsOf(b)}泊 ${b.firstName ?? ""} ${b.lastName ?? ""} [${isDirect(b) ? "直販" : b.referer || b.apiSource || "?"}] ${b.country2 || ""}`;
        const wasActive = p != null && (p.status === "confirmed" || p.status === "new");
        if (!wasActive && active(b)) events.new.push(label); // 新ID・request/inquiryからの確定・キャンセル復活を含む
        else if (p && p.status !== "cancelled" && b.status === "cancelled") events.cancelled.push(label);
        else if (wasActive && active(b) && (p.arrival !== b.arrival || p.n !== nightsOf(b)))
          events.changed.push(`${label}（旧: ${p.arrival}〜${p.n}泊）`);
      }
      // 物理削除の検知: 前回スナップショットに居たのに今回のAPI結果から消えた予約（テスト予約の削除等）。
      // 誤検知対策: ①取得窓(arrivalFrom)の後端から外れただけの過去予約は対象外
      //             ②ID指定で再照会し、本当に存在しない場合のみ削除と判定（一覧APIの一時欠落を除外）
      for (const [id, p] of Object.entries(prev.bookings)) {
        if (seenIds.has(id) || p.status === "cancelled") continue;
        if (p.guest === false) continue; // オーナー利用・テスト等は新規にも数えていないので差引もしない
        if (p.arrival < from) continue; // 窓落ち（過去到着分）は削除ではない
        const rc = await fetch(`https://beds24.com/api/v2/bookings?id=${id}&includeCancelled=true`, {
          headers: { token: BEDS24_TOKEN.value() },
        }).then((r) => r.json() as Promise<{ data?: Beds24Booking[] }>).catch(() => null);
        const found = rc?.data?.[0];
        if (found) {
          // 存在する＝一覧からの一時欠落。キャンセル済みならキャンセルとして計上
          if (found.status === "cancelled")
            events.cancelled.push(`${p.prop} ${found.arrival}〜${p.n}泊 ${found.firstName ?? ""} ${found.lastName ?? ""} [${found.referer || found.apiSource || "?"}] `);
          continue;
        }
        events.deleted.push(`${p.prop} ${p.arrival}〜${p.n}泊 (ID:${id})`);
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
      const directNew = events.new.filter((l) => l.includes("[直販]")).length;
      const directCxl = events.cancelled.filter((l) => l.includes("[直販]")).length;
      const kDel = tally(events.deleted, "清川"), tDel = tally(events.deleted, "高砂");
      const kNew = tally(events.new, "清川"), kCxl = tally(events.cancelled, "清川");
      const tNew = tally(events.new, "高砂"), tCxl = tally(events.cancelled, "高砂");

      // ③ 状態保存（差分計算の直後＝シート/メール失敗でも翌日の二重計上を防ぐ。
      // 保存後に後段が失敗した場合、その日の行は空欄になるがエラーメールで検知でき、常に安全側）
      const snap: Record<string, { status: string; arrival: string; n: number; prop: string; guest: boolean }> = {};
      for (const b of bookings) snap[String(b.id)] = { status: b.status, arrival: b.arrival, n: nightsOf(b), prop: TEITEN_PROPS[b.propertyId], guest: isGuest(b) };
      await stateRef.set({ bookings: snap, date: today, updatedAt: FieldValue.serverTimestamp() });
      await db.collection("beds24_state").doc("daily").collection("snapshots").doc(today)
        .set({ bookings: snap, date: today, createdAt: FieldValue.serverTimestamp() });

      // ④ シート記入（初回・同日再実行はスキップ＝冪等）
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
            { range: `B${row}`, values: [[kNew.g - kCxl.g - kDel.g]] }, { range: `C${row}`, values: [[kNew.n - kCxl.n - kDel.n]] },
            { range: `E${row}`, values: [[tNew.g - tCxl.g - tDel.g]] }, { range: `F${row}`, values: [[tNew.n - tCxl.n - tDel.n]] },
            { range: `I${row}`, values: [[fwd.清川]] }, { range: `K${row}`, values: [[fwd.高砂]] },
            { range: `M${row}`, values: [[fwd.清川 + fwd.高砂]] },
          ];
          // H列 = 直販サイトでの販売数（当日行・観測窓内の直販新規−直販キャンセル）
          data.push({ range: `H${row}`, values: [[directNew - directCxl]] });
          const w = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${TEITEN_SHEET_ID}/values:batchUpdate`, {
            method: "POST",
            headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
            body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
          });
          if (!w.ok) throw new Error(`sheets write ${w.status}: ${(await w.text()).slice(0, 200)}`);
          sheetNote = `シート記入OK: ${dstr}行`;
        } else sheetNote = `シートに ${dstr} 行が見つからず記入スキップ`;
      }


      // ⑤ サマリメール（特記: 適正帯28〜33%逸脱・3泊以上・キャンセル塊）
      // 棟別・全体の差引（新規 − キャンセル − 物理削除）。メールの主要数値に使う。
      const kNet = { g: kNew.g - kCxl.g - kDel.g, n: kNew.n - kCxl.n - kDel.n };
      const tNet = { g: tNew.g - tCxl.g - tDel.g, n: tNew.n - tCxl.n - tDel.n };
      const grossNewN = events.new.reduce((s2, l) => s2 + (Number(l.match(/〜(\d+)泊/)?.[1]) || 0), 0);
      const notes: string[] = [];
      if (fwdRate < 28) notes.push(`先付け率 ${fwdRate}% が適正帯(28〜33%)を下回り`);
      if (fwdRate > 33) notes.push(`先付け率 ${fwdRate}% が適正帯(28〜33%)を上回り`);
      for (const l of events.new) { const n = Number(l.match(/〜(\d+)泊/)?.[1]); if (n >= 3) notes.push(`大型: ${l}`); }
      if (events.cancelled.length >= 3) notes.push(`キャンセル${events.cancelled.length}件（塊）`);

      await mail(
        `【定点】${+today.slice(5, 7)}/${+today.slice(8, 10)} 新規${events.new.length}件${grossNewN}泊・先付け${fwdTotal}泊(${fwdRate}%)`,
        [
          `=== Beds24 日次観測 ${today}（前回: ${prev.date ?? "初回"}）===`, ``,
          `【サマリ（定点シート形式）】`,
          `清川　　　　: ${kNew.g - kCxl.g - kDel.g >= 0 ? "+" : ""}${kNew.g - kCxl.g - kDel.g}組 ${kNew.n - kCxl.n - kDel.n >= 0 ? "+" : ""}${kNew.n - kCxl.n - kDel.n}泊`,
          `高砂　　　　: ${tNew.g - tCxl.g - tDel.g >= 0 ? "+" : ""}${tNew.g - tCxl.g - tDel.g}組 ${tNew.n - tCxl.n - tDel.n >= 0 ? "+" : ""}${tNew.n - tCxl.n - tDel.n}泊`,
          `直販販売数 : ${directNew - directCxl >= 0 ? "+" : ""}${directNew - directCxl}組`,
          `CV数(日次): ${handoff?.total ?? "取得失敗（GA4）"}（前日の全キーイベント合計・参考値）`,
          `  内訳 click_airbnb: ${clicks ?? "—"} / click_booking_com: ${handoff?.click_booking_com ?? "—"} / click_booking_calendar: ${handoff?.click_booking_calendar ?? "—"}`,
          `先付け 清川 : ${fwd.清川}泊 (${pct(fwd.清川, 365)})`,
          `先付け 高砂 : ${fwd.高砂}泊 (${pct(fwd.高砂, 365)})`,
          `先付け 合計 : ${fwdTotal}泊 (${fwdRate}%)`, ``,
          `新規予約 ${events.new.length}件:`, ...events.new.map((l) => `  + ${l}`), ``,
          `キャンセル ${events.cancelled.length}件:`, ...events.cancelled.map((l) => `  - ${l}`), ``,
          ...(events.deleted.length ? [`物理削除 ${events.deleted.length}件（テスト予約の削除等・差引済み）:`, ...events.deleted.map((l) => `  - ${l}`), ``] : []),
          ...(events.changed.length ? [`変更 ${events.changed.length}件:`, ...events.changed.map((l) => `  * ${l}`), ``] : []),
          `先付け残高: 清川${fwd.清川}泊 / 高砂${fwd.高砂}泊 / 計${fwdTotal}泊（${fwdRate}%）`,
          sheetNote, ``,
          ...(notes.length ? [`MEMO: ${notes.join("・")}`] : []),
        ].join("\n"),
        {
          // 一目で読ませるのは「今日いくつ増えたか」と「在庫がどれだけ積んであるか」の2点に絞る
          // 見出しとリード文は主要数値タイルと重複するため出さない（2026-08-16 発注者指示）
          heading: "",
          stats: [
            {
              // 差引だと大型新規が取消と相殺されて見えないため、先頭カードはグロス新規（2026-08-18 発注者指示）
              label: "新規予約",
              value: `${events.new.length}件`,
              sub: `${grossNewN}泊` + (events.cancelled.length + events.deleted.length > 0 ? `（取消${events.cancelled.length}・削除${events.deleted.length}は棟別行で差引）` : ""),
              tone: events.new.length > 0 ? "good" : undefined,
            },
            { label: "先付け残高", value: `${fwdTotal}泊`, sub: `${fwdRate}%（適正 28〜33%）`, tone: fwdRate < 28 ? "warn" : fwdRate > 33 ? "warn" : "good" },
            {
              // 主指標は直販（purchase）。手渡しは旧CV定義の指標なので補足に降格した（2026-08-16 CV切替）
              label: "直販CV（前日）",
              value: `${handoff?.purchase ?? "—"}件`,
              sub: handoff
                ? (handoff.purchase > 0
                  ? `¥${Math.round(handoff.revenue ?? 0).toLocaleString()} ／ 訪問 ${(handoff.sessions ?? 0).toLocaleString()}セッション`
                  : `訪問 ${(handoff.sessions ?? 0).toLocaleString()}セッション`)
                : "GA4取得失敗",
              tone: handoff && handoff.purchase > 0 ? "good" : undefined,
            },
          ],
          rows: [
            // 値が長い行は2段に割る（1段目=増減／2段目=在庫や内訳。2段目は小さく灰色にして主従を付ける）
            ["清川", `${esc(`${kNet.g >= 0 ? "+" : ""}${kNet.g}組 ${kNet.n >= 0 ? "+" : ""}${kNet.n}泊`)}<br><span style="font-size:12px;color:#888888;font-weight:400;">${esc(`先付け ${fwd.清川}泊（${pct(fwd.清川, 365)}）`)}</span>`],
            ["高砂", `${esc(`${tNet.g >= 0 ? "+" : ""}${tNet.g}組 ${tNet.n >= 0 ? "+" : ""}${tNet.n}泊`)}<br><span style="font-size:12px;color:#888888;font-weight:400;">${esc(`先付け ${fwd.高砂}泊（${pct(fwd.高砂, 365)}）`)}</span>`],
            ["キャンセル", esc(`${events.cancelled.length}件`)],
            ["定点シート", esc(sheetNote)],
          ],
          blocks: [
            // 新規の明細を最上段に（先頭カードの「n件」の中身がすぐ見えるように）
            ...(events.new.length ? [{ title: "新規予約の明細", body: esc(events.new.map((l) => `+ ${l}`).join("\n")) }] : []),
            ...(notes.length ? [{ title: "⚠ 特記", body: esc(notes.join("\n")) }] : []),
            ...(events.cancelled.length ? [{ title: `キャンセル ${events.cancelled.length}件`, body: esc(events.cancelled.map((l) => `- ${l}`).join("\n")) }] : []),
            ...(events.changed.length ? [{ title: `変更 ${events.changed.length}件`, body: esc(events.changed.map((l) => `* ${l}`).join("\n")) }] : []),
            ...(events.deleted.length ? [{ title: `物理削除 ${events.deleted.length}件（差引済み）`, body: esc(events.deleted.map((l) => `- ${l}`).join("\n")) }] : []),
          ],
          variant: notes.some((n) => n.includes("下回り") || n.includes("塊")) ? "alert" : "brand",
        },
      );

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
  { region: REGION, maxInstances: MAX_INSTANCES, secrets: [BEDS24_TOKEN, BEDS24_WEBHOOK_KEY], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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
  { region: REGION, maxInstances: MAX_INSTANCES, secrets: [BEDS24_TOKEN, STRIPE_SECRET_KEY], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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
    // 同意した約款の版。改ざんを防ぐため、サーバが知っている版のみ受け付ける。
    // 古い版を名乗る値が来たら現行版として記録せず、そのまま残して後から照合できるようにする。
    const termsVersion = TERMS_VERSIONS.includes(String(b.termsVersion)) ? String(b.termsVersion) : TERMS_VERSION_CURRENT;
    const marketingOptIn = b.marketingOptIn === true;
    const idempotencyKey = typeof b.idempotencyKey === "string" ? b.idempotencyKey.slice(0, 100) : "";
    // GA4のclient_id・広告のgclid/UTM（購買行動の突合用・個人情報ではない）
    const clientId = typeof b.clientId === "string" ? b.clientId.slice(0, 64) : "";
    // session_id はサーバー送信の purchase を同一セッションに合流させるために要る（無いと参照元が Unassigned になる）
    const sessionId = typeof b.sessionId === "string" ? b.sessionId.slice(0, 32) : "";
    const gclid = typeof b.gclid === "string" ? b.gclid.slice(0, 200) : "";
    const utm = typeof b.utm === "object" && b.utm ? b.utm : null;
    const authProvider = typeof b.authProvider === "string" ? b.authProvider.slice(0, 20) : "";

    const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!(PROP_KEYS as readonly string[]).includes(prop) || !isDate(checkin) || !isDate(checkout) || checkout <= checkin ||
        !Number.isInteger(guests) || guests < 1 || !name || !phone || !rulesAccepted || !idempotencyKey) {
      res.status(400).json({ ok: false, error: "invalid_input" });
      return;
    }

    try {
      // 冪等: 同じキーの予約が既にあれば、その client_secret を返す（二重送信対策）
      const dup = await db.collection("bookings").where("idempotencyKey", "==", idempotencyKey).limit(1).get();
      if (!dup.empty) {
        const d = dup.docs[0].data() as BookingDoc & { clientSecret?: string };
        // 冪等キーは「同じ申込みの再送」を1件にまとめるためのもの。
        // 中身が違うのに同じキーで来たら、それは別の申込み（画面の作り直し・キーの使い回し）。
        // ここで内容を照合しないと、新しい日程のつもりのお客様に前の予約の決済を返してしまい、
        // 違う日程・違う金額のまま決済が成立する（P0-3）。
        const same = d.prop === prop && d.checkin === checkin && d.checkout === checkout &&
          Number(d.guests) === guests && String(d.uid ?? "") === uid;
        if (!same) {
          logger.warn("idempotency key reused with different input", {
            bookingId: dup.docs[0].id, idempotencyKey,
            had: { prop: d.prop, checkin: d.checkin, checkout: d.checkout, guests: d.guests },
            got: { prop, checkin, checkout, guests },
          });
          res.status(409).json({ ok: false, error: "idempotency_conflict" });
          return;
        }
        res.status(200).json({ ok: true, bookingId: dup.docs[0].id, clientSecret: d.clientSecret ?? null, duplicate: true });
        return;
      }

      // 受付の可否（定員・締切・先の上限）。正本は property_facts（/admin/properties）。
      // 在庫の問い合わせより前に見る（弾く予約で Beds24 を叩かない）。
      const rules = await bookingRules(prop);
      if (!rules) {
        // 定員が分からない状態で受けると定員超過の予約が成立しうる（2026-08-17 発注者判断）
        logger.warn("bookCreate: property_facts を読めず受付を中止", { prop });
        res.status(503).json({ ok: false, error: "facts_unavailable" });
        return;
      }
      const win = checkBookingWindow(checkin, guests, rules);
      if (!win.ok) { res.status(400).json({ ok: false, error: win.error }); return; }

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

      // 無料キャンセル期限 = チェックイン日の freeCancelDays 日前 23:59 JST（v5 §5-1）。
      // 日数の正は property_facts（/admin/properties）。表示側も同じ値を使うので、
      // 管理画面で変えればサイト文言・決済画面・確定メール・返金判定が一斉に変わる。
      const freeCancelUntilAt = new Date(
        Date.parse(`${checkin}T23:59:59+09:00`) - rules.freeCancelDays * 86400000,
      ).toISOString();
      const operationId = `op_${idempotencyKey}`;

      const ref = db.collection("bookings").doc();
      await ref.set({
        uid, email, prop, checkin, checkout, guests, total, currency: "JPY",
        name, phone, leadGuest: leadGuest || null, arrival: arrival || null, lang: langStr,
        status: "PAYMENT_PENDING", stateVersion: 0, operationId, idempotencyKey,
        roomId: q.data?.[0]?.roomId ?? null,
        policyVersion: "2026-08-08", termsVersion, freeCancelUntilAt,
        clientId: clientId || null, sessionId: sessionId || null, gclid: gclid || null, utm, authProvider: authProvider || null,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });

      // 同意証跡（v4 §4.5-1/2）
      await db.collection("consents").add({
        uid, email, bookingId: ref.id,
        // 約款（ハウスルールを別表1として内包）への同意。1クリックに統合済み。
        terms: { accepted: rulesAccepted, version: termsVersion },
        houseRules: { accepted: rulesAccepted, version: termsVersion },  // 旧キー（既存データとの互換）
        marketing: { optIn: marketingOptIn, version: termsVersion },
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
  { region: REGION, maxInstances: MAX_INSTANCES, secrets: [BEDS24_WRITE_REFRESH, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, BEDS24_TOKEN, SMTP_USER, SMTP_PASS, GA4_API_SECRET, META_CAPI_TOKEN], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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
    await ensureThread(bookingId, c2).catch((e) => logger.warn("ensureThread failed", { e: String(e).slice(0, 120) }));
    await sendConfirmationMail(bookingId, c2);
    // Beds24 の受信箱にも新規予約を知らせる。予約自体は API で作られるが、
    // それだけでは受信箱に出ず、受信箱を見ている運営会社が気づけないため。
    await noteBeds24NewBooking(
      beds24Id,
      [
        `予約番号 ${bookingId.slice(0, 8).toUpperCase()}／${cur.prop}`,
        `${cur.checkin} 〜 ${cur.checkout}（${Math.round((Date.parse(cur.checkout) - Date.parse(cur.checkin)) / 86400000)}泊 ${cur.guests}名）`,
        `お名前: ${String(c2.name ?? "")}`,
        `合計 ¥${Number(cur.total).toLocaleString("en-US")}（決済済み・現地でのお支払いなし）`,
        "対応不要です。ご連絡は yah.homes の管理画面「メッセージ」から届きます。",
      ].join("\n"),
    ).catch((e) => logger.warn("noteBeds24NewBooking failed", { e: String(e).slice(0, 160) }));
    // 直前予約の救済。入室案内（暗証番号つき）を配るジョブは前日10:00にしか走らないため、
    // その時刻を過ぎてから確定した予約には案内が一通も届かない＝玄関で開けられない。
    // 該当する場合はここで即送り、reminderSentAt を立ててジョブ側と二重送信しないようにする。
    await sendReminderIfLate(bookingId, ref).catch((e) =>
      logger.error("late reminder failed", { bookingId, e: String(e).slice(0, 200) }));
    await sendPurchaseEvent({
      id: bookingId, uid: cur.uid, prop: cur.prop, total: cur.total, guests: cur.guests,
      nights: Math.round((Date.parse(cur.checkout) - Date.parse(cur.checkin)) / 86400000),
      lang: String(c2.lang ?? ""), authProvider: String(c2.authProvider ?? ""), clientId: String(c2.clientId ?? ""),
      sessionId: String(c2.sessionId ?? ""),
    });
    // 広告計測（Meta）。失敗しても予約確定は成立させる
    await sendMetaPurchase({
      id: bookingId, prop: cur.prop, total: cur.total, guests: cur.guests,
      nights: Math.round((Date.parse(cur.checkout) - Date.parse(cur.checkin)) / 86400000),
      checkin: cur.checkin, email: String(c2.email ?? ""),
    }).catch((e) => logger.warn("sendMetaPurchase failed", { e: String(e).slice(0, 160) }));
  } catch (err) {
    logger.error("fulfillBooking failed", err);
    await fail(String(err).slice(0, 200), "MANUAL_REVIEW");
  }
}

/**
 * Meta Conversions API に Purchase を送る（docs/plan_refactor_and_conversion_202608.md §6-2-1）。
 *
 * ブラウザの完了ページからではなくサーバーから送る理由: 決済後に画面を閉じる、
 * 広告ブロッカーが効く、通信が落ちる、のいずれでも売上を取りこぼさないため。
 * 送信条件は「決済成功かつ予約番号確定」＝この関数が呼ばれる時点でその両方が成立している。
 *
 * event_id には予約IDを使う。Pixel 側で同じ予約に同じIDを付ければ Meta 側で
 * 重複排除されるので、将来ブラウザからも送る場合に二重計上にならない。
 *
 * 個人情報の扱い: メールは SHA-256 でハッシュ化して user_data に入れる（Meta の仕様）。
 * 平文は送らない。宿泊日・氏名・電話・決済番号は custom_data に一切入れない。
 * リードタイムはバケットに丸める（具体的な旅行日程を広告基盤へ渡さないため）。
 */
const META_PIXEL_ID = "2216414819216704";
async function sendMetaPurchase(b: {
  id: string; prop: string; total: number; guests: number; nights: number;
  checkin: string; email?: string;
}): Promise<void> {
  const token = META_CAPI_TOKEN.value();
  if (!token || token.startsWith("placeholder")) return; // 未設定時は送らない（障害にしない）
  try {
    const leadDays = Math.round((Date.parse(b.checkin) - Date.now()) / 86400000);
    const bucket = leadDays <= 3 ? "0_3_days" : leadDays <= 7 ? "4_7_days"
      : leadDays <= 14 ? "8_14_days" : leadDays <= 30 ? "15_30_days" : "over_30_days";
    const sha256 = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
    const res = await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: b.id,                       // Pixel と共通＝重複排除の鍵
          action_source: "website",
          event_source_url: `${SITE_URL}/book/complete/`,
          user_data: b.email ? { em: [sha256(b.email)] } : {},
          custom_data: {
            currency: "JPY",
            value: b.total,
            content_ids: [`stay_${b.prop}`],
            content_type: "product",
            contents: [{ id: `stay_${b.prop}`, quantity: 1, item_price: b.total }],
            num_items: 1,
            property_id: b.prop,
            nights: b.nights,
            guests: b.guests,
            lead_time_bucket: bucket,
            booking_channel: "direct",
          },
        }],
      }),
    });
    if (!res.ok) logger.warn("meta capi purchase failed", { status: res.status, body: (await res.text()).slice(0, 200) });
  } catch (e) {
    logger.warn("meta capi purchase error", { e: String(e).slice(0, 160) });
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
  lang?: string; authProvider?: string; clientId?: string; sessionId?: string;
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
              // この2つが無いとGA4が新規セッションを作り、参照元が失われる（Unassignedになる）
              session_id: booking.sessionId || undefined,
              engagement_time_msec: 1,
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

/**
 * GA4 refund をキャンセル・返金の確定後に送る。
 * 送らないと、返金済みの予約がコンバージョンとして残り続け、
 * Google Ads の入札が「実際には成立していない予約」を学習する。
 * キャンセルポリシーが「8日前まで無料」のため、これは必ず発生する。
 * transaction_id は purchase と同一（＝GA4側で相殺される）。
 */
async function sendRefundEvent(booking: {
  id: string; uid?: string; total: number; refundAmount: number; clientId?: string; sessionId?: string;
}): Promise<void> {
  const secret = GA4_API_SECRET.value();
  if (!secret || secret.startsWith("placeholder")) return; // 未設定時は送らない（障害にしない）
  try {
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${secret}`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: booking.clientId || `srv.${(booking.uid ?? booking.id).slice(0, 16)}`,
          events: [{
            name: "refund",
            params: {
              transaction_id: booking.id,
              currency: "JPY",
              // 全額返金なら value を省略しても相殺されるが、部分返金と区別するため常に入れる
              value: booking.refundAmount,
              session_id: booking.sessionId || undefined,
              engagement_time_msec: 1,
            },
          }],
        }),
      },
    );
  } catch (err) {
    logger.warn("GA4 refund send failed", err);
  }
}

/** 障害通知（沈黙禁止・v4 §8-6） */
/* ─── 予約確定メール（お客様宛・予約言語・HTML＋テキスト） ───
   Booking.com の確定メールを参考に、カード単位で情報を切って読める構成にする。
   メールクライアント制約: table レイアウト＋インラインCSS。外部CSS/JS/画像は使わない。 */

import { esc, mailHtml, SITE_URL } from "./mail-template.js";

// 住所は発注者確認済みのもののみ記載する（未確認の棟は地図リンクのみ）。
/** 運営会社の問い合わせ先（差し込み記号 {{phone}}） */
/* 宿泊約款の版。src/pages/[...locale]/legal/terms.astro の EFFECTIVE と
   checkout.astro の TERMS_VERSION に必ず揃える。改定時は CURRENT を更新し、
   旧版は TERMS_VERSIONS に残す（過去の同意証跡がどの版だったか照合できるように）。 */
const TERMS_VERSION_CURRENT = "2026-08-14";
const TERMS_VERSIONS = [TERMS_VERSION_CURRENT];

const OPERATOR_PHONE = "050-1721-4419";
/** メールの返信先（mailto の宛先にも使う） */
const MAIL_FROM = "contact@mail.yah.homes";

const MAIL_PROP = {
  kiyokawa: {
    name: "yah.homes kiyokawa",
    image: `${SITE_URL}/manus-storage/kiyokawa-exterior_18a3409b.webp`,
    address: "〒810-0005 福岡県福岡市中央区清川3-3-1",
    map: "https://www.google.com/maps/search/?api=1&query=33.57879181728365,130.4126724730762",
    register: "https://zfrmz.jp/TcYXUliEZ84JkJSVzSLi", // 宿泊者名簿フォーム（旅館業法）
    manual: "https://yah.homes/how-to/kiyokawa/", // 入室案内ページ
  },
  takasago: {
    name: "yah.homes takasago",
    image: `${SITE_URL}/manus-storage/takasago-exterior_d4f7ccff.webp`,
    address: "",
    map: "https://www.google.com/maps/search/?api=1&query=33.579953440232984,130.40629424218778",
    register: "https://zfrmz.jp/sZQlLvoM43I0Od6UZPzF", // 宿泊者名簿フォーム（旅館業法）
    manual: "https://yah.homes/how-to/takasago/", // 入室案内ページ
  },
  test: {
    name: "yah.homes test1（検証用）",
    image: `${SITE_URL}/manus-storage/kiyokawa-exterior_18a3409b.webp`,
    address: "〒810-0005 福岡県福岡市中央区清川3-3-1",
    map: "https://www.google.com/maps/search/?api=1&query=33.57879181728365,130.4126724730762",
  },
} as Record<string, { name: string; image: string; address: string; map: string; register?: string; manual?: string }>;

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
    cancelTitle: "キャンセル料", cancelFree: "{d} まで", cancelAfter: "{d} 以降", cancelNote: "キャンセル期限は日本時間での表記です。", changeNote: "日程・人数の変更をご希望の場合は、一度キャンセルのうえ、あらためてご予約くださいませ（無料キャンセル期間内であれば追加のご負担はありません）。無料キャンセル期間を過ぎている場合は、My Page のメッセージからご相談ください。",
    payTitle: "お支払い", payTotal: "合計料金", payPaid: "お支払い済み", payOnSite: "現地でのお支払い",
    payNote: "宿泊料・宿泊税・清掃料が含まれています。追加のご請求はありません。",
    ctaTitle: "予約内容の確認・変更", cta: "予約内容の変更・キャンセル", cta2: "メッセージを送る",
    ctaNote: "ご予約時のアカウントでログインすると、到着予定時刻の登録やご予約の確認ができます。",
    entryTitle: "入室について",
    entryBody: "玄関のキーボックスでの受け渡しです。暗証番号と詳しい入室手順は、ご到着の前日にメールでお送りします。深夜のご到着でも問題ありません。",
    placeTitle: "場所", placeBtn: "地図を開く",
    placeNote: "正確な住所は入室のご案内とあわせてお送りします。",
    safetyTitle: "安全のために",
    safetyBody: "当社からメールやお電話で、カード情報の再入力や追加のお支払いをお願いすることはありません。そのようなご連絡を受け取られた場合は、リンクを開かずに下記までご連絡ください。",
    contactTitle: "ご不明な点", contactBody: "My Page のメッセージからご連絡ください。ご予約ごとにやり取りが残ります。",
    footer: "yah.homes【Operated by AIRSTAR】",
  },
  en: {
    registerTitle: "One thing before your stay",
    registerLead: "Register the guest list (all guests)",
    registerDue: "Please complete by {d}",
    registerBtn: "Register guest list",
    registerBody: "Japanese law requires us to collect details for every person staying. Guests without an address in Japan also need to submit a photo of each guest's passport.",
    registerWarn: "We will send your entry instructions once we have your registration. Without it, we cannot send the key box PIN.",
    subject: "[yah.homes] Your booking is confirmed", greetSuffix: "",
    lead: "Thank you for booking with yah.homes. Your reservation is confirmed.",
    bookingNo: "Booking ID", checkTitle: "Booking details",
    checkin: "Check-in", checkout: "Check-out", stay: "Your reservation", guestsRow: "Guests",
    house: "House", arrival: "Estimated arrival", checkinWindow: "from {ci} (arrive any time after that)", checkoutWindow: "until {co}",
    nights: "{n} nights", guests: "{g} adults",
    cancelTitle: "Cancellation fee", cancelFree: "Until {d}", cancelAfter: "From {d}", cancelNote: "Deadlines are shown in Japan time (JST).", changeNote: "To change your dates or party size, please cancel this booking and make a new one — within the free cancellation period there is no extra cost. If the free cancellation period has passed, message us from My Page.",
    payTitle: "Payment", payTotal: "Total", payPaid: "Paid", payOnSite: "Due on arrival",
    payNote: "Room rate, lodging tax and cleaning fee are included. There is nothing more to pay.",
    ctaTitle: "Manage your booking", cta: "Change or cancel your booking", cta2: "Send us a message",
    ctaNote: "Sign in with the account you used to book to add your arrival time or review the booking.",
    entryTitle: "Getting in",
    entryBody: "Self check-in with a key box at the entrance. We will email the code and full instructions the day before your arrival. Late-night arrivals are fine.",
    placeTitle: "Location", placeBtn: "Open in Maps",
    placeNote: "The exact address is sent together with the check-in instructions.",
    safetyTitle: "Staying safe",
    safetyBody: "We will never email or call you to re-enter your card details or ask for an extra payment. If you receive such a message, do not open the link and contact us below.",
    contactTitle: "Questions?", contactBody: "Message us from My Page — each booking has its own thread.",
    footer: "yah.homes【Operated by AIRSTAR】",
  },
  ko: {
    registerTitle: "숙박 전 부탁드릴 사항",
    registerLead: "숙박자 명부 등록 (투숙객 전원)",
    registerDue: "{d}까지 부탁드립니다",
    registerBtn: "숙박자 명부 등록하기",
    registerBody: "일본 여관업법에 따라 숙박하시는 모든 분의 정보를 등록하는 것이 의무화되어 있습니다. 일본 내 주소가 없는 외국 국적 고객님은 전원의 여권 사본(이미지)도 함께 제출해 주셔야 합니다.",
    registerWarn: "등록이 확인되면 입실 방법을 보내드립니다. 등록이 없으면 키박스 비밀번호를 보내드릴 수 없습니다.",
    subject: "[yah.homes] 예약이 확정되었습니다", greetSuffix: " 님",
    lead: "yah.homes를 예약해 주셔서 감사합니다. 예약이 확정되었습니다.",
    bookingNo: "예약번호", checkTitle: "예약 내용",
    checkin: "체크인", checkout: "체크아웃", stay: "고객님의 예약", guestsRow: "인원",
    house: "숙소", arrival: "도착 예정 시각", checkinWindow: "{ci}~ (시간 제한 없음)", checkoutWindow: "~{co}",
    nights: "{n}박", guests: "성인 {g}명",
    cancelTitle: "취소 수수료", cancelFree: "{d}까지", cancelAfter: "{d} 이후", cancelNote: "취소 기한은 일본 시간 기준입니다.", changeNote: "날짜나 인원 변경을 원하시면 예약을 취소하신 후 다시 예약해 주세요(무료 취소 기간 내라면 추가 부담은 없습니다). 무료 취소 기간이 지난 경우에는 My Page 메시지로 상담해 주세요.",
    payTitle: "결제", payTotal: "총 금액", payPaid: "결제 완료", payOnSite: "현지 결제",
    payNote: "숙박료·숙박세·청소비가 포함되어 있습니다. 추가 청구는 없습니다.",
    ctaTitle: "예약 확인·변경", cta: "예약 변경·취소", cta2: "메시지 보내기",
    ctaNote: "예약하신 계정으로 로그인하면 도착 예정 시각 등록과 예약 확인이 가능합니다.",
    entryTitle: "입실 안내",
    entryBody: "현관 키박스를 이용한 셀프 체크인입니다. 비밀번호와 자세한 입실 안내는 도착 전날 메일로 보내드립니다. 늦은 시간 도착도 괜찮습니다.",
    placeTitle: "위치", placeBtn: "지도 열기",
    placeNote: "정확한 주소는 입실 안내와 함께 보내드립니다.",
    safetyTitle: "안전 안내",
    safetyBody: "당사는 메일이나 전화로 카드 정보 재입력이나 추가 결제를 요청하지 않습니다. 그런 연락을 받으시면 링크를 열지 마시고 아래로 연락해 주세요.",
    contactTitle: "문의", contactBody: "My Page 메시지로 연락해 주세요. 예약별로 대화가 남습니다.",
    footer: "yah.homes【Operated by AIRSTAR】",
  },
  zh: {
    registerTitle: "入住前想麻煩您一件事",
    registerLead: "登記住宿者名冊（全體住宿者）",
    registerDue: "請於 {d} 前完成",
    registerBtn: "登記住宿者名冊",
    registerBody: "依日本旅館業法規定，我們必須取得每一位住宿者的資料。在日本沒有住址的外籍旅客，另需提供全體住宿者的護照照片。",
    registerWarn: "確認登記後，我們會寄送入住方式。未完成登記，恕無法提供鑰匙盒的密碼。",
    subject: "【yah.homes】您的預訂已確認", greetSuffix: " 您好",
    lead: "感謝您預訂 yah.homes，您的預訂已確認。",
    bookingNo: "預訂編號", checkTitle: "預訂內容",
    checkin: "入住", checkout: "退房", stay: "您的預訂", guestsRow: "人數",
    house: "房源", arrival: "預計抵達時間", checkinWindow: "{ci} 起（無時間限制）", checkoutWindow: "{co} 前",
    nights: "{n}晚", guests: "成人 {g} 位",
    cancelTitle: "取消費用", cancelFree: "{d} 前", cancelAfter: "{d} 起", cancelNote: "取消期限以日本時間為準。", changeNote: "如需變更日期或人數，請先取消本次預訂後重新預訂（在免費取消期限內不會產生額外費用）。若已超過免費取消期限，請透過 My Page 訊息與我們聯繫。",
    payTitle: "付款", payTotal: "總金額", payPaid: "已付金額", payOnSite: "現場付款",
    payNote: "已含住宿費、住宿稅與清潔費，不會另外收費。",
    ctaTitle: "查看與變更預訂", cta: "變更或取消預訂", cta2: "傳送訊息",
    ctaNote: "以預訂時使用的帳號登入，即可登記抵達時間或查看預訂。",
    entryTitle: "入住方式",
    entryBody: "透過玄關的密碼鑰匙盒自助入住。密碼與詳細入住說明，將於抵達前一天以電子郵件寄送。深夜抵達也沒問題。",
    placeTitle: "位置", placeBtn: "開啟地圖",
    placeNote: "詳細地址將與入住說明一併寄送。",
    safetyTitle: "安全提醒",
    safetyBody: "本公司不會以郵件或電話要求您重新輸入信用卡資訊或額外付款。若收到此類訊息，請勿開啟連結並與我們聯繫。",
    contactTitle: "有任何問題", contactBody: "請透過 My Page 訊息與我們聯繫，每筆預訂都有獨立的對話紀錄。",
    footer: "yah.homes【Operated by AIRSTAR】",
  },
  th: {
    registerTitle: "ขอความร่วมมือก่อนการเข้าพัก",
    registerLead: "ลงทะเบียนรายชื่อผู้เข้าพัก (ทุกท่าน)",
    registerDue: "กรุณาดำเนินการภายใน {d}",
    registerBtn: "ลงทะเบียนรายชื่อผู้เข้าพัก",
    registerBody: "กฎหมายญี่ปุ่นกำหนดให้เราต้องเก็บข้อมูลของผู้เข้าพักทุกท่าน ผู้เข้าพักที่ไม่มีที่อยู่ในญี่ปุ่นต้องส่งรูปหนังสือเดินทางของทุกท่านด้วย",
    registerWarn: "เราจะส่งวิธีเข้าห้องพักหลังได้รับการลงทะเบียนแล้ว หากไม่ลงทะเบียน เราไม่สามารถส่งรหัสกล่องกุญแจให้ได้",
    subject: "[yah.homes] ยืนยันการจองของคุณแล้ว", greetSuffix: "",
    lead: "ขอบคุณที่จองที่พักกับ yah.homes การจองของคุณได้รับการยืนยันแล้ว",
    bookingNo: "หมายเลขการจอง", checkTitle: "รายละเอียดการจอง",
    checkin: "เช็คอิน", checkout: "เช็คเอาท์", stay: "การจองของคุณ", guestsRow: "ผู้เข้าพัก",
    house: "ที่พัก", arrival: "เวลาถึงโดยประมาณ", checkinWindow: "ตั้งแต่ {ci} (ไม่จำกัดเวลา)", checkoutWindow: "ก่อน {co}",
    nights: "{n} คืน", guests: "ผู้ใหญ่ {g} ท่าน",
    cancelTitle: "ค่าธรรมเนียมการยกเลิก", cancelFree: "ถึง {d}", cancelAfter: "ตั้งแต่ {d}", cancelNote: "กำหนดเวลาแสดงตามเวลาญี่ปุ่น (JST)", changeNote: "หากต้องการเปลี่ยนวันที่หรือจำนวนผู้เข้าพัก กรุณายกเลิกการจองนี้แล้วจองใหม่ (ภายในระยะเวลายกเลิกฟรีจะไม่มีค่าใช้จ่ายเพิ่ม) หากพ้นระยะเวลายกเลิกฟรีแล้ว กรุณาติดต่อผ่านข้อความใน My Page",
    payTitle: "การชำระเงิน", payTotal: "ราคารวม", payPaid: "ชำระแล้ว", payOnSite: "ชำระที่ที่พัก",
    payNote: "รวมค่าห้อง ภาษีที่พัก และค่าทำความสะอาดแล้ว ไม่มีค่าใช้จ่ายเพิ่มเติม",
    ctaTitle: "จัดการการจอง", cta: "เปลี่ยนแปลงหรือยกเลิกการจอง", cta2: "ส่งข้อความ",
    ctaNote: "เข้าสู่ระบบด้วยบัญชีที่ใช้จอง เพื่อระบุเวลาที่จะมาถึงหรือตรวจสอบการจอง",
    entryTitle: "การเข้าที่พัก",
    entryBody: "เช็คอินด้วยตนเองผ่านกล่องกุญแจที่หน้าประตู เราจะส่งรหัสและขั้นตอนการเข้าที่พักโดยละเอียดทางอีเมล 1 วันก่อนวันเข้าพัก มาถึงดึกก็ไม่มีปัญหา",
    placeTitle: "สถานที่", placeBtn: "เปิดแผนที่",
    placeNote: "ที่อยู่โดยละเอียดจะส่งพร้อมกับคำแนะนำการเช็คอิน",
    safetyTitle: "เพื่อความปลอดภัย",
    safetyBody: "เราจะไม่ส่งอีเมลหรือโทรขอให้คุณกรอกข้อมูลบัตรใหม่หรือชำระเงินเพิ่ม หากได้รับข้อความลักษณะนี้ กรุณาอย่าเปิดลิงก์และติดต่อเราตามด้านล่าง",
    contactTitle: "หากมีข้อสงสัย", contactBody: "กรุณาติดต่อเราผ่านข้อความใน My Page แต่ละการจองจะมีห้องสนทนาแยกกัน",
    footer: "yah.homes【Operated by AIRSTAR】",
  },
};

function buildConfirmationMail(
  lang: string,
  strings: Record<string, string>,
  d: { id: string; name: string; prop: string; checkin: string; checkout: string; nights: number; guests: number; total: number; arrival: string; freeCancel: string; checkinTime: string; checkoutTime: string; registerDeadline: string },
): { subject: string; text: string; html: string } {
  const L = strings;
  const P = MAIL_PROP[d.prop] ?? { name: d.prop, image: "", address: "", map: "" };
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
      ${row(esc(L.stay), esc(fixPlural(L.nights.replace("{n}", String(d.nights)))))}
      ${row(esc(L.guestsRow), esc(fixPlural(L.guests.replace("{g}", String(d.guests)))))}
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
        <a href="${esc(myPage)}#messages" style="display:block;padding:13px 24px;border:1px solid #d7d7d7;border-radius:6px;font-size:14px;font-weight:500;color:#111111;text-decoration:none;">${esc(L.cta2)}</a>
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
    `${L.stay}: ${fixPlural(L.nights.replace("{n}", String(d.nights)))}`,
    `${L.guestsRow}: ${fixPlural(L.guests.replace("{g}", String(d.guests)))}`,
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
    "", `${L.cta}: ${myPage}`, `${L.cta2}: ${myPage}#messages`,
    "", `--- ${L.entryTitle} ---`, L.entryBody,
    P.map ? `\n--- ${L.placeTitle} ---\n${P.address || L.placeNote}\n${P.map}` : "",
    "", `--- ${L.safetyTitle} ---`, L.safetyBody,
    "", L.contactBody, "", L.footer,
  ].filter((x) => x !== "").join("\n");

  return { subject: `${L.subject}（${d.checkin}〜${d.checkout}）`, text, html };
}

/** 予約確定メール（お客様宛・予約言語で送る）。失敗しても確定は取り消さない。 */
async function buildConfirmationMailFor(
  bookingId: string, b: BookingDoc & Record<string, unknown>,
): Promise<{ subject: string; text: string; html: string }> {
  {
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
    const P0 = MAIL_PROP[b.prop] ?? { name: String(b.prop), image: "", address: "", map: "" };
    const strings = expandMailVars(await mailStrings("confirm", lang), {
      guestName: String(b.name ?? ""), bookingNo: bookingId.slice(0, 8).toUpperCase(),
      propertyName: P0.name, guests: String(b.guests ?? ""),
      nights: String(Math.round((Date.parse(b.checkout) - Date.parse(b.checkin)) / 86400000)),
      checkin: String(b.checkin), checkout: String(b.checkout),
      checkinTime: ci, checkoutTime: co, registerDeadline,
      registerUrl: P0.register ?? "", mapUrl: P0.map ?? "", manualUrl: P0.manual ?? "",
      phone: OPERATOR_PHONE,
      myPageUrl: `${SITE_URL}/${lang === "en" ? "" : `${lang}/`}account/`,
    });
    const { subject, text, html } = buildConfirmationMail(lang, strings, {
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
    return { subject, text, html };
  }
}

/** 予約確定メール（お客様宛・予約言語で送る）。失敗しても確定は取り消さない。 */
/* 入室案内が定期ジョブに間に合わない予約かどうかを判定し、間に合わないなら即送る。
   ジョブ: 毎日10:00 JST に「翌日チェックイン」の予約へ送信（guestLifecycleMailer）。
   したがって「チェックイン前日の10:00」を過ぎて確定した予約は取りこぼす。 */
const REMINDER_JOB_HOUR_JST = 10;
function reminderJobMissed(checkin: string): boolean {
  const jobAt = Date.parse(`${checkin}T${String(REMINDER_JOB_HOUR_JST).padStart(2, "0")}:00:00+09:00`) - 86400000;
  return Date.now() > jobAt;
}
async function sendReminderIfLate(
  bookingId: string, ref: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const v = (await ref.get()).data() as (BookingDoc & Record<string, unknown>) | undefined;
  if (!v || v.status !== "CONFIRMED" || v.reminderSentAt) return;
  if (!reminderJobMissed(String(v.checkin))) return;   // ジョブが拾えるので任せる
  await sendLifecycleMail("reminder", bookingId, v);
  await ref.update({ reminderSentAt: FieldValue.serverTimestamp(), reminderSentImmediate: true });
  logger.info("late booking: reminder sent immediately", { bookingId, checkin: v.checkin });
}

/* 自動送信した案内を、その予約のスレッドにも残す（Airbnb と同じ形・2026-08-14 発注者指示）。
   お客様は My Page で、運営は /admin/messages で「何が届いているか」を1箇所で追える。
   見出しはメールの件名をそのまま使う（既に送信先の言語になっているため訳し直さない）。
   未読は増やさない（こちらから出した通知であって、返事を待つものではない）。
   失敗してもメール送信は成立させる（あくまで控え）。 */
async function mirrorMailToThread(
  bookingId: string, b: BookingDoc & Record<string, unknown>,
  kind: string, subject: string, text: string, html?: string,
): Promise<void> {
  try {
    await ensureThread(bookingId, b);
    const tref = db.collection("threads").doc(bookingId);
    const body = String(text ?? "").trim().slice(0, 4000);
    if (!body) return;
    const title = String(subject ?? "").trim().slice(0, 200);
    // HTML も残す。画面はこちらを優先して描く（表・ボタン・行間がそのまま出る）。
    // テキスト版は保険として必ず持つ（HTMLが欠けても内容は読める）。
    const htmlBody = String(html ?? "").slice(0, 400000);
    await tref.collection("messages").add({
      from: "host", system: true, mailKind: kind, title,
      body, ...(htmlBody ? { html: htmlBody } : {}),
      at: FieldValue.serverTimestamp(),
    });
    await tref.set({
      // 自動送信の控え。一覧では「運営」ではなく「自動送信」と出し、手で返信したものと区別する
      lastMessageAt: FieldValue.serverTimestamp(), lastFrom: "host", lastBody: title, lastSystem: true,
    }, { merge: true });
  } catch (err) {
    logger.warn("mirrorMailToThread failed", { bookingId, kind, err: String(err).slice(0, 160) });
  }
}

async function sendConfirmationMail(bookingId: string, b: BookingDoc & Record<string, unknown>): Promise<void> {
  let subj = "";
  try {
    const { subject, text, html } = await buildConfirmationMailFor(bookingId, b);
    subj = subject;
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });
    await transporter.sendMail({
      from: `"yah.homes" <${SMTP_USER.value()}>`,
      to: String(b.email), replyTo: "no-reply@mail.yah.homes",
      subject, text, html,
    });
    logMail("confirm", String(b.email), true, { bookingId, lang: String(b.lang ?? ""), subject: subj });
    await mirrorMailToThread(bookingId, b, "confirm", subject, text, html);
  } catch (err) {
    logger.error("sendConfirmationMail failed", err); // 送信失敗で予約は取り消さない
    logMail("confirm", String(b.email), false, { bookingId, lang: String(b.lang ?? ""), subject: subj, error: String(err) });
  }
}

const CANCEL_L10N: Record<string, Record<string, string>> = {
  ja: { subject: "【yah.homes】ご予約をキャンセルしました", greetSuffix: " 様", bookingNo: "予約番号",
    lead: "ご予約のキャンセルを承りました。", refundTitle: "ご返金",
    paid: "お支払い済み金額", fee: "キャンセル料", refund: "ご返金額",
    refundNote: "ご利用のカードへ返金処理を行います。カード会社の処理により、反映まで数日から1か月程度かかる場合があります。",
    noRefundNote: "キャンセル期限を過ぎているため、ご返金はありません。",
    again: "またのご利用をお待ちしております。日程を改めてのご予約はこちらから承ります。",
    cta: "空室を見る", contact: "ご不明な点は My Page のメッセージからご連絡ください。", footer: "yah.homes【Operated by AIRSTAR】" },
  en: { subject: "[yah.homes] Your booking has been cancelled", greetSuffix: "", bookingNo: "Booking ID",
    lead: "We have cancelled your booking.", refundTitle: "Refund",
    paid: "Paid", fee: "Cancellation fee", refund: "Refund",
    refundNote: "We are refunding to the card you used. Depending on your card issuer, it can take from a few days to about a month to appear.",
    noRefundNote: "The free cancellation deadline had passed, so no refund applies.",
    again: "We hope to welcome you another time. You can book new dates any time.",
    cta: "See availability", contact: "If you have any questions, message us from My Page.", footer: "yah.homes【Operated by AIRSTAR】" },
  ko: { subject: "[yah.homes] 예약이 취소되었습니다", greetSuffix: " 님", bookingNo: "예약번호",
    lead: "예약 취소를 접수했습니다.", refundTitle: "환불",
    paid: "결제 완료 금액", fee: "취소 수수료", refund: "환불 금액",
    refundNote: "사용하신 카드로 환불 처리됩니다. 카드사 처리에 따라 반영까지 며칠에서 한 달 정도 걸릴 수 있습니다.",
    noRefundNote: "무료 취소 기한이 지나 환불은 없습니다.",
    again: "다음 기회에 다시 모시겠습니다. 새로운 날짜로 언제든지 예약하실 수 있습니다.",
    cta: "빈방 보기", contact: "궁금하신 점은 My Page 메시지로 연락해 주세요.", footer: "yah.homes【Operated by AIRSTAR】" },
  zh: { subject: "【yah.homes】您的預訂已取消", greetSuffix: " 您好", bookingNo: "預訂編號",
    lead: "已受理您的預訂取消。", refundTitle: "退款",
    paid: "已付金額", fee: "取消費用", refund: "退款金額",
    refundNote: "將退款至您使用的信用卡。依發卡機構作業，反映時間可能需要數日至一個月左右。",
    noRefundNote: "已超過免費取消期限，故不予退款。",
    again: "期待再次為您服務，隨時歡迎重新選擇日期預訂。",
    cta: "查詢空房", contact: "如有任何問題，請透過 My Page 訊息與我們聯繫。", footer: "yah.homes【Operated by AIRSTAR】" },
  th: { subject: "[yah.homes] ยกเลิกการจองของคุณแล้ว", greetSuffix: "", bookingNo: "หมายเลขการจอง",
    lead: "เราได้ยกเลิกการจองของคุณแล้ว", refundTitle: "การคืนเงิน",
    paid: "ชำระแล้ว", fee: "ค่าธรรมเนียมการยกเลิก", refund: "จำนวนเงินคืน",
    refundNote: "เราจะคืนเงินไปยังบัตรที่คุณใช้ ขึ้นอยู่กับผู้ออกบัตร อาจใช้เวลาไม่กี่วันถึงประมาณหนึ่งเดือน",
    noRefundNote: "เลยกำหนดยกเลิกฟรีแล้ว จึงไม่มีการคืนเงิน",
    again: "หวังว่าจะได้ต้อนรับคุณอีกครั้ง คุณสามารถจองวันใหม่ได้ตลอดเวลา",
    cta: "ดูห้องว่าง", contact: "หากมีคำถาม กรุณาติดต่อเราผ่านข้อความใน My Page", footer: "yah.homes【Operated by AIRSTAR】" },
};

/** キャンセル確認メール（お客様宛・確定メールと同じカード構成）。失敗しても取消は成立させる。 */
async function buildCancellationMail(
  bookingId: string,
  b: BookingDoc & Record<string, unknown>,
  refundAmount: number,
): Promise<{ subject: string; text: string; html: string }> {
  {
    const lang = String(b.lang ?? "en");
    const P = MAIL_PROP[b.prop] ?? { name: b.prop, image: "", address: "", map: "" };
    const yen = (n: number) => `¥${Number(n).toLocaleString("en-US")}`;
    const no = bookingId.slice(0, 8).toUpperCase();
    const L = expandMailVars(await mailStrings("cancel", lang), {
      guestName: String(b.name ?? ""), bookingNo: no, propertyName: P.name,
      checkin: String(b.checkin), checkout: String(b.checkout),
      guests: String(b.guests ?? ""), phone: OPERATOR_PHONE,
      myPageUrl: `${SITE_URL}/${lang === "en" ? "" : `${lang}/`}account/`,
    });
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

    return { subject: L.subject, text, html };
  }
}

async function sendCancellationMail(
  bookingId: string,
  b: BookingDoc & Record<string, unknown>,
  refundAmount: number,
): Promise<void> {
  try {
    const { subject, text, html } = await buildCancellationMail(bookingId, b, refundAmount);
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });
    await transporter.sendMail({
      from: `"yah.homes" <${SMTP_USER.value()}>`,
      to: String(b.email), replyTo: "no-reply@mail.yah.homes",
      subject, text, html,
    });
    logMail("cancel", String(b.email), true, { bookingId, lang: String(b.lang ?? ""), subject });
    await mirrorMailToThread(bookingId, b, "cancel", subject, text, html);
  } catch (err) {
    logger.error("sendCancellationMail failed", err);
    logMail("cancel", String(b.email), false, { bookingId, lang: String(b.lang ?? ""), error: String(err) });
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
  { region: REGION, maxInstances: MAX_INSTANCES, secrets: [STRIPE_SECRET_KEY, BEDS24_WRITE_REFRESH, SMTP_USER, SMTP_PASS],
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
        // 1時間は短すぎた。3Dセキュアで弾かれた・席を外した程度で消え、
        // お客様は「予約できたのか分からない」まま問い合わせに回る。翌日まで残す。
        const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
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

        if (action === "profile") {
        // プロフィールの保存（任意入力・本人のみ）。予約時の初期値と緊急連絡に使う。
        const { profile } = (req.body ?? {}) as Record<string, unknown>;
        const p = (profile ?? {}) as Record<string, unknown>;
        const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
        const clean = {
          nameJa: str(p.nameJa, 60), nameRoman: str(p.nameRoman, 60),
          phone: str(p.phone, 30), phoneCc: str(p.phoneCc, 8), country: str(p.country, 60),
          // プロフィール写真。画面で 256px の JPEG に縮めてから送られる。
          // Storage を開けずに済ませるため Firestore に持たせる（1件20KB前後）。
          // 形式と上限を必ずサーバで見る（任意のデータURLを詰め込ませない）。
          photo: (() => {
            const v = String(p.photo ?? "");
            if (!v) return "";
            return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 200000 ? v : "";
          })(),
          birthday: /^\d{4}-\d{2}-\d{2}$/.test(String(p.birthday ?? "")) ? String(p.birthday) : "",
          lang: ["ja", "en", "ko", "zh", "th"].includes(String(p.lang)) ? String(p.lang) : "",
          updatedAt: FieldValue.serverTimestamp(),
        };
        await db.collection("guest_profiles").doc(uid).set(clean, { merge: true });
        res.status(200).json({ ok: true });
        return;
      }

        const idStr = typeof bookingId === "string" ? bookingId : "";
        if (!idStr || (action !== "arrival" && action !== "cancel")) {
          res.status(400).json({ ok: false, error: "invalid_input" }); return;
        }

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
              await noteBeds24(Number(v.beds24Id),
                `【直販】お客様がMy Pageからキャンセルしました（${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）\n` +
                `予約ID: ${idStr}／${v.checkin}〜${v.checkout}／${v.name}様\n` +
                `返金処理はyah.homes側で自動実行します。Beds24での操作は不要です。`);
              await noteBeds24Cancellation(Number(v.beds24Id),
                `【直販】お客様ご自身でキャンセル（公式サイト My Page）。返金処理も自動で実行済み。予約 ${idStr.slice(0, 8).toUpperCase()}／対応不要です。`);
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

          // GA4 の purchase を相殺する（Google Ads の入札が幻のCVを学習しないように）
          await sendRefundEvent({
            id: idStr, uid: String(v.uid ?? ""), total: Number(v.total ?? 0),
            refundAmount, clientId: String(v.clientId ?? ""), sessionId: String(v.sessionId ?? ""),
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


        // ── セルフキャンセル（v5 §5-3 / spec_self_cancel_202608.md）──
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
  { region: REGION, maxInstances: MAX_INSTANCES, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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
    const isRoot = isAdmin(email);

    try {
      if (req.method === "GET") {
        const snap = await db.collection("admin_users").get();
        const items = snap.docs.map((d) => {
          const v = d.data();
          const root = isAdmin(d.id);
          return { email: d.id, name: root && !v.name ? "オーナー" : (v.name ?? ""),
            // root は台帳の値に関わらず owner 表示（実権限もコード側で owner 固定）
            role: root ? "owner" : v.role === "owner" ? "owner" : v.role === "admin" ? "admin" : "operator",
            notifyPartners: v.notifyPartners === true, notifyTeiten: v.notifyTeiten === true,
            notifyBookings: v.notifyBookings === true, isRootUser: root };
        });
        // オーナーは台帳に無くても1行出す（重複させない・通知の宛先として扱えるように）
        for (const a of ADMIN_EMAILS) {
          if (!items.some((x) => x.email === a)) {
            items.push({ email: a, name: "オーナー", role: "owner",
              notifyPartners: false, notifyTeiten: false, notifyBookings: false, isRootUser: true });
          }
        }
        res.status(200).json({ ok: true, root: ADMIN_EMAILS, isRoot, actorRole: await getRole(email), items });
        return;
      }

      if (req.method === "POST") {
        /* 台帳の操作は「自分より下のロールに対してだけ」許す（2026-08-16 発注者指示）。
             Owner … 誰でも（root を除く）追加・変更・削除できる
             Admin … Operator の追加・変更・削除のみ。Admin/Owner を作れず、
                     既存メンバーを Admin/Owner に上げることもできない
           これで Admin が自分を Owner に昇格させる・同格を消す、という穴を塞ぐ。 */
        const actorRole = await getRole(email);
        if (actorRole !== "owner" && actorRole !== "admin") {
          res.status(403).json({ ok: false, error: "admin_only" }); return;
        }
        const { action, email: target, name, role, notifyPartners, notifyTeiten, notifyBookings } =
          (req.body ?? {}) as Record<string, unknown>;
        const targetStr = typeof target === "string" ? target.trim().toLowerCase() : "";
        if (!isSafeEmail(targetStr)) { res.status(400).json({ ok: false, error: "invalid_email" }); return; }
        if (actorRole === "admin") {
          if (isAdmin(targetStr)) { res.status(403).json({ ok: false, error: "owner_only" }); return; }
          const existing = await getAdminUser(targetStr);
          const existingRole = existing ? (existing.role === "owner" ? "owner" : existing.role === "admin" ? "admin" : "operator") : null;
          if (existingRole && existingRole !== "operator") { res.status(403).json({ ok: false, error: "owner_only" }); return; }
          if (action !== "delete" && role !== "operator" && role !== undefined) {
            res.status(403).json({ ok: false, error: "owner_only" }); return;
          }
        }

        const ref = db.collection("admin_users").doc(targetStr);

        /* オーナー自身の行は「通知の宛先」としてだけ編集できる。
           権限（role）はコード側の ADMIN_EMAILS が正なので触らせない。削除もさせない
           ＝ 台帳をいくら操作しても自分を締め出せない。 */
        if (isAdmin(targetStr)) {
          if (action === "delete") { res.status(400).json({ ok: false, error: "root_protected" }); return; }
          await ref.set({
            role: "owner",
            notifyPartners: notifyPartners === true,
            notifyTeiten: notifyTeiten === true,
            notifyBookings: notifyBookings === true,
            updatedAt: FieldValue.serverTimestamp(), updatedBy: email,
          }, { merge: true });
          await db.collection("audit_logs").add({
            actor: email, action: "admin_user_notify_update", target: targetStr, at: FieldValue.serverTimestamp(),
          });
          res.status(200).json({ ok: true });
          return;
        }

        if (action === "delete") {
          await ref.delete();
          await db.collection("audit_logs").add({ actor: email, action: "admin_user_delete", target: targetStr, at: FieldValue.serverTimestamp() });
          res.status(200).json({ ok: true });
          return;
        }
        const exists = (await ref.get()).exists;
        await ref.set({
          name: typeof name === "string" ? name.trim().slice(0, 100) : "",
          role: role === "owner" ? "owner" : role === "admin" ? "admin" : "operator",
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
  { region: REGION, maxInstances: MAX_INSTANCES, secrets: [STRIPE_SECRET_KEY, BEDS24_WRITE_REFRESH, SMTP_USER, SMTP_PASS], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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
    const isRoot = isAdmin(email);

    try {
      if (req.method === "GET") {
        /* ?id= 指定は予約詳細（/admin/booking/）用。予約の全容＋送信済みメールを1回で返す */
        const detailId = String(req.query.id ?? "");
        if (detailId) {
          const doc = await db.collection("bookings").doc(detailId).get();
          if (!doc.exists) { res.status(404).json({ ok: false, error: "not_found" }); return; }
          const v = doc.data() as Record<string, unknown>;
          const mailsSnap = await db.collection("mail_logs").where("bookingId", "==", detailId).get();
          const mails = mailsSnap.docs
            .map((d) => { const m = d.data(); return { kind: m.kind, ok: m.ok === true, subject: m.subject ?? "", at: m.at?.toMillis?.() ?? 0 }; })
            .sort((a, b) => a.at - b.at);
          res.status(200).json({ ok: true, isRoot,
            booking: {
              id: doc.id, prop: v.prop, checkin: v.checkin, checkout: v.checkout, guests: v.guests,
              total: v.total, status: v.status, name: v.name ?? null, email: v.email ?? null,
              phone: v.phone ?? null, lang: v.lang ?? null, arrival: v.arrival ?? null,
              freeCancelUntilAt: v.freeCancelUntilAt ?? null,
              createdAt: (v.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null,
              needsAction: v.needsAction === true, adminMemo: v.adminMemo ?? null,
              failureReason: v.failureReason ?? null, beds24Id: v.beds24Id ?? null,
              paymentIntentId: v.paymentIntentId ? true : false,   // 存在の有無だけ（IDそのものは返さない）
            },
            mails });
          return;
        }
        const snap = await db.collection("bookings").orderBy("createdAt", "desc").limit(200).get();
        const items = snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id, prop: v.prop, checkin: v.checkin, checkout: v.checkout, guests: v.guests,
            total: v.total, status: v.status, name: v.name ?? null, email: v.email ?? null,
            needsAction: v.needsAction === true, adminMemo: v.adminMemo ?? null,
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
        const { flag, action, bookingId, memo, amount } = (req.body ?? {}) as Record<string, unknown>;
        const idStr = typeof bookingId === "string" ? bookingId : "";
        if (!idStr) { res.status(400).json({ ok: false, error: "invalid_input" }); return; }
        const ref = db.collection("bookings").doc(idStr);
        const snap = await ref.get();
        const v = snap.data();
        if (!v) { res.status(404).json({ ok: false, error: "not_found" }); return; }

        /* システム印（MANUAL_REVIEW / CAPTURE_RETRY）の手動解決。
           これらは決済・返金の失敗で自動的に立つ状態で、手動チェックを外しても消えない。
           解決手段が無いと「要対応」に永久に居座る（2026-08-16 実例: テストキーで決済した
           予約を本番キーで返金しようとして失敗し MANUAL_REVIEW になった）。
           金銭は動かさない。返金が要るなら先に「返金する」を使い、そのあとここで状態を畳む。
           日々の対応者が塞げないと意味がないので Operator まで可（発注者判断）。 */
        if (action === "resolve") {
          const to = String((req.body as Record<string, unknown>)?.to ?? "");
          const why = String((req.body as Record<string, unknown>)?.reason ?? "").trim();
          if (!["CANCELLED", "CONFIRMED"].includes(to)) { res.status(400).json({ ok: false, error: "invalid_to" }); return; }
          if (!why) { res.status(400).json({ ok: false, error: "reason_required" }); return; }
          if (!["MANUAL_REVIEW", "CAPTURE_RETRY"].includes(String(v.status))) {
            // 正常な予約の状態を書き換える口にはしない
            res.status(400).json({ ok: false, error: "not_resolvable" }); return;
          }
          await ref.update({
            status: to,
            needsAction: false,
            resolvedBy: email,
            resolvedAt: FieldValue.serverTimestamp(),
            resolveReason: why.slice(0, 500),
            updatedAt: FieldValue.serverTimestamp(),
          });
          await db.collection("audit_logs").add({
            actor: email, action: "booking_resolve", target: idStr,
            value: `${String(v.status)} → ${to} / ${why.slice(0, 200)}`,
            at: FieldValue.serverTimestamp(),
          });
          res.status(200).json({ ok: true });
          return;
        }

        // 対応メモ（台帳メンバー可）
        if (action === "flag") {
          // 手動の「要対応」印。システム印（MANUAL_REVIEW等）とは独立に、人が立てて人が消す
          await ref.update({ needsAction: flag === true, updatedAt: FieldValue.serverTimestamp() });
          await db.collection("audit_logs").add({ actor: email, action: flag === true ? "booking_flag_on" : "booking_flag_off", target: idStr, at: FieldValue.serverTimestamp() });
          res.status(200).json({ ok: true });
          return;
        }

        if (action === "memo") {
          await ref.update({ adminMemo: typeof memo === "string" ? memo.slice(0, 2000) : "", updatedAt: FieldValue.serverTimestamp() });
          await db.collection("audit_logs").add({ actor: email, action: "booking_memo", target: idStr, at: FieldValue.serverTimestamp() });
          res.status(200).json({ ok: true });
          return;
        }

        // 返金（rootオーナーのみ・v4 §8-5）
        if (action === "refund") {
          if (await requireAdmin(email, res)) return;
          if (!v.paymentIntentId) { res.status(400).json({ ok: false, error: "no_payment" }); return; }
          const amt = Number(amount);
          const refundAmount = Number.isInteger(amt) && amt > 0 && amt <= v.total ? amt : v.total;
          const stripe = stripeClient();
          const pi = await stripe.paymentIntents.retrieve(String(v.paymentIntentId));
          // 未決済（下書き）には返せるお金が無い。UI 側でもボタンを出さないが、二重の防御
          if (["requires_payment_method", "requires_confirmation", "requires_action", "canceled"].includes(pi.status)) {
            res.status(400).json({ ok: false, error: "no_charge" }); return;
          }
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
              await noteBeds24(Number(v.beds24Id),
                `【直販】管理画面から返金・キャンセルしました（${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）\n` +
                `予約ID: ${idStr}／${v.checkin}〜${v.checkout}／${v.name}様\n` +
                `返金額: ¥${Number(refundAmount).toLocaleString("en-US")}（実行者 ${email}）\n` +
                `お客様にはキャンセル確認メールを送信済みです。`);
              await noteBeds24Cancellation(Number(v.beds24Id),
                `【直販】運営がキャンセル・返金（¥${Number(refundAmount).toLocaleString("en-US")}）を実行。予約 ${idStr.slice(0, 8).toUpperCase()}／対応不要です。`);
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

          // GA4 の purchase を相殺する（Google Ads の入札が幻のCVを学習しないように）
          await sendRefundEvent({
            id: idStr, uid: String(v.uid ?? ""), total: Number(v.total ?? 0),
            refundAmount, clientId: String(v.clientId ?? ""), sessionId: String(v.sessionId ?? ""),
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
  { region: REGION, maxInstances: MAX_INSTANCES, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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
    if (requireOwner(email, res)) return;

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
          // 同上。公開コレクションなので updatedBy は持たせない
          await db.collection("property_facts").doc("meta").set({ ratingAsOf, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
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
        // 直販の予約ルール（bookCreate が読む。未設定なら既定値で動く）
        {
          const t = String(v.bookingCutoffTime ?? "").trim();
          if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) { res.status(400).json({ ok: false, error: "invalid_bookingCutoffTime" }); return; }
          if (t) doc.bookingCutoffTime = t;
          const dRaw = String(v.bookingCutoffDays ?? "").trim();
          if (dRaw) {
            const dNum = Number(dRaw);
            // 0＝当日まで受ける。前日10:00の案内メールに乗らないので、当日は別途の即時送信が要る。
            if (!Number.isInteger(dNum) || dNum < 0 || dNum > 90) { res.status(400).json({ ok: false, error: "invalid_bookingCutoffDays" }); return; }
            doc.bookingCutoffDays = dNum;
          }
          const mRaw = String(v.bookingMaxMonths ?? "").trim();
          if (mRaw) {
            const m = Number(mRaw);
            if (!Number.isInteger(m) || m < 1 || m > 36) { res.status(400).json({ ok: false, error: "invalid_bookingMaxMonths" }); return; }
            doc.bookingMaxMonths = m;
          }
          const fcRaw = String(v.freeCancelDays ?? "").trim();
          if (fcRaw !== "") {
            const fc = Number(fcRaw);
            if (!Number.isInteger(fc) || fc < 0 || fc > 90) { res.status(400).json({ ok: false, error: "invalid_freeCancelDays" }); return; }
            doc.freeCancelDays = fc;
          }
        }
        for (const f of ["checkinTime", "checkoutTime"] as const) {
          const t = String(v[f] ?? "").trim();
          if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) { res.status(400).json({ ok: false, error: `invalid_${f}` }); return; }
          if (t) doc[f] = t;
        }
        // 受付終了は空文字を許す（＝受付終了なし）。空でも書き込み、クリアできるようにする
        if (v.checkinEndTime !== undefined) {
          const t = String(v.checkinEndTime ?? "").trim();
          if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) { res.status(400).json({ ok: false, error: "invalid_checkinEndTime" }); return; }
          doc.checkinEndTime = t;
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
        // updatedBy は書かない。property_facts は公開読み取り（サイト表示用）のため、
        // 書くと管理者のメールアドレスが world-readable になる。
        // 「誰が更新したか」は下の audit_logs に残るので情報は失われない。

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
  { region: REGION, maxInstances: MAX_INSTANCES, secrets: [GITHUB_DISPATCH_TOKEN], serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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
    if (await requireAdmin(email, res)) return;

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
  { region: REGION, maxInstances: MAX_INSTANCES, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
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

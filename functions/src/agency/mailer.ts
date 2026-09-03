/**
 * Gmail 送受信の口 — 業者ディスパッチ仕様書 §4
 *
 * ai.yamada@bonfire.co.jp の受信箱をAIの作業場として使う（ドメイン全体の委任）。
 * 人はいつでもGmailを開いて全やり取りを読め、自分で返信もできる。
 *
 * 安全装置:
 *  - ドライラン中は send() が「下書き作成」に落ちる（agency/settings/dispatch.autoSend）
 *  - キルスイッチ = autoSend を false に戻すだけで即・下書きモード
 *  - 鍵ファイルは持たない（Functions の実行SAに委任させる）
 */
// Gmail だけを使うので Gmail 専用パッケージにする（2026-09-03）。
// googleapis 全部入りは 209MB あり、Cloud Build が毎回それを取得・展開するため
// Functions のデプロイが目に見えて遅くなっていた。@googleapis/gmail は 1.1MB。
import { gmail as gmailApi } from "@googleapis/gmail";
import { JWT } from "google-auth-library";
import { dispatchSettings, notifySettings } from "./settings.js";

export const AI_ADDRESS = "ai.yamada@bonfire.co.jp";
export const AI_DISPLAY = "yah. 自動手配（AI）";
/** AIの送信は必ずここにCCする（2026-08-19 発注者指示）。
    人が全ての送信をリアルタイムで見られる状態を構造として保証する。外せない。 */
export const ALWAYS_CC = "kazuyoshi.yamada@bonfire.co.jp";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

/* Gmailの認証だけは Workspace のドメイン全体委任が要る（Firestoreの権限とは別物）。
   委任を登録したのは agency-mailer SA なので、その鍵を Secret Manager から受け取る。
   鍵はコード・リポジトリに置かない（環境変数 AGENCY_MAILER_KEY で注入）。 */
let cachedGmail: ReturnType<typeof gmailApi> | null = null;
export function gmailAuthFromKey(keyJson: string) {
  const key = JSON.parse(keyJson) as { client_email: string; private_key: string };
  return new JWT({ email: key.client_email, key: key.private_key, scopes: SCOPES, subject: AI_ADDRESS });
}
async function gmailClient() {
  if (cachedGmail) return cachedGmail;
  const keyJson = process.env.AGENCY_MAILER_KEY;
  if (!keyJson) throw new Error("AGENCY_MAILER_KEY が未設定です（Gmailの委任鍵・Secret Manager から注入する）");
  cachedGmail = gmailApi({ version: "v1", auth: gmailAuthFromKey(keyJson) as never });
  return cachedGmail;
}

/** 自動送信が解禁されているか（既定は false = ドライラン・読めない時も false） */
export async function autoSendEnabled(): Promise<boolean> {
  return (await dispatchSettings()).autoSend;
}

const b64 = (s: string) => Buffer.from(s).toString("base64");
const subjectEnc = (s: string) => `=?UTF-8?B?${b64(s)}?=`;

function buildRaw(to: string, subject: string, body: string, threadRef?: string, cc = ALWAYS_CC, html?: string, fromDisplay = AI_DISPLAY): string {
  const headers = [
    `From: ${subjectEnc(fromDisplay)} <${AI_ADDRESS}>`,
    `To: ${to}`,
    /* CC は必須・省略不可（AIの送信は必ず人にも届く）。
       ただし宛先が本人の場合だけは重複するので落とす（同じ人に2通見えるのを防ぐ）。 */
    ...(to.includes(cc) ? [] : [`Cc: ${cc}`]),
    `Subject: ${subjectEnc(subject)}`,
    "MIME-Version: 1.0",
    html ? 'Content-Type: text/html; charset="UTF-8"' : 'Content-Type: text/plain; charset="UTF-8"',
    ...(threadRef ? [`In-Reply-To: ${threadRef}`, `References: ${threadRef}`] : []),
  ];
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${html ?? body}`).toString("base64url");
}

/**
 * 送信（またはドライラン時は下書き作成）。
 * 戻り値の mode で、実際にどちらをしたかが分かる（記録・画面表示に使う）。
 */
/** 通知の直送（オーナー・関係者宛て）。autoSend のゲートを通らない——
    業者へのAI発信ではなく「起きた事実の通知」のため。ゲートに掛けると下書きに眠って
    誰にも届かない（2026-08-25 植栽の日程通知が届かず発覚） */
export async function sendNotice(opts: { to: string; subject: string; body: string; html?: string }): Promise<string> {
  const gmail = await gmailClient();
  /* 通知の表示名は yah.OS（2026-08-25 発注者指示）。業者向け依頼メールの表示名（AI_DISPLAY）とは分ける */
  const raw = buildRaw(opts.to, opts.subject, opts.body, undefined, undefined, opts.html, "yah.OS 自動配信");
  const r = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return r.data.id!;
}

export async function sendOrDraft(opts: {
  to: string; subject: string; body: string; threadId?: string; threadRef?: string;
}): Promise<{ mode: "sent" | "draft"; id: string; threadId?: string; cc: string }> {
  const gmail = await gmailClient();
  const cc = (await notifySettings()).alwaysCc || ALWAYS_CC;
  const raw = buildRaw(opts.to, opts.subject, opts.body, opts.threadRef, cc);
  const message = { raw, ...(opts.threadId ? { threadId: opts.threadId } : {}) };

  if (await autoSendEnabled()) {
    const r = await gmail.users.messages.send({ userId: "me", requestBody: message });
    return { mode: "sent", id: r.data.id!, threadId: r.data.threadId ?? undefined, cc };
  }
  const r = await gmail.users.drafts.create({ userId: "me", requestBody: { message } });
  return { mode: "draft", id: r.data.id!, threadId: r.data.message?.threadId ?? undefined, cc };
}

/** 依頼メールの文面（作業依頼・日程の相談）。AIらしさを隠さず、緊急時は人へ引き継ぐと明記する */
export function requestMailBody(o: {
  vendorContact?: string; vendorName: string; propLabel: string; title: string;
  dueMonth: string; address?: string; jobId: string;
}): { subject: string; body: string } {
  const [y, m] = o.dueMonth.split("-");
  const subject = `[yah-${o.jobId}] ${o.propLabel} ${o.title}のご依頼（${y}年${Number(m)}月）`;
  const body = [
    `${o.vendorName}${o.vendorContact ? ` ${o.vendorContact}様` : " ご担当者様"}`,
    "",
    "いつもお世話になっております。yah.homes の自動手配システムです。",
    `${y}年${Number(m)}月に、下記の作業をお願いしたくご連絡いたしました。`,
    "",
    `　作業内容: ${o.title}`,
    `　対象施設: ${o.propLabel}`,
    ...(o.address ? [`　所在地　: ${o.address}`] : []),
    `　実施希望: ${y}年${Number(m)}月中`,
    "",
    "ご都合のよい日程を、このメールへの返信でお知らせいただけますでしょうか。",
    "候補日をいくつかいただければ、こちらで確定してご連絡いたします。",
    "",
    "※このメールは yah.homes の自動手配システム（AI）が送信しています。",
    "　ご返信は自動で処理され、判断が必要な内容は担当者へ引き継ぎます。",
    "　お急ぎの場合は 050-1721-4419 までお電話ください。",
    "",
    "yah.homes 自動手配システム（AI）",
    `${AI_ADDRESS}`,
  ].join("\n");
  return { subject, body };
}

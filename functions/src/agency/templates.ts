/**
 * 業者向けメールの定型文 — 正本は agency DB の mailTemplates（画面から編集する）
 *
 * コードには「初期値」だけを置き、運用中の文面は Firestore が正本。
 * 差し込み記号は {{name}} 形式で、許可リスト外は保存時に弾く（誤記で本文が空になる事故を防ぐ）。
 */
import { agencyDb } from "./engine.js";

export type TemplateKey =
  | "request"        // 作業の依頼・日程相談
  | "confirm"        // 日程確定の連絡
  | "reschedule"     // 代替日の提案
  | "reminder"       // 前日リマインド
  | "chase"          // 完了報告の催促
  | "thanks"         // 完了のお礼
  | "portalSelect"     // 業者ポータル: 日程を選択（オーナー・運営会社への通知）
  | "portalUnselect"   // 業者ポータル: 日程を取消
  | "portalReport";    // 業者ポータル: 完了報告

/** 本文で使える差し込み記号。ここに無いものは保存時にエラーにする */
export const TEMPLATE_VARS = [
  "vendorName", "vendorContact", "propLabel", "address", "vendorPhone", "legalName",
  "title", "dueYear", "dueMonth", "confirmedAt", "candidates",
  "jobId", "aiAddress",
  "plantingDate", "reportText", "photoCount", "workLabel",   // 業者ポータルの通知（2026-08-25）
] as const;

export interface MailTemplate {
  label: string;        // 画面に出す名前
  subject: string;
  body: string;
  note?: string;        // 編集者向けの補足
  updatedAt?: string;
}

/** 初期値（Firestore に無い場合のシード。運用開始後は画面の値が正本） */
/* 植栽の通知3種は DEFAULT_TEMPLATES の末尾に追記（下の const 内） */
export const DEFAULT_TEMPLATES: Record<TemplateKey, MailTemplate> = {
  request: {
    label: "作業の依頼（日程の相談）",
    subject: "[yah-{{jobId}}] {{propLabel}} {{title}}のご依頼（{{dueYear}}年{{dueMonth}}月）",
    note: "周期マスタから起票された作業を、業者へ最初に依頼するメール",
    body: [
      "{{vendorName}} {{vendorContact}}様",
      "",
      "いつもお世話になっております。ボンファイア株式会社（yah.homes 運営）の自動手配システムです。",
      "{{dueYear}}年{{dueMonth}}月に、下記の作業をお願いしたくご連絡いたしました。",
      "",
      "　作業内容: {{title}}",
      "　対象施設: {{propLabel}}",
      "　実施希望: {{dueYear}}年{{dueMonth}}月中",
      "",
      "ご都合のよい日程を、このメールへの返信でお知らせいただけますでしょうか。",
      "候補日をいくつかいただければ、こちらで確定してご連絡いたします。",
      "",
      "※このメールはボンファイア株式会社の自動手配システム（AI）が送信しています。",
      "　ご返信は自動で処理され、判断が必要な内容は担当者へ引き継ぎます。",
      "　お急ぎの場合は {{vendorPhone}} までお電話ください。",
      "",
      "ボンファイア株式会社　自動手配システム（AI）",
      "{{aiAddress}}",
    ].join("\n"),
  },
  confirm: {
    label: "日程確定の連絡",
    subject: "[yah-{{jobId}}] {{propLabel}} {{title}} {{confirmedAt}}で確定しました",
    body: [
      "{{vendorName}} {{vendorContact}}様",
      "",
      "ご連絡ありがとうございます。下記で確定いたしました。",
      "",
      "　作業内容: {{title}}",
      "　対象施設: {{propLabel}}",
      "　実施日時: {{confirmedAt}}",
      "",
      "前日にリマインドをお送りします。作業後は、完了のご報告と写真をこのメールへの返信で",
      "お送りいただけますと助かります。",
      "",
      "よろしくお願いいたします。",
      "",
      "ボンファイア株式会社　自動手配システム（AI）",
    ].join("\n"),
  },
  reschedule: {
    label: "代替日の提案",
    subject: "[yah-{{jobId}}] {{propLabel}} {{title}} 日程のご相談",
    body: [
      "{{vendorName}} {{vendorContact}}様",
      "",
      "ご連絡ありがとうございます。恐れ入りますが、下記の候補ではいかがでしょうか。",
      "",
      "{{candidates}}",
      "",
      "ご都合のよいものをお知らせください。いずれも難しい場合は、ご希望の日程をお知らせいただければ調整いたします。",
      "",
      "ボンファイア株式会社　自動手配システム（AI）",
    ].join("\n"),
  },
  reminder: {
    label: "前日リマインド",
    subject: "[yah-{{jobId}}] 明日 {{propLabel}} {{title}} をお願いいたします",
    body: [
      "{{vendorName}} {{vendorContact}}様",
      "",
      "明日 {{confirmedAt}} に下記の作業をお願いしております。",
      "",
      "　作業内容: {{title}}",
      "　対象施設: {{propLabel}}",
      "",
      "よろしくお願いいたします。作業後は完了のご報告と写真をお送りください。",
      "",
      "ボンファイア株式会社　自動手配システム（AI）",
    ].join("\n"),
  },
  chase: {
    label: "完了報告の催促",
    subject: "[yah-{{jobId}}] {{propLabel}} {{title}} 完了のご報告について",
    body: [
      "{{vendorName}} {{vendorContact}}様",
      "",
      "先日お願いしておりました下記の作業について、完了のご報告をお待ちしております。",
      "",
      "　作業内容: {{title}}",
      "　対象施設: {{propLabel}}",
      "　実施予定: {{confirmedAt}}",
      "",
      "お手数ですが、作業の状況と写真をこのメールへの返信でお知らせください。",
      "",
      "ボンファイア株式会社　自動手配システム（AI）",
    ].join("\n"),
  },
  thanks: {
    label: "完了のお礼",
    subject: "[yah-{{jobId}}] {{propLabel}} {{title}} ありがとうございました",
    body: [
      "{{vendorName}} {{vendorContact}}様",
      "",
      "作業とご報告をありがとうございました。確認いたしました。",
      "引き続きよろしくお願いいたします。",
      "",
      "ボンファイア株式会社　自動手配システム（AI）",
    ].join("\n"),
  },
  portalSelect: {
    label: "ポータル: {{workLabel}}の日程が入りました",
    subject: "[yah-{{jobId}}] {{workLabel}}の日程が入りました: {{propLabel}} {{plantingDate}}",
    note: "業者がカレンダーで日を選んだときに、オーナーと運営会社へ飛ぶ通知",
    body: [
      "業者（{{vendorName}}）が{{workLabel}}の日程を選択しました。",
      "",
      "　棟: {{propLabel}}",
      "　日付: {{plantingDate}}",
      "　時間: 11:00〜15:00",
      "",
      "自動確定です。都合が悪ければメンテナンスカード（yah.OS）でこのジョブを取り消してください。",
    ].join("\n"),
  },
  portalUnselect: {
    label: "ポータル: {{workLabel}}の日程が取り消されました",
    subject: "[yah-{{jobId}}] {{workLabel}}の日程が取り消されました: {{propLabel}} {{plantingDate}}",
    note: "業者がカレンダーで自分の選択を取り消したときの通知。日付は空きに戻る",
    body: [
      "業者（{{vendorName}}）が{{workLabel}}の日程を取り消しました。",
      "",
      "　棟: {{propLabel}}",
      "　日付: {{plantingDate}}（空きに戻りました）",
    ].join("\n"),
  },
  portalReport: {
    label: "ポータル: {{workLabel}}の完了報告",
    subject: "[yah-{{jobId}}] {{workLabel}}の完了報告: {{propLabel}} {{plantingDate}}",
    note: "業者の完了報告。検収（実施日・実額の確定）はメンテナンスカードで",
    body: [
      "業者から{{workLabel}}の完了報告が届きました。",
      "",
      "　棟: {{propLabel}}",
      "　日付: {{plantingDate}}",
      "　内容: {{reportText}}",
      "　写真: {{photoCount}}枚（保管庫に保存済み）",
      "",
      "検収（実施日・実額の確定）はメンテナンスカードでお願いします。",
    ].join("\n"),
  },
};

/** Firestore の文面を読む（無ければ初期値。片方だけ編集されていても動く） */
export async function loadTemplate(key: TemplateKey): Promise<MailTemplate> {
  const doc = await agencyDb().collection("mailTemplates").doc(key).get();
  const saved = doc.data() as Partial<MailTemplate> | undefined;
  const def = DEFAULT_TEMPLATES[key];
  return { ...def, ...(saved ?? {}) };
}

/** {{var}} を差し込む。未知の記号は空にせず、そのまま残して気づけるようにする */
export function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : m);
}

/** 保存時の検証: 許可外の差し込み記号を弾く（画面から呼ぶ） */
export function validateTemplate(t: { subject: string; body: string }): { ok: true } | { ok: false; unknown: string[] } {
  const used = [...`${t.subject}\n${t.body}`.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
  const unknown = [...new Set(used)].filter((v) => !TEMPLATE_VARS.includes(v as never));
  return unknown.length ? { ok: false, unknown } : { ok: true };
}

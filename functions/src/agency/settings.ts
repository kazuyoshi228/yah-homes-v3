/**
 * Agency の設定 — 正本は agency/settings（画面「Agency設定」から編集）
 *
 * コードに既定値は持つが、それは「SSoTを読めなかったときに安全側へ倒す」ためのもので、
 * 通常は Firestore の値が使われる。安全側 = 自動送信しない・確信度の要求を緩めない。
 */
import { agencyDb } from "./engine.js";

export interface DispatchSettings {
  autoSend: boolean;              // キルスイッチ。false = ドライラン（下書きまで）
  confidenceFloor: number;        // これ未満のAI読解は人へ
  alertStatutoryDays: number;     // 法定作業の未確定アラート（期日の何日前から）
  alertNormalDays: number;        // 任意作業の同上
  alertOverdueCriticalDays: number; // 期日超過が何日を超えたら最上級か
}
export interface NotifySettings {
  exceptionsTo: string;           // 例外・アラートの通知先
  alwaysCc: string;               // AI送信の必須CC（画面では変更不可として扱う）
  aiAddress: string;
}
export interface Contacts {
  legalName: string; brand: string;
  vendorPhone: string;            // 業者向け（非公開）
  vendorPhoneLabel?: string;
}

/** 読めないときは自動送信しない側へ倒す（fail-closed） */
const SAFE_DISPATCH: DispatchSettings = {
  autoSend: false, confidenceFloor: 0.75,
  alertStatutoryDays: 30, alertNormalDays: 7, alertOverdueCriticalDays: 14,
};

export async function dispatchSettings(): Promise<DispatchSettings> {
  try {
    const d = (await agencyDb().collection("settings").doc("dispatch").get()).data() as Partial<DispatchSettings> | undefined;
    return { ...SAFE_DISPATCH, ...(d ?? {}), autoSend: d?.autoSend === true };
  } catch { return SAFE_DISPATCH; }
}

export async function notifySettings(): Promise<NotifySettings> {
  const d = (await agencyDb().collection("settings").doc("notify").get()).data() as Partial<NotifySettings> | undefined;
  return {
    exceptionsTo: d?.exceptionsTo ?? "kazuyoshi.yamada@bonfire.co.jp",
    alwaysCc: d?.alwaysCc ?? "kazuyoshi.yamada@bonfire.co.jp",
    aiAddress: d?.aiAddress ?? "ai.yamada@bonfire.co.jp",
  };
}

export async function contacts(): Promise<Contacts> {
  const d = (await agencyDb().collection("settings").doc("contacts").get()).data() as Partial<Contacts> | undefined;
  return {
    legalName: d?.legalName ?? "ボンファイア株式会社",
    brand: d?.brand ?? "yah.homes",
    vendorPhone: d?.vendorPhone ?? "",
    vendorPhoneLabel: d?.vendorPhoneLabel,
  };
}

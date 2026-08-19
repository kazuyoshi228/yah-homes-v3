/**
 * Agency（OS SSoT）のデータモデル — 業者ディスパッチ仕様書 §2
 *
 * 置き場: Firestore 名前付きDB `agency`（クライアント直アクセス全面拒否・Functions経由のみ）。
 * 履歴は append-only（jobs は削除・上書きしない）。証跡は Storage yah-homes-os-archive。
 */

/** 施設キー（Web SSoT の property_facts と同じ語彙を使う。正本はあちら） */
export type PropKey = "kiyokawa" | "takasago" | "ropponmatsu" | "otemonA" | "otemonB";

/** 連絡チャネル。line は v2（仕様書 §9） */
export type Channel = "email" | "phone" | "line";

/** 業者マスタ: agency/vendors/{vendorId} */
export interface Vendor {
  name: string;                 // 会社名
  contact?: string;             // 担当者名
  phone?: string;
  email?: string;               // 無い場合は channel="phone"（AI自動化の対象外・人が仲介）
  channel: Channel;
  address?: string;
  /** 担当する作業種別（表示用。実際の割当は schedules が正本） */
  services: string[];
  props?: PropKey[];            // 対応施設（未指定＝全施設）
  note?: string;
  active: boolean;
}

/** 周期マスタ: agency/schedules/{scheduleId}  — 1件=作業×施設 */
export interface Schedule {
  title: string;                // 例: 消防設備点検
  prop: PropKey;
  vendorId: string;
  /** 実行月（1-12）。毎年その月に実施。例: [3,6,9,12] / [7] */
  months: number[];
  /** 数年に一度の作業（外壁クリーニング=5 など）。既定は毎年。 */
  everyYears?: number;
  /** everyYears の起点になる年。ここから everyYears ごとに実施する。 */
  anchorYear?: number;
  /** 計画予算（円・1回あたり）。実績はMF仕訳が正本で、会計処理カードが突合 */
  budget?: number;
  /** 法定かどうか（fail-closed のしきい値が変わる: 法定=30日前・任意=7日前） */
  statutory: boolean;
  /** 起票のリードタイム（日）。既定60 */
  leadDays?: number;
  active: boolean;
  note?: string;
}

/** ジョブの状態（どこからでも exception へ遷移しうる） */
export type JobStatus =
  | "draft"        // 起票済み・未送信（ドライラン中はここで人が送る）
  | "sent"         // 依頼メール送信済み
  | "negotiating"  // 日程調整中
  | "confirmed"    // 日程確定
  | "done"         // 業者から完了報告あり（検品前）
  | "verified"     // AI検品合格・完了確定
  | "exception"    // 人間へエスカレーション
  | "cancelled";

export type JobType = "periodic" | "spot" | "internal";

/** 作業ジョブ: agency/jobs/{jobId}（append-only・削除しない） */
export interface Job {
  type: JobType;
  title: string;
  prop: PropKey;
  vendorId?: string;            // internal の場合は無し
  scheduleId?: string;          // periodic の場合の出どころ
  /** 冪等キー（同じ周期×年月で二重起票しない）: `${scheduleId}:${yyyymm}` */
  trigger: string;
  status: JobStatus;
  dueMonth: string;             // "2026-10"
  window?: { from: string; to: string };
  confirmedAt?: string;         // 業者と合意した実施日時
  statutory: boolean;
  budget?: number;
  /** 完了報告 */
  report?: { at: string; photos: string[]; note?: string };
  /** AI検品の結果（作業したAIとは別系統で判定する） */
  verdict?: { pass: boolean; confidence: number; reason: string; at: string };
  /** 突発の発生元 / 是正ジョブの親 */
  origin?: "manual" | "chat" | "inspection";
  parentJobId?: string;
  /** 状態遷移の履歴（append-only） */
  timeline: Array<{ at: string; status: JobStatus; by: "ai" | "human" | "system"; note?: string }>;
  createdAt: string;
  updatedAt: string;
}

/** やり取り: agency/jobs/{jobId}/messages/{n} */
export interface JobMessage {
  at: string;
  direction: "out" | "in";
  by: "ai" | "human" | "vendor";
  subject?: string;
  body: string;
  attachments?: string[];       // Storage のパス
  /** AIの解釈（分類と確信度。誤読の検証に使う） */
  interpretation?: { label: string; confidence: number };
  gmailId?: string;             // Gmail原本への参照（二重証跡）
}

/** 設備台帳: agency/equipment/{equipmentId} */
export interface Equipment {
  prop: PropKey;
  name: string;                 // 例: 給湯器
  maker?: string;
  model?: string;
  installedAt?: string;
  warrantyUntil?: string;       // 保証期限（修繕ジョブ起票時にAIが判定）
  docs?: string[];              // 保証書PDF等（Storage）
  note?: string;
}

/** 自動処理の生存記録: agency/heartbeats/{jobName}（原則2-2・沈黙の検知） */
export interface Heartbeat {
  lastSuccessAt: string;
  expectEverySec: number;       // これを超えて未更新なら見張りが叫ぶ
  note?: string;
}

export const COL = {
  vendors: "vendors",
  schedules: "schedules",
  jobs: "jobs",
  messages: "messages",
  equipment: "equipment",
  heartbeats: "heartbeats",
} as const;

/**
 * AI読解 — 業者ディスパッチ仕様書 §5
 *
 * 業者からの返信を分類し、次の一手を決める。ここが v1 の核。
 * LLM は chat/yah.homes と同じ Gemini（Vertex AI 経由・APIキー不要）。
 *
 * 安全側の設計（原則②「静かに壊れない」）:
 *  - 金額・契約の話題は即・例外（AIは交渉しない）
 *  - 確信度が低い / 分類できない → 即・例外（誤読で「合意したことにする」が最悪の事故）
 *  - 日付は必ず作業窓・次予約の制約内に収める（範囲外はAIが正しくても採用しない）
 */
import { GoogleGenAI } from "@google/genai";
import type { Job } from "./model.js";

const MODEL = "gemini-2.5-flash";      // chat側と同系
const PROJECT = process.env.GCLOUD_PROJECT ?? "yah-homes";
const LOCATION = "asia-northeast1";

/** 分類。exception 系は人へ回す */
export type Intent =
  | "accept"        // 提案日でOK / 日程を承諾
  | "propose"       // 別の日程を提案してきた
  | "reject"        // 受けられない
  | "question"      // 質問（作業内容・場所など）
  | "completed"     // 完了報告
  | "money"         // 見積・金額・契約の話 → 必ず人
  | "other";        // 判断できない → 人

export interface ReadResult {
  intent: Intent;
  confidence: number;             // 0-1
  /** 業者が挙げた候補日（YYYY-MM-DD・時間帯があれば note に） */
  proposedDates: string[];
  note: string;                   // 人が読む一行要約
  /** 完了報告のとき: 実施日 */
  completedOn?: string;
  /** 例外に回すべきか（AIの自己申告。分類とは別に必ず評価する） */
  needsHuman: boolean;
  reason: string;                 // needsHuman の理由 / 判断の根拠
}

const SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["accept", "propose", "reject", "question", "completed", "money", "other"] },
    confidence: { type: "number" },
    proposedDates: { type: "array", items: { type: "string" } },
    note: { type: "string" },
    completedOn: { type: "string" },
    needsHuman: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["intent", "confidence", "proposedDates", "note", "needsHuman", "reason"],
} as const;

/** 読解の確信度がこれ未満なら、分類にかかわらず人へ回す */
export const CONFIDENCE_FLOOR = 0.75;

export async function readReply(o: {
  job: Pick<Job, "title" | "prop" | "dueMonth" | "confirmedAt" | "status">;
  vendorName: string;
  body: string;
  today: string;                 // YYYY-MM-DD（JST）
}): Promise<ReadResult> {
  const ai = new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });
  const system = [
    "あなたは宿泊施設の運営会社で、外部業者とのメールのやり取りを読み取る担当です。",
    "業者からの返信を読み、次のどれかに分類してください。",
    "  accept=こちらが提示した日程で承諾（日付が1つだけ示され、それが提示日と同じ場合）",
    "  propose=こちらの提示と違う日程・複数の候補を挙げてきた場合",
    "  reject=受けられない",
    "  question=質問 / completed=作業完了の報告 / money=見積・金額・契約の話 / other=上記以外",
    "",
    "厳守すること:",
    "1. 金額・見積・単価・契約条件の話題が少しでも含まれるなら intent=money とし needsHuman=true。",
    "   交渉や金額の合意は絶対に行わない。",
    "2. 読み取りに少しでも自信が持てないときは needsHuman=true にする。",
    "   曖昧なまま「承諾された」と判断することが最も避けたい失敗である。",
    "3. 日付は YYYY-MM-DD に正規化する。年が書かれていなければ、今日以降で最も近い日付とみなす。",
    `   今日は ${o.today} である。`,
    "4. note は日本語1文で、人がひと目で状況を掴める要約にする。",
    "5. 推測で事実を作らない。書かれていないことは書かない。",
    "6. accept と propose の区別に迷ったら propose にしてよい（どちらも同じ手順で確定に進むため実害はない）。",
    "",
    `対象の作業: ${o.job.title}（施設: ${o.job.prop}・実施予定 ${o.job.dueMonth}${o.job.confirmedAt ? `・確定日 ${o.job.confirmedAt}` : ""}）`,
    `やり取りの相手: ${o.vendorName}`,
  ].join("\n");

  const r = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: o.body.slice(0, 4000) }] }],
    config: { systemInstruction: system, responseMimeType: "application/json", responseSchema: SCHEMA as never },
  });
  const out = JSON.parse(r.text ?? "{}") as Partial<ReadResult>;

  const result: ReadResult = {
    intent: (out.intent ?? "other") as Intent,
    confidence: typeof out.confidence === "number" ? out.confidence : 0,
    proposedDates: (out.proposedDates ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    note: out.note ?? "",
    completedOn: out.completedOn && /^\d{4}-\d{2}-\d{2}$/.test(out.completedOn) ? out.completedOn : undefined,
    needsHuman: out.needsHuman === true,
    reason: out.reason ?? "",
  };
  // AIの自己申告に任せず、こちらでも安全側に倒す
  if (result.intent === "money" || result.intent === "other") result.needsHuman = true;
  if (result.confidence < CONFIDENCE_FLOOR) {
    result.needsHuman = true;
    result.reason = `${result.reason}（確信度 ${result.confidence.toFixed(2)} が下限 ${CONFIDENCE_FLOOR} 未満）`;
  }
  return result;
}

/** 提案日が作業可能な範囲か。範囲外は採用しない（AIの読解が正しくても制約が優先） */
export function withinWindow(date: string, dueMonth: string, nextCheckin?: string): boolean {
  const [y, m] = dueMonth.split("-").map(Number);
  const d = new Date(`${date}T00:00:00+09:00`);
  const sameMonth = d.getFullYear() === y && d.getMonth() + 1 === m;
  const beforeGuest = !nextCheckin || d < new Date(`${nextCheckin}T00:00:00+09:00`);
  return sameMonth && beforeGuest;
}

/** 代替日の候補を作る（作業窓の中から、土日を避けて3つ） */
export function suggestDates(dueMonth: string, avoid: string[] = [], count = 3): string[] {
  const [y, m] = dueMonth.split("-").map(Number);
  const out: string[] = [];
  const last = new Date(y, m, 0).getDate();
  const today = new Date();
  for (let day = 1; day <= last && out.length < count; day++) {
    const d = new Date(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+09:00`);
    if (d <= today) continue;
    if (d.getDay() === 0 || d.getDay() === 6) continue;   // 土日は避ける
    const iso = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    if (!avoid.includes(iso)) out.push(iso);
  }
  return out;
}

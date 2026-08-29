/**
 * AIの自己点検 — 「壊れても沈黙する」唯一の穴を塞ぐ（2026-08-29 発注者承認）
 *
 * 背景: 実機で「タスクは？」と聞いたところ、AIは list_overdue_jobs だけを見て
 * 「対応が必要なタスクはありません」と答えた。今日ボードには警告が5件あった。
 * 指示文で直したが、**同じ劣化がまた起きても誰も気づかない**。
 *
 * そこで毎朝、決まった質問を投げ、**期待した道具を引いたか**と**答えが空でないか**だけを見る。
 * 回答の中身の正しさは採点しない（それはAIに採点させることになり、意味が薄い）。
 * 落ちたら heartbeats が沈黙し、点検メールと今日ボードに出る。
 */
import { askAI } from "./ai.js";
import { agencyDb } from "./engine.js";

export type AiProbe = { question: string; expectTools: string[] };
export type AiProbeResult = { question: string; toolsUsed: string[]; answerLen: number; ok: boolean; why: string };

/* 質問は「これが壊れたら業務が止まる」ものだけを少数。増やすとコストと実行時間が伸びる */
export const PROBES: AiProbe[] = [
  /* 2026-08-29 の誤答の再現防止。health を見ずに答えたら落とす */
  { question: "今日やることを教えて", expectTools: ["get_health"] },
  /* 金額の導出が生きているか（facts か月次のどちらかを引けばよい） */
  { question: "先月の売上はいくらでしたか", expectTools: ["get_revenue", "get_monthly", "get_facts"] },
  /* 棟を指定した明細の引き当て */
  { question: "高砂の光熱費の直近の金額は", expectTools: ["get_utilities", "get_facts"] },
];

/** 1件ぶんの判定（純関数・テスト対象）。expectTools は「どれか1つでも引いていればよい」 */
export function judgeProbe(p: AiProbe, toolsUsed: string[], answer: string): AiProbeResult {
  const used = [...new Set(toolsUsed)];
  const hit = p.expectTools.some((t) => used.includes(t));
  const len = answer.trim().length;
  const ok = hit && len > 0;
  const why = !hit ? `期待した道具を引いていない（期待: ${p.expectTools.join(" / ")}／実際: ${used.join(",") || "なし"}）`
    : len === 0 ? "回答が空" : "OK";
  return { question: p.question, toolsUsed: used, answerLen: len, ok, why };
}

/** 全体の合否（純関数・テスト対象）。1件でも落ちたら不合格＝沈黙させない */
export function summarizeProbes(rs: AiProbeResult[]): { ok: boolean; ng: string[] } {
  const ng = rs.filter((r) => !r.ok).map((r) => `「${r.question}」${r.why}`);
  return { ok: ng.length === 0, ng };
}

/** 毎朝の実行本体。結果は aiChecks に1日1件残す（後から劣化の履歴を辿れる） */
export async function aiSelfCheck(): Promise<{ ok: boolean; ng: string[]; ran: number }> {
  const results: AiProbeResult[] = [];
  for (const p of PROBES) {
    try {
      /* 実運用と同じ経路（質問窓と同じ道具・同じモデル）で試す。ターンと出力は控えめに絞る */
      const r = await askAI(p.question, [], { maxTurns: 4, maxOutputTokens: 1200, purpose: "selfCheck" });
      results.push(judgeProbe(p, r.toolsUsed, r.answer));
    } catch (e) {
      results.push({ question: p.question, toolsUsed: [], answerLen: 0, ok: false,
        why: `例外: ${String((e as Error).message ?? e).slice(0, 120)}` });
    }
  }
  const { ok, ng } = summarizeProbes(results);
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  try {
    await agencyDb().collection("aiChecks").doc(day).set({
      at: new Date().toISOString(), ok, ng, results });
  } catch { /* 記録できなくても判定は返す */ }
  if (!ok) throw new Error(`AIの自己点検に失敗: ${ng.join(" / ")}`);   // heartbeat を打たせない
  return { ok, ng, ran: results.length };
}

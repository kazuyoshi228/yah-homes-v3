/**
 * 週報（spec_auto_improvement_20260830 第2弾・2026-08-31 発注者承認「着工」）
 *
 * 毎週月曜の朝メールに1段落。見るのは実測だけ:
 *   - aiLogs: AI費用（トークン実測×公表単価の概算）
 *   - aiChecks: 自己点検の合否推移
 * 「沈黙する自動化は信用できない」——この週報自体が止まればハートビートが鳴る。
 * 自動の家事（auto-chore）の稼働記録は GitHub Actions の履歴が正本（ここからは見えない）。
 */
import { agencyDb } from "./engine.js";

/* 概算単価（USD/100万トークン・2026-08時点の公表値）。請求の正本はGoogleの請求書——
   ここは「桁が合っているか」を毎週見るための物差しにすぎない */
const RATE: Record<string, { in: number; out: number }> = {
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
};

export type AiLogRow = { purpose?: string; model?: string; promptTokens?: number; outputTokens?: number; calls?: number };

/** 集計の純関数（テスト対象） */
export function aggregateAiWeek(rows: AiLogRow[]): { lines: string[]; totalUsd: number } {
  const by = new Map<string, { in: number; out: number; calls: number; model: string }>();
  for (const r of rows) {
    const k = `${r.purpose ?? "?"}|${r.model ?? "?"}`;
    const e = by.get(k) ?? { in: 0, out: 0, calls: 0, model: String(r.model ?? "?") };
    e.in += Number(r.promptTokens ?? 0); e.out += Number(r.outputTokens ?? 0); e.calls += Number(r.calls ?? 1);
    by.set(k, e);
  }
  let totalUsd = 0;
  const lines = [...by.entries()].map(([k, e]) => {
    const rate = RATE[e.model] ?? { in: 0, out: 0 };
    const usd = (e.in * rate.in + e.out * rate.out) / 1e6;
    totalUsd += usd;
    return `  ${k.split("|")[0]}（${e.model.replace("gemini-2.5-", "")}）: ${e.calls}回・入${e.in.toLocaleString()}/出${e.out.toLocaleString()}tok ≒ $${usd.toFixed(3)}`;
  }).sort();
  return { lines, totalUsd };
}

/** 週報の本文を作る。月曜の agencyDaily から呼ぶ */
export async function weeklyReport(): Promise<string> {
  const db = agencyDb();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const logSnap = await db.collection("aiLogs").get();
  const rows = logSnap.docs.map((d) => d.data() as AiLogRow & { at?: string })
    .filter((r) => String(r.at ?? "") >= since);
  const { lines, totalUsd } = aggregateAiWeek(rows);

  const acSnap = await db.collection("aiChecks").get();
  const weekAc = acSnap.docs.filter((d) => d.id >= since.slice(0, 10));
  const ngDays = weekAc.filter((d) => d.data().ok !== true).map((d) => d.id);

  return [
    "【週報】AIと自動化のこの1週間（実測）",
    `・AI費用: 合計 ≒ $${totalUsd.toFixed(2)}（${rows.length}回）`,
    ...(lines.length ? lines : ["  記録なし"]),
    `・AI自己点検: ${weekAc.length}日中 ${weekAc.length - ngDays.length}日合格` +
      (ngDays.length ? `／不合格: ${ngDays.join(", ")}` : ""),
    "・自動の家事（ラチェット・期日監視）: 稼働記録は GitHub Actions（yah-os → auto-chore）が正本",
  ].join("\n");
}

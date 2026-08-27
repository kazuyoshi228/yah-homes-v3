/**
 * AI質問窓 — OSのデータ（health / facts / 更新計画 / ジョブ）を道具に持つ読み取り専用アシスタント
 * （spec_ai_ask_20260827・2026-08-27 発注者承認「APIで連携させて」）
 *
 * 規律:
 *  - 読み取り専用。書き込みの道具は持たせない（確定は人・fail-closed）
 *  - 回答は保存しない（SSoT原則——導出はその都度。保存するのは一次事実と人の判断だけ）
 *  - 数字は必ず道具の結果から。道具に無い数字を作らない（system で明示）
 */
import Anthropic from "@anthropic-ai/sdk";
import { healthSummary } from "./health.js";
import { factsSummary } from "./facts.js";
import { renewalPlan } from "./lifecycle.js";
import { findOverdue } from "./engine.js";

const MODEL = "claude-opus-5";

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_health",
    description: "yah.OS の全検証（health）。各カードの検証結果 {card, name, ok, detail} の一覧。" +
      "「何か問題ある？」「この警告何？」にはまずこれ。",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_facts",
    description: "全金額行の単一射影（facts）。1行 = {prop(棟), ym(年月), amount(円), flow, group, label}。" +
      "flow: invest=取得投資 / add=追加投資 / future=将来費用 / fixed=固定費 / opex=変動費 / revenue=売上。" +
      "棟・年月・flow で絞れる。金額の質問は必ずこれで実データを見る。loan（借入返済）は未実装。",
    input_schema: {
      type: "object",
      properties: {
        prop: { type: "string", description: "棟ID: kiyokawa / takasago / ropponmatsu / otemonA / otemonB" },
        ym: { type: "string", description: "年月 YYYY-MM（例 2026-08）" },
        flow: { type: "string", description: "invest / add / future / fixed / opex / revenue" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_renewal_plan",
    description: "更新計画（長期修繕・設備更新）。実効年数・次回更新年・年割り額・積立の妥当性判定。" +
      "「来年金がかかるのは？」「積立は足りてる？」にはこれ。",
    input_schema: {
      type: "object",
      properties: { prop: { type: "string", description: "棟ID（省略で全棟）" } },
      additionalProperties: false,
    },
  },
  {
    name: "list_overdue_jobs",
    description: "期日が近い・遅れている外部委託ジョブの一覧（見張りと同じ判定）。",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_health": return healthSummary();
    case "get_facts": {
      const r = await factsSummary({
        prop: input.prop ? String(input.prop) : undefined,
        ym: input.ym ? String(input.ym) : undefined,
        flow: input.flow ? String(input.flow) : undefined,
      });
      /* 全行を返すとトークンが溢れるので、多すぎる場合は行を刈って合計を残す */
      const rows = (r as { rows?: unknown[] }).rows;
      if (Array.isArray(rows) && rows.length > 400) {
        return { ...r, rows: rows.slice(0, 400),
          note: `行が多いため先頭400行のみ（全${rows.length}行）。合計・集計値は全行から計算済み。絞り込みには prop / ym / flow を使う` };
      }
      return r;
    }
    case "get_renewal_plan": return renewalPlan(input.prop ? String(input.prop) : undefined);
    case "list_overdue_jobs":
      return (await findOverdue()).map((o) => ({
        title: o.job.title, prop: o.job.prop, due: o.dueLabel, level: o.level, reason: o.reason }));
    default: return { error: `不明な道具: ${name}` };
  }
}

const SYSTEM = `あなたは yah.OS（宿泊事業の経営OS）の分析アシスタント。オーナーの質問に、OSの実データだけを根拠に日本語で答える。

事業の前提: 一棟貸しの宿泊施設を運営（清川=kiyokawa・高砂=takasago が稼働中、六本松=ropponmatsu・大手門A/B=otemonA/otemonB が開発中）。運営は外部委託（管理料は棟数逓増で率が下がる）。

鉄則:
- 数字は必ず道具（get_facts 等）の結果から引用する。道具に無い数字を推測で作らない。データが無ければ「データがありません」と言う
- 金額は ¥12,345 形式。集計はどの行から計算したか一言添える
- 回答は簡潔に。表が要るときだけ表。結論を先に
- 判断や公開などの操作はできない（読み取り専用）。求められたら「操作は画面から人が行う決まりです」と案内する`;

export async function askAI(question: string, history: Array<{ role: "user" | "assistant"; content: string }>,
  apiKey: string): Promise<{ answer: string; toolsUsed: string[] }> {
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-12).map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: question },
  ];
  const toolsUsed: string[] = [];

  for (let turn = 0; turn < 6; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: `${SYSTEM}\n\n今日: ${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })}`,
        cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });
    if (response.stop_reason === "refusal") {
      return { answer: "この質問には答えられませんでした。表現を変えて試してください。", toolsUsed };
    }
    if (response.stop_reason !== "tool_use") {
      const answer = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      return { answer: answer || "（回答を生成できませんでした）", toolsUsed };
    }
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      toolsUsed.push(block.name);
      let out: unknown;
      try { out = await runTool(block.name, (block.input ?? {}) as Record<string, unknown>); }
      catch (e) { out = { error: String((e as Error).message ?? e) }; }
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "調査が長くなりすぎたため打ち切りました。質問を絞って試してください。", toolsUsed };
}

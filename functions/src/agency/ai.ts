/**
 * AI質問窓 — OSのデータ（health / facts / 更新計画 / ジョブ）を道具に持つ読み取り専用アシスタント
 * （spec_ai_ask_20260827・2026-08-27 発注者承認。同日「GEMINI」指示で Vertex AI の Gemini へ切替——
 *   APIキーの発行・保管が不要（実行SAのIAMだけ）で、請求も既存GCPに合算される）
 *
 * 規律:
 *  - 読み取り専用。書き込みの道具は持たせない（確定は人・fail-closed）
 *  - 回答は保存しない（SSoT原則——導出はその都度。保存するのは一次事実と人の判断だけ）
 *  - 数字は必ず道具の結果から。道具に無い数字を作らない（system で明示）
 */
import { GoogleGenAI, Type, FunctionDeclaration, Content } from "@google/genai";
import { healthSummary } from "./health.js";
import { factsSummary } from "./facts.js";
import { renewalPlan } from "./lifecycle.js";
import { findOverdue, agencyDb } from "./engine.js";
import { propertySummary } from "./props.js";
import { loanSummary } from "./finance.js";
import { monthlySummary } from "./monthly.js";
import { yieldSummary } from "./yields.js";
import { revenueSummary } from "./revenue.js";
import { utilitySummary } from "./utilities.js";
import { successionSummary } from "./succession.js";
import { judgmentSummary } from "./judgments.js";

const MODEL = "gemini-2.5-pro";

const TOOLS: FunctionDeclaration[] = [
  {
    name: "get_health",
    description: "yah.OS の全検証（health）。各カードの検証結果 {card, name, ok, detail} の一覧。" +
      "「何か問題ある？」「この警告何？」にはまずこれ。",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_facts",
    description: "全金額行の単一射影（facts）。1行 = {prop(棟), ym(年月), amount(円), flow, group, label}。" +
      "flow: invest=取得投資 / add=追加投資 / future=将来費用 / fixed=固定費 / opex=変動費 / revenue=売上。" +
      "棟・年月・flow で絞れる。金額の質問は必ずこれで実データを見る。loan（借入返済）は未実装。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        prop: { type: Type.STRING, description: "棟ID: kiyokawa / takasago / ropponmatsu / otemonA / otemonB" },
        ym: { type: Type.STRING, description: "年月 YYYY-MM（例 2026-08）" },
        flow: { type: Type.STRING, description: "invest / add / future / fixed / opex / revenue" },
      },
    },
  },
  {
    name: "get_renewal_plan",
    description: "更新計画（長期修繕・設備更新）。実効年数・次回更新年・年割り額・積立の妥当性判定。" +
      "「来年金がかかるのは？」「積立は足りてる？」にはこれ。",
    parameters: {
      type: Type.OBJECT,
      properties: { prop: { type: Type.STRING, description: "棟ID（省略で全棟）" } },
    },
  },
  {
    name: "list_overdue_jobs",
    description: "期日が近い・遅れている外部委託ジョブの一覧（見張りと同じ判定）。",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_properties",
    description: "物件の全属性＋投資額（取得費用＋リフォーム導出）＋監査。棟のスペック・取得価格・構造・耐用年数の質問はこれ。",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_loans",
    description: "借入の一覧と返済状態（残債・月々・利率・完済時期は契約条件から毎回導出）。",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_monthly",
    description: "月次の財務集計（売上・費用・収支）。",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_yields",
    description: "利回り（投資額と収益から導出）。",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_revenue",
    description: "月次売上報告（AIRSTAR報告書が原本）。売上・稼働率・ADR・支払額。",
    parameters: {
      type: Type.OBJECT,
      properties: { months: { type: Type.NUMBER, description: "直近何ヶ月分か（既定12）" } },
    },
  },
  {
    name: "get_utilities",
    description: "光熱費・通信費など変動費の明細と月次集計。",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_succession",
    description: "事業承継の採点（scorecards）と説明力の推移。",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_judgments",
    description: "判定カレンダー（値上げ等の合格ラインと実測の突合）。",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "read_collection",
    description: "上の道具に無いデータの最後の手段。agency DB の台帳を生のまま読む（読み取り専用）。" +
      "対象: properties / items / equipment / schedules / jobs / taxes / insurance / reserves / finance / " +
      "revenue / places / utilities / recurringCosts / contracts / cvr / assumptions / scorecards / vendors / " +
      "templates / alertLogs / unmatched / heartbeats / competitorObs（AirDNA市場定点）。" +
      "集計済みの答えが欲しい時は専用道具を優先（このツールは生の行を返すだけ）。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        collection: { type: Type.STRING, description: "コレクション名（上記のいずれか）" },
        prop: { type: Type.STRING, description: "棟IDで絞る（propフィールドを持つ台帳のみ有効）" },
        limit: { type: Type.NUMBER, description: "最大行数（既定100・上限300）" },
      },
      required: ["collection"],
    },
  },
];

/* read_collection の許可台帳（読み取り専用・settings は通知先メール等を含むため除外） */
const READABLE = new Set(["properties", "items", "equipment", "schedules", "jobs", "taxes", "insurance",
  "reserves", "finance", "revenue", "places", "utilities", "recurringCosts", "contracts", "cvr",
  "assumptions", "scorecards", "vendors", "templates", "alertLogs", "unmatched", "heartbeats", "competitorObs"]);

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
    case "get_properties": return propertySummary();
    case "get_loans": return loanSummary();
    case "get_monthly": return monthlySummary();
    case "get_yields": return yieldSummary();
    case "get_revenue": return revenueSummary(Math.min(Number(input.months ?? 12) || 12, 36));
    case "get_utilities": return utilitySummary();
    case "get_succession": return successionSummary();
    case "get_judgments": return judgmentSummary();
    case "read_collection": {
      const col = String(input.collection ?? "");
      if (!READABLE.has(col)) return { error: `読めない台帳: ${col}（許可: ${[...READABLE].join(", ")}）` };
      const limit = Math.min(Math.max(Number(input.limit ?? 100) || 100, 1), 300);
      let q = agencyDb().collection(col).limit(limit) as FirebaseFirestore.Query;
      if (input.prop) q = agencyDb().collection(col).where("prop", "==", String(input.prop)).limit(limit);
      const snap = await q.get();
      /* 長文フィールド（メール本文等）は刈ってトークンを守る */
      const rows = snap.docs.map((d) => {
        const o: Record<string, unknown> = { id: d.id };
        for (const [k, v] of Object.entries(d.data()))
          o[k] = typeof v === "string" && v.length > 500 ? v.slice(0, 500) + "…" : v;
        return o;
      });
      return { collection: col, count: rows.length, truncatedAt: limit, rows };
    }
    default: return { error: `不明な道具: ${name}` };
  }
}

const SYSTEM = `あなたは yah.OS（宿泊事業の経営OS）の分析アシスタント。オーナーの質問に、OSの実データだけを根拠に日本語で答える。

事業の前提: 一棟貸しの宿泊施設を運営（清川=kiyokawa・高砂=takasago が稼働中、六本松=ropponmatsu・大手門A/B=otemonA/otemonB が開発中）。運営は外部委託（管理料は棟数逓増で率が下がる）。

鉄則:
- 数字は必ず道具の結果から引用する。道具に無い数字を推測で作らない。データが無ければ「データがありません」と言う
- 集計済みの導出道具（get_facts / get_properties / get_loans 等）を優先し、無いものだけ read_collection で生の台帳を読む。複数の道具を跨いで横断してよい
- 金額は ¥12,345 形式。集計はどの行から計算したか一言添える
- 回答は簡潔に。表が要るときだけ表。結論を先に
- 判断や公開などの操作はできない（読み取り専用）。求められたら「操作は画面から人が行う決まりです」と案内する`;

export async function askAI(question: string, history: Array<{ role: "user" | "assistant"; content: string }>):
  Promise<{ answer: string; toolsUsed: string[] }> {
  /* Vertex AI モード: APIキー不要。実行SA（yah-homes@appspot）の IAM（roles/aiplatform.user）で認証 */
  const ai = new GoogleGenAI({ vertexai: true, project: "yah-homes", location: "global" });
  const contents: Content[] = [
    ...history.slice(-12).map((h) => ({
      role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
    { role: "user", parts: [{ text: question }] },
  ];
  const toolsUsed: string[] = [];

  for (let turn = 0; turn < 6; turn++) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: `${SYSTEM}\n\n今日: ${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })}`,
        tools: [{ functionDeclarations: TOOLS }],
        maxOutputTokens: 8000,
      },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const answer = parts.filter((p) => p.text).map((p) => p.text).join("\n").trim();
      return { answer: answer || "（回答を生成できませんでした）", toolsUsed };
    }
    contents.push({ role: "model", parts });
    const results = [];
    for (const p of calls) {
      const name = String(p.functionCall!.name ?? "");
      toolsUsed.push(name);
      let out: unknown;
      try { out = await runTool(name, (p.functionCall!.args ?? {}) as Record<string, unknown>); }
      catch (e) { out = { error: String((e as Error).message ?? e) }; }
      results.push({ functionResponse: { name, response: { result: out } } });
    }
    contents.push({ role: "user", parts: results });
  }
  return { answer: "調査が長くなりすぎたため打ち切りました。質問を絞って試してください。", toolsUsed };
}

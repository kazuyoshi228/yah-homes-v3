/**
 * AI質問窓のルート（spec_ai_ask_20260827）。読み取り専用——書き込みの case をここに足さない。
 */
import { askAI } from "../ai.js";

type Ctx = { db: unknown; email: string; all: (col: string) => Promise<unknown[]> };

export async function handle(action: string, req: any, res: any, _ctx: Ctx): Promise<boolean> {
  switch (action) {
    case "ask": {
      if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
      const question = String(req.body?.question ?? "").slice(0, 2000).trim();
      if (!question) { res.status(400).json({ ok: false, error: "質問が空です" }); return true; }
      const history = Array.isArray(req.body?.history)
        ? (req.body.history as Array<{ role: string; content: string }>)
            .filter((h) => (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
            .map((h) => ({ role: h.role as "user" | "assistant", content: h.content.slice(0, 4000) }))
        : [];
      const key = process.env.ANTHROPIC_API_KEY ?? "";
      if (!key || key === "placeholder") {
        res.status(503).json({ ok: false, error: "AIのAPIキーが未設定です（ANTHROPIC_API_KEY）" });
        return true;
      }
      const r = await askAI(question, history, key);
      res.json({ ok: true, ...r });
      return true;
    }
  }
  return false;
}

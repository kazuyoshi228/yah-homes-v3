/**
 * 外部委託の管理API — 画面（os.yah.homes/vendors.html）の唯一の入口
 *
 * agency DB はクライアントから直接読めない（全面拒否ルール）。
 * 読み書きは必ずここを通し、Google ログイン＋管理者台帳で守る。
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { agencyDb } from "./engine.js";
import { BUILD } from "./buildinfo.js";

import * as propsRoute from "./routes/props.route.js";
import * as financeRoute from "./routes/finance.route.js";
import * as analyticsRoute from "./routes/analytics.route.js";
import * as contractsRoute from "./routes/contracts.route.js";
import * as opsRoute from "./routes/ops.route.js";
import * as aiRoute from "./routes/ai.route.js";

const AGENCY_MAILER_KEY = defineSecret("AGENCY_MAILER_KEY");
const REGION = "asia-northeast1";
/* localhost は手元で確認するとき用（5000 は macOS の ControlCenter が使っているので 5050 も許す） */
const ALLOW_ORIGIN = ["https://os.yah.homes", "https://yah-os.web.app",
  "http://localhost:5000", "http://localhost:5050", "http://127.0.0.1:5050"];

/**
 * Google ログイン → 「外部委託を見てよい人」かを照合する。
 *
 * Web の管理者台帳（admin_users）をそのまま使わないのは、そこに運営会社の方が
 * operator/admin として入っているため。この画面は業者名・単価・見積の往復まで見えるので、
 * 運営を委託している相手に開くわけにいかない（運営会社は競合物件も扱う）。
 * 既定は owner のみ。増やすときは agency/settings/access.emails に明記する（fail-closed）。
 */
async function verify(req: { headers: Record<string, unknown> }): Promise<string | null> {
  const m = /^Bearer (.+)$/.exec(String(req.headers["authorization"] ?? ""));
  if (!m) return null;
  try {
    const d = await getAuth().verifyIdToken(m[1]);
    const email = (d.email ?? "").toLowerCase();
    if (!d.email_verified || !email) return null;
    const u = (await getFirestore().collection("admin_users").doc(email).get()).data();
    if (u?.role === "owner") return email;
    const extra = (await agencyDb().collection("settings").doc("access").get()).data();
    const allow = (extra?.emails ?? []) as string[];
    return allow.map((x) => x.toLowerCase()).includes(email) ? email : null;
  } catch { return null; }
}

const all = async (col: string) =>
  (await agencyDb().collection(col).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

export const agencyApi = onRequest(
  /* minInstances: 1 … コールドスタート殺し（P4・2026-08-24 発注者承認）。
     常時1台ぶんの待機費用（月数百円〜千円台）がかかる */
  /* timeoutSeconds: AIの道具ループは60秒を超えることがある */
  { region: REGION, secrets: [AGENCY_MAILER_KEY], maxInstances: 5, minInstances: 1, timeoutSeconds: 300 },
  async (req, res) => {
    const origin = String(req.headers.origin ?? "");
    if (ALLOW_ORIGIN.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Vary", "Origin");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    /* version だけは認証前に返す（ビルドSHAのみ・データに触れない）。
       CIがデプロイ直後に照合し、旧コードが残っていれば失敗させる（QA②） */
    if (String(req.query.action ?? "") === "version") { res.json({ ok: true, build: BUILD }); return; }

    const email = await verify(req);
    if (!email) { res.status(401).json({ ok: false, error: "ログインが必要です" }); return; }

    const action = String(req.query.action ?? req.body?.action ?? "");
    const db = agencyDb();
    try {
      /* 振り分けは各 route ファイルへ（S4）。api.ts は認証とCORSだけを持つ。
         どの route も拾わなければ 400 */
      const ctx = { db, email, all };
      for (const r of [propsRoute, financeRoute, analyticsRoute, contractsRoute, opsRoute, aiRoute]) {
        if (await r.handle(action, req, res, ctx)) return;
      }
      res.status(400).json({ ok: false, error: `不明な操作: ${action}` });
    } catch (e) {
      res.status(500).json({ ok: false, error: String((e as Error).message ?? e) });
    }
  },
);

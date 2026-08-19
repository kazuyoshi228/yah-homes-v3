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
import { agencyDb, advance, findOverdue, staleHeartbeats } from "./engine.js";
import { DEFAULT_TEMPLATES, validateTemplate, type TemplateKey } from "./templates.js";
import { sendRequests, handleReply } from "./dispatcher.js";
import { loanSummary } from "./finance.js";
import { revenueSummary } from "./revenue.js";
import { utilitySummary } from "./utilities.js";
import { getStorage } from "firebase-admin/storage";

const AGENCY_MAILER_KEY = defineSecret("AGENCY_MAILER_KEY");
const REGION = "asia-northeast1";
const ALLOW_ORIGIN = ["https://os.yah.homes", "https://yah-os.web.app", "http://localhost:5000"];

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
  { region: REGION, secrets: [AGENCY_MAILER_KEY], maxInstances: 5 },
  async (req, res) => {
    const origin = String(req.headers.origin ?? "");
    if (ALLOW_ORIGIN.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Vary", "Origin");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const email = await verify(req);
    if (!email) { res.status(401).json({ ok: false, error: "ログインが必要です" }); return; }

    const action = String(req.query.action ?? req.body?.action ?? "");
    const db = agencyDb();
    try {
      switch (action) {
        /* ---- 読み取り ---- */
        case "overview": {
          const [jobs, vendors, schedules, equipment] =
            await Promise.all([all("jobs"), all("vendors"), all("schedules"), all("equipment")]);
          const settings = Object.fromEntries((await db.collection("settings").get()).docs.map((d) => [d.id, d.data()]));
          const templates = Object.fromEntries(
            Object.keys(DEFAULT_TEMPLATES).map((k) => [k, { ...DEFAULT_TEMPLATES[k as TemplateKey], ...(settings.mailTemplates?.[k] ?? {}) }]),
          );
          res.json({
            ok: true, jobs, vendors, schedules, equipment, templates,
            settings: { dispatch: settings.dispatch ?? {}, notify: settings.notify ?? {}, contacts: settings.contacts ?? {} },
            alerts: { overdue: await findOverdue(), stale: await staleHeartbeats() },
            heartbeats: await all("heartbeats"),
            unmatched: await all("unmatched"),
          });
          return;
        }
        case "finance": {                                     // 融資の一覧（残債は契約条件から毎回計算）
          /* asOf を渡せば将来・過去の断面も出せる。残高を持たず条件から計算しているからできること。
             不正な日付で黙って「今日」に落ちると数字を取り違えるので、その時はエラーにする。 */
          const q = String(req.query.asOf ?? "");
          let asOf = new Date();
          if (q) {
            asOf = new Date(q);
            if (Number.isNaN(asOf.getTime())) { res.status(400).json({ ok: false, error: `日付が読めません: ${q}` }); return; }
          }
          res.json({ ok: true, ...(await loanSummary(asOf)) });
          return;
        }
        case "revenue": {                                     // 売上レポート（運営会社の月次報告）
          res.json({ ok: true, ...(await revenueSummary(Number(req.query.months ?? 12))) });
          return;
        }
        case "fixedCosts": {                                  // 税金・保険（毎年決まって出ていくもの）
          const [tax, ins] = await Promise.all([all("taxes"), all("insurance")]);
          const sumY = (rows: Array<Record<string, unknown>>, key: string) =>
            rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);
          const taxes = sumY(tax as never, "amountPerYear");
          const premiums = sumY(ins as never, "premiumPerYear");
          res.json({
            ok: true, taxes: tax, insurance: ins,
            total: {
              taxesPerYear: taxes, insurancePerYear: premiums,
              perYear: taxes + premiums, perMonth: Math.round((taxes + premiums) / 12),
            },
          });
          return;
        }
        case "insurancePdf": {
          const id = String(req.query.id ?? "");
          const d = (await db.collection("insurance").doc(id).get()).data();
          const gs = String(d?.pdf ?? "");
          if (!gs.startsWith("gs://")) { res.status(404).json({ ok: false, error: "原本が未登録です" }); return; }
          const [bucket, ...rest] = gs.slice(5).split("/");
          const [url] = await getStorage().bucket(bucket).file(rest.join("/"))
            .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60 * 1000 });
          res.json({ ok: true, url });
          return;
        }
        case "utilities": {                                   // 光熱費（会計の仕訳から）
          res.json({ ok: true, ...(await utilitySummary()) });
          return;
        }
        case "revenuePdf": {                                  // 月次報告の原本
          const id = String(req.query.id ?? "");
          const d = (await db.collection("revenue").doc(id).get()).data();
          const gs = String(d?.pdf ?? "");
          if (!gs.startsWith("gs://")) { res.status(404).json({ ok: false, error: "原本が未登録です" }); return; }
          const [bucket, ...rest] = gs.slice(5).split("/");
          const [url] = await getStorage().bucket(bucket).file(rest.join("/"))
            .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60 * 1000 });
          res.json({ ok: true, url });
          return;
        }
        case "loanPdf": {                                     // 契約書の原本を一時リンクで開く
          const id = String(req.query.loanId ?? "");
          const d = (await db.collection("finance").doc(id).get()).data();
          const gs = String(d?.pdf ?? "");
          if (!gs.startsWith("gs://")) { res.status(404).json({ ok: false, error: "原本が未登録です" }); return; }
          const [bucket, ...rest] = gs.slice(5).split("/");
          /* 保管庫は非公開のまま。10分だけ有効な署名付きリンクを都度作る（URLが漏れても長く生きない）。 */
          const [url] = await getStorage().bucket(bucket).file(rest.join("/"))
            .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60 * 1000 });
          res.json({ ok: true, url });
          return;
        }
        case "timeline": {                                    // ジョブ1件の全やり取り
          const id = String(req.query.jobId ?? "");
          const job = await db.collection("jobs").doc(id).get();
          if (!job.exists) { res.status(404).json({ ok: false, error: "見つかりません" }); return; }
          const msgs = (await job.ref.collection("messages").orderBy("at").get()).docs.map((d) => d.data());
          res.json({ ok: true, job: { id, ...job.data() }, messages: msgs });
          return;
        }
        case "historyCsv": {                                  // 履歴の書き出し（Excelで開ける）
          const jobs = (await all("jobs")) as Array<Record<string, string>>;
          const head = ["起票日", "施設", "作業", "期日", "状態", "確定日", "業者"];
          const rows = jobs.map((j) => [j.createdAt ?? "", j.prop ?? "", j.title ?? "", j.dueMonth ?? "",
            j.status ?? "", j.confirmedAt ?? "", j.vendorId ?? ""]);
          res.set("Content-Type", "text/csv; charset=utf-8");
          res.set("Content-Disposition", 'attachment; filename="agency-history.csv"');
          res.send("﻿" + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n"));
          return;
        }

        /* ---- 書き込み（POSTのみ） ---- */
        case "advance": {                                     // 人が状態を進める／差し戻す
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
          const { jobId, status, note } = req.body ?? {};
          await advance(String(jobId), status, "human", `${note ?? ""}（${email}）`);
          res.json({ ok: true });
          return;
        }
        case "pauseAi": {                                     // AIを止める／再開する
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
          const { jobId, paused } = req.body ?? {};
          await db.collection("jobs").doc(String(jobId)).update({
            aiPaused: !!paused, aiPausedAt: new Date().toISOString(),
            aiPausedReason: paused ? `${email} が手動で停止` : "",
          });
          res.json({ ok: true });
          return;
        }
        case "createSpot": {                                  // 突発ジョブ
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
          const { title, prop, dueMonth, vendorId, note } = req.body ?? {};
          const now = new Date().toISOString();
          const ref = await db.collection("jobs").add({
            type: "spot", title, prop, dueMonth, vendorId: vendorId ?? "", status: "draft",
            createdAt: now, note: note ?? "",
            timeline: [{ at: now, status: "draft", by: "human", note: `${email} が起票` }],
          });
          res.json({ ok: true, jobId: ref.id });
          return;
        }
        case "saveDoc": {                                     // 業者・周期・設定・定型メールの保存
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
          const { col, id, data } = req.body ?? {};
          if (!["vendors", "schedules", "settings", "equipment"].includes(col)) {
            res.status(400).json({ ok: false, error: "その置き場は編集できません" }); return;
          }
          if (col === "settings" && id === "mailTemplates") {  // 差し込み語の綴り間違いを通さない
            for (const [k, t] of Object.entries(data as Record<string, { subject: string; body: string }>)) {
              const v = validateTemplate(t);
              if (!v.ok) { res.status(400).json({ ok: false, error: `${k}: 使えない差し込み ${v.unknown.join("・")}` }); return; }
            }
          }
          await db.collection(col).doc(String(id)).set({ ...data, updatedAt: new Date().toISOString(), updatedBy: email }, { merge: true });
          res.json({ ok: true });
          return;
        }
        case "runNow": {                                      // 「いま依頼を出す」（画面から手動で回す）
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
          res.json({ ok: true, result: await sendRequests() });
          return;
        }
        case "replayReply": {                                 // 取りこぼした返信を人が流し込む
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
          const { jobId, body } = req.body ?? {};
          res.json({ ok: true, result: await handleReply(String(jobId), String(body)) });
          return;
        }
        default:
          res.status(400).json({ ok: false, error: `不明な操作: ${action}` });
      }
    } catch (e) {
      res.status(500).json({ ok: false, error: String((e as Error).message ?? e) });
    }
  },
);

/**
 * routes/ops.route.ts — エンドポイントの分割（S4・2026-08-25 発注者承認）
 *
 * 新しいエンドポイントは api.ts ではなく、担当カードに対応するこのファイルへ足す。
 * 本文は api.ts から移設したまま（一字も変えない方針。return; → return true; のみ機械置換）。
 */
import { getStorage } from "firebase-admin/storage";
import { advance, findOverdue, staleHeartbeats } from "../engine.js";
import { DEFAULT_TEMPLATES, validateTemplate, type TemplateKey } from "../templates.js";
import { sendRequests, handleReply } from "../dispatcher.js";
import { plantingToken, exteriorToken, kaitekiToken } from "../planting.js";
import { enrichSchedules, SCHEDULE_FIELDS } from "../schedules.js";

export type Ctx = {
  db: FirebaseFirestore.Firestore;
  email: string;
  all: (col: string) => Promise<Array<Record<string, unknown>>>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handle(action: string, req: any, res: any, ctx: Ctx): Promise<boolean> {
  const { db, email, all } = ctx;
  switch (action) {
        case "overview": {
          const [jobs, vendors, schedulesRaw, equipment, properties] =
            await Promise.all([all("jobs"), all("vendors"), all("schedules"), all("equipment"), all("properties")]);
          /* 周期と前回実施はここで毎回引き直す（写しを持たない・spec_schedules_editable_20260825） */
          const schedules = enrichSchedules(schedulesRaw, jobs, equipment, properties);
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
          return true;
        }
        case "propJobs": {                                    // 棟ごとの作業（物件カードの作業タブ）
          const prop = String(req.query.prop ?? "");
          if (!prop) { res.status(400).json({ ok: false, error: "棟が指定されていません" }); return true; }
          const [jsnap, ssnap] = await Promise.all([
            db.collection("jobs").where("prop", "==", prop).get(),
            db.collection("schedules").where("prop", "==", prop).get(),
          ]);
          const led = new Map(ssnap.docs.map((d) => [d.id, String(d.data().ledgerId ?? "")]));
          const jobs = jsnap.docs.map((d) => {
            const j = d.data();
            return { id: d.id, title: j.title, status: j.status, dueMonth: j.dueMonth,
              statutory: !!j.statutory, manualOnly: !!j.manualOnly, vendorId: j.vendorId ?? "",
              scheduleId: j.scheduleId ?? "", ledgerId: led.get(String(j.scheduleId ?? "")) ?? "",
              actual: j.actual ?? null, confirmedAt: j.confirmedAt ?? null,
              ledgerWrittenBack: j.ledgerWrittenBack ?? null,
              timeline: j.timeline ?? [], updatedAt: j.updatedAt ?? "" };
          }).sort((a, b) => String(b.dueMonth).localeCompare(String(a.dueMonth)));
          /* まだジョブになっていない予定も並べる。「登録はしたが起票されていない」を見えるように */
          const pending = ssnap.docs.map((d) => {
            const sc = d.data();
            return { id: d.id, title: sc.title, everyYears: sc.everyYears ?? 1,
              months: sc.months ?? [], active: !!sc.active, needsDecision: !!sc.needsDecision,
              category: sc.category ?? "",
              vendorId: sc.vendorId ?? "", ledgerId: String(sc.ledgerId ?? ""),
              hasJob: jobs.some((j) => j.scheduleId === d.id) };
          }).sort((a, b) => String(a.title).localeCompare(String(b.title)));
          res.json({ ok: true, jobs, schedules: pending });
          return true;
        }
        case "timeline": {                                    // ジョブ1件の全やり取り
          const id = String(req.query.jobId ?? "");
          const job = await db.collection("jobs").doc(id).get();
          if (!job.exists) { res.status(404).json({ ok: false, error: "見つかりません" }); return true; }
          const msgs = (await job.ref.collection("messages").orderBy("at").get()).docs.map((d) => d.data());
          res.json({ ok: true, job: { id, ...job.data() }, messages: msgs });
          return true;
        }
        case "historyCsv": {                                  // 履歴の書き出し（Excelで開ける）
          const jobs = (await all("jobs")) as Array<Record<string, string>>;
          const head = ["起票日", "施設", "作業", "期日", "状態", "確定日", "業者"];
          const rows = jobs.map((j) => [j.createdAt ?? "", j.prop ?? "", j.title ?? "", j.dueMonth ?? "",
            j.status ?? "", j.confirmedAt ?? "", j.vendorId ?? ""]);
          res.set("Content-Type", "text/csv; charset=utf-8");
          res.set("Content-Disposition", 'attachment; filename="agency-history.csv"');
          res.send("﻿" + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n"));
          return true;
        }

        /* ---- 書き込み（POSTのみ） ---- */
        case "recordDone": {   /* 過去の実施を記録する（定期作業カードの「実施を記録」）
             前回実施は jobs が正本なので、日付を schedules に直接書かせない。
             ここで実績ジョブを1件作り、既存の advance に渡す——検収・台帳への書き戻し・
             次回の自動起票は、いつもの経路がそのまま動く（2026-08-25） */
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { scheduleId, ym, amount, vendorId, note } = req.body ?? {};
          if (!scheduleId || !/^\d{4}-\d{2}$/.test(String(ym ?? ""))) {
            res.status(400).json({ ok: false, error: "実施年月は 2026-08 の形で入れてください" }); return true;
          }
          const sc = await db.collection("schedules").doc(String(scheduleId)).get();
          if (!sc.exists) { res.status(404).json({ ok: false, error: "その定期作業がありません" }); return true; }
          const sd = sc.data() as Record<string, unknown>;
          const amt = Number(amount ?? 0);
          if (amount != null && amount !== "" && (!Number.isFinite(amt) || amt < 0)) {
            res.status(400).json({ ok: false, error: "金額の入れ方が違います" }); return true;
          }
          const now = new Date().toISOString();
          const ref = await db.collection("jobs").add({
            type: "cycle", scheduleId: String(scheduleId),
            title: sd.title ?? "", prop: sd.prop ?? "", category: sd.category ?? "",
            vendorId: String(vendorId ?? sd.vendorId ?? ""),
            status: "done", dueMonth: String(ym), doneAt: String(ym), confirmedAt: String(ym),
            createdAt: now, backfilled: true,
            actual: { ...(amt ? { amount: amt } : {}), ym: String(ym) },
            note: `${note ?? ""}（過去の実施を後から記録・${email}）`,
            timeline: [{ at: now, status: "done", by: "human", note: `${ym} に実施として登録（${email}）` }],
          });
          /* 検収まで進める＝設備台帳への書き戻しと次回の起票が走る */
          await advance(ref.id, "verified", "human", `実施の記録（${email}）`);
          res.json({ ok: true, jobId: ref.id });
          return true;
        }
        case "advance": {                                     // 人が状態を進める／差し戻す
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { jobId, status, note, actual } = req.body ?? {};
          /* 消し込みの実績。verified にする前に入れておく——advance の中で台帳へ書き戻すため */
          if (actual && typeof actual === "object") {
            const a = actual as { amount?: unknown; ym?: unknown; vendor?: unknown; note?: unknown };
            const amt = Number(a.amount ?? 0);
            if (a.amount != null && (!Number.isFinite(amt) || amt < 0)) {
              res.status(400).json({ ok: false, error: "実額の入れ方が違います" }); return true;
            }
            const ym = String(a.ym ?? "");
            if (ym && !/^\d{4}-\d{2}$/.test(ym)) {
              res.status(400).json({ ok: false, error: "実施年月は 2026-08 の形で入れてください" }); return true;
            }
            await db.collection("jobs").doc(String(jobId)).set({
              actual: { ...(amt ? { amount: amt } : {}), ...(ym ? { ym } : {}),
                ...(a.vendor ? { vendor: String(a.vendor) } : {}),
                ...(a.note ? { note: String(a.note) } : {}) },
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          }
          await advance(String(jobId), status, "human", `${note ?? ""}（${email}）`);
          res.json({ ok: true });
          return true;
        }
        case "pauseAi": {                                     // AIを止める／再開する
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { jobId, paused } = req.body ?? {};
          await db.collection("jobs").doc(String(jobId)).update({
            aiPaused: !!paused, aiPausedAt: new Date().toISOString(),
            aiPausedReason: paused ? `${email} が手動で停止` : "",
          });
          res.json({ ok: true });
          return true;
        }
        case "createSpot": {                                  // 突発ジョブ
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { title, prop, dueMonth, vendorId, note } = req.body ?? {};
          const now = new Date().toISOString();
          const ref = await db.collection("jobs").add({
            type: "spot", title, prop, dueMonth, vendorId: vendorId ?? "", status: "draft",
            createdAt: now, note: note ?? "",
            timeline: [{ at: now, status: "draft", by: "human", note: `${email} が起票` }],
          });
          res.json({ ok: true, jobId: ref.id });
          return true;
        }
        case "saveDoc": {                                     // 業者・周期・設定・定型メールの保存
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { col, id, data } = req.body ?? {};
          if (!["vendors", "schedules", "settings", "equipment"].includes(col)) {
            res.status(400).json({ ok: false, error: "その置き場は編集できません" }); return true;
          }
          /* 定期作業は許可リストで絞る。周期(ledgerIdあり)・前回実施は導出なので保存させない
             （spec_schedules_editable_20260825） */
          if (col === "schedules") {
            const d = (data ?? {}) as Record<string, unknown>;
            const bad = Object.keys(d).filter((k) => !(SCHEDULE_FIELDS as readonly string[]).includes(k));
            if (bad.length) { res.status(400).json({ ok: false, error: `保存できない項目: ${bad.join("・")}` }); return true; }
          }
          /* 業者も許可リストで絞る。導出値（担当作業＝定期作業からの集計）は保存させない
             （2026-08-26 業者台帳をパネルで編集できるようにしたときに追加） */
          if (col === "vendors") {
            const VENDOR_FIELDS = ["name", "contactName", "contact", "phone", "email",
              "channel", "services", "active", "note"] as const;
            const d = (data ?? {}) as Record<string, unknown>;
            const bad = Object.keys(d).filter((k) => !(VENDOR_FIELDS as readonly string[]).includes(k));
            if (bad.length) { res.status(400).json({ ok: false, error: `保存できない項目: ${bad.join("・")}` }); return true; }
          }
          if (col === "settings" && id === "mailTemplates") {  // 差し込み語の綴り間違いを通さない
            for (const [k, t] of Object.entries(data as Record<string, { subject: string; body: string }>)) {
              const v = validateTemplate(t);
              if (!v.ok) { res.status(400).json({ ok: false, error: `${k}: 使えない差し込み ${v.unknown.join("・")}` }); return true; }
            }
          }
          await db.collection(col).doc(String(id)).set({ ...data, updatedAt: new Date().toISOString(), updatedBy: email }, { merge: true });
          res.json({ ok: true });
          return true;
        }
        case "runNow": {                                      // 「いま依頼を出す」（画面から手動で回す）
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          res.json({ ok: true, result: await sendRequests() });
          return true;
        }
        case "replayReply": {                                 // 取りこぼした返信を人が流し込む
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { jobId, body } = req.body ?? {};
          res.json({ ok: true, result: await handleReply(String(jobId), String(body)) });
          return true;
        }
        case "kaitekiToken": {                                // 快適クリーンの業者用URL（発行・再発行）
          const rotate = req.method === "POST" && (req.body as { rotate?: boolean } | undefined)?.rotate === true;
          const token = await kaitekiToken(db, rotate);
          const ks = await db.collection("settings").doc("kaiteki").get();
          res.json({ ok: true, token, notifyTo: String((ks.data() as { notifyTo?: string } | undefined)?.notifyTo ?? "") });
          return true;
        }
        case "exteriorToken": {                               // 外構清掃の業者用URL（発行・再発行）
          const rotate = req.method === "POST" && (req.body as { rotate?: boolean } | undefined)?.rotate === true;
          const token = await exteriorToken(db, rotate);
          const es = await db.collection("settings").doc("exterior").get();
          res.json({ ok: true, token, notifyTo: String((es.data() as { notifyTo?: string } | undefined)?.notifyTo ?? "") });
          return true;
        }
        case "plantingToken": {                               // 業者用カレンダーのトークン（発行・再発行）
          const rotate = req.method === "POST" && (req.body as { rotate?: boolean } | undefined)?.rotate === true;
          const token = await plantingToken(db, rotate);
          const ps = await db.collection("settings").doc("planting").get();
          res.json({ ok: true, token, notifyTo: String((ps.data() as { notifyTo?: string } | undefined)?.notifyTo ?? "") });
          return true;
        }
        case "unmatched": {                                   // 紐付かなかったメール（受信箱・人待ちのみ）
          const snap = await ctx.db.collection("unmatched").where("needsHuman", "==", true).get();
          res.json({ ok: true, rows: snap.docs.map((d) => {
            const x = d.data();
            return { id: d.id, from: x.from, subject: x.subject, at: x.at,
              body: String(x.body ?? "").slice(0, 800) };
          }) });
          return true;
        }
        case "unmatchedResolve": {                            // 消し込み（対応不要・人の判断として記録）
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const uid = String(req.body?.id ?? "");
          if (!uid) { res.status(400).json({ ok: false, error: "idが空です" }); return true; }
          await ctx.db.collection("unmatched").doc(uid).update({
            needsHuman: false,
            resolvedNote: String(req.body?.note ?? "対応不要"),
            resolvedBy: ctx.email, resolvedAt: new Date().toISOString(),
          });
          res.json({ ok: true });
          return true;
        }
        case "construction": {                                // 建築カード（工事資料の台帳・2026-08-27）
          const rows = (await ctx.all("construction")) as Array<Record<string, unknown>>;
          rows.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
          res.json({ ok: true, rows });
          return true;
        }
        case "constructionSave": {                            // 資料1行の登録・更新（原本の所在＝一次事実）
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const b2 = req.body ?? {};
          const site = String(b2.site ?? "");
          if (!["ropponmatsu", "otemon"].includes(site)) {
            res.status(400).json({ ok: false, error: "site は ropponmatsu / otemon" }); return true;
          }
          if (!b2.label) { res.status(400).json({ ok: false, error: "書類名が空です" }); return true; }
          const doc = {
            site, label: String(b2.label), category: String(b2.category ?? "その他"),
            date: String(b2.date ?? ""), path: String(b2.path ?? ""), note: String(b2.note ?? ""),
            updatedAt: new Date().toISOString(), updatedBy: ctx.email,
          };
          if (b2.id) await ctx.db.collection("construction").doc(String(b2.id)).set(doc, { merge: true });
          else await ctx.db.collection("construction").add(doc);
          res.json({ ok: true });
          return true;
        }
        case "constructionDoc": {                             // 原本を一時リンクで開く（contractPdf と同型）
          const gs2 = String(req.query.path ?? "");
          if (!gs2.startsWith("gs://yah-homes-os-archive/")) {
            res.status(400).json({ ok: false, error: "その置き場は開けません" }); return true;
          }
          const [bk2, ...rest2] = gs2.slice(5).split("/");
          const [url2] = await getStorage().bucket(bk2).file(rest2.join("/"))
            .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60 * 1000 });
          res.json({ ok: true, url: url2 });
          return true;
        }
        case "branding": {                                    // Branding カード（アセットは保管庫から毎回引く）
          const [bFiles] = await getStorage().bucket("yah-homes-os-archive")
            .getFiles({ prefix: "branding/" });
          const bDoc = (await db.collection("settings").doc("branding").get()).data() ?? {};
          res.json({ ok: true,
            assets: bFiles.filter((f) => !f.name.endsWith("/")).map((f) => ({
              name: f.name.split("/").pop() ?? f.name,
              use: String((f.metadata?.metadata as Record<string, string> | undefined)?.use ?? ""),
              path: `gs://yah-homes-os-archive/${f.name}`,
            })).sort((a, b) => a.name.localeCompare(b.name)),
            colors: bDoc.colors ?? [], type: bDoc.type ?? [], voice: bDoc.voice ?? [] });
          return true;
        }
  }
  return false;
}

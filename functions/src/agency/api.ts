/**
 * 外部委託の管理API — 画面（os.yah.homes/vendors.html）の唯一の入口
 *
 * agency DB はクライアントから直接読めない（全面拒否ルール）。
 * 読み書きは必ずここを通し、Google ログイン＋管理者台帳で守る。
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { agencyDb, advance, findOverdue, staleHeartbeats } from "./engine.js";
import { DEFAULT_TEMPLATES, validateTemplate, type TemplateKey } from "./templates.js";
import { sendRequests, handleReply } from "./dispatcher.js";
import { loanSummary } from "./finance.js";
import { revenueSummary } from "./revenue.js";
import { utilitySummary } from "./utilities.js";
import { monthlySummary } from "./monthly.js";
import { yieldSummary } from "./yields.js";
import { renewalPlan } from "./lifecycle.js";
import { propertySummary, PROP_FIELDS } from "./props.js";
import { successionSummary } from "./succession.js";
interface Dim { name: string; score: number; weight: number; note?: string }
import { getStorage } from "firebase-admin/storage";

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
        case "succession": {                                  // 事業承継（採点表と分析）
          res.json({ ok: true, ...(await successionSummary()) });
          return;
        }
        case "saveScorecard": {                               // 採点をやり直す（上書きせず日付ごとに積む）
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
          const { date, dimensions, summary, horizon } = req.body ?? {};
          if (!date || !Array.isArray(dimensions)) { res.status(400).json({ ok: false, error: "日付と観点が要ります" }); return; }
          const w = (dimensions as Dim[]).reduce((a, d) => a + Number(d.weight ?? 0), 0);
          if (w !== 100) { res.status(400).json({ ok: false, error: `重みの合計が${w}です。100にしてください` }); return; }
          const total = Math.round((dimensions as Dim[])
            .reduce((a, d) => a + Number(d.score) * Number(d.weight), 0) / 100 * 10) / 10;
          await db.collection("scorecards").doc(String(date)).set({
            kind: "scorecard", date, dimensions, total,
            summary: summary ?? "", horizon: horizon ?? "50年",
            updatedAt: new Date().toISOString(), updatedBy: email,
          }, { merge: true });
          res.json({ ok: true, total });
          return;
        }
        case "properties": {                                  // 物件（棟そのものの属性の正本）
          res.json({ ok: true, ...(await propertySummary()) });
          return;
        }
        case "saveProperty": {                                // 属性の編集は画面から
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
          const { id, data } = req.body ?? {};
          if (!id) { res.status(400).json({ ok: false, error: "棟が指定されていません" }); return; }
          /* 決めた項目以外は保存しない。画面の作り替えで勝手に項目が増えるのを防ぐ */
          const clean: Record<string, unknown> = {};
          for (const k of PROP_FIELDS) if (k in (data ?? {})) clean[k] = (data as Record<string, unknown>)[k];
          if (!Object.keys(clean).length) { res.status(400).json({ ok: false, error: "保存できる項目がありません" }); return; }
          await db.collection("properties").doc(String(id))
            .set({ ...clean, kind: "property", updatedAt: new Date().toISOString(), updatedBy: email }, { merge: true });

          /* 新棟の自動シード（2026-08-24）。準備中の棟には、清川で後追いで集めた
             「追加必須書類」10項目と、定番の周期4件（無効状態）を最初から置いておく。
             次の棟は「空欄が並んでいて埋めていく」形になる。既にあれば触らない。 */
          if (clean.status === "準備中" || clean.planned === true) {
            const ref = db.collection("properties").doc(String(id));
            const snap = await ref.get();
            if (!snap.data()?.requiredDocs) {
              const doc = (label: string, cat: string, need: string, pri: number, note: string) =>
                ({ label, category: cat, necessity: need, priority: pri, status: "未取得", note });
              await ref.set({ requiredDocs: [
                doc("登記事項証明書（全部事項）", "権利・法令", "必須", 1, "所有権・抵当権の根拠。売却・融資で必ず求められる"),
                doc("旅館業の営業許可証", "権利・法令", "必須", 1, "開業時に取得。更新・変更届の期限管理にも要る"),
                doc("消防法令適合通知書", "権利・法令", "必須", 1, "旅館業とセット"),
                doc("地積測量図・公図", "権利・法令", "必須", 2, "境界の根拠"),
                doc("まもりすまい保険等の証券", "建物の維持", "あると効く", 2, "新築10年の瑕疵担保"),
                doc("設備の保証書", "建物の維持", "あると効く", 2, "給湯器・エアコン・冷蔵庫・洗濯機の型番と保証期限"),
                doc("鍵・キーボックスの管理情報", "建物の維持", "あると効く", 2, "個数と場所のみ。暗証番号は置かない"),
                doc("家具・備品のリスト", "運営", "あると効く", 1, "次の棟の予算の基準になる"),
                doc("竣工写真・現況写真", "運営", "あると効く", 3, "原状の証拠・OTA写真の履歴"),
                doc("近隣との取り決め", "運営", "あると効く", 3, "ゴミ出し・駐車場の案内先・騒音"),
              ] }, { merge: true });
              const sched = (sid: string, title: string, months: number[], extra: object) =>
                db.collection("schedules").doc(`${id}-${sid}`).set({
                  title: `${title}（${clean.label ?? id}）`, prop: String(id), months,
                  everyYears: 1, leadDays: 45, statutory: false,
                  active: false, needsDecision: true, vendorId: "",
                  note: "自動シード。時期・業者を確定したら active にする",
                  updatedAt: new Date().toISOString(), ...extra,
                }, { merge: true });
              await sched("shoubou", "消防設備点検", [10], { statutory: true, leadDays: 60 });
              await sched("gaiheki", "外壁クリーニング", [11], { everyYears: 5, leadDays: 90 });
              await sched("hoken", "火災保険の更改", [1], { manualOnly: true, category: "保険" });
              await sched("kotei-shisan", "固定資産税の納税通知書を確認して更新", [4], { manualOnly: true, category: "税金", leadDays: 15 });
            }
          }
          res.json({ ok: true });
          return;
        }
        case "saveLifespan": {                                // 実効年数の手直し（画面から1項目だけ）
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
          const { id, years } = req.body ?? {};
          if (!id) { res.status(400).json({ ok: false, error: "アイテムが指定されていません" }); return; }
          const ref = db.collection("equipment").doc(String(id));
          if (!(await ref.get()).exists) { res.status(404).json({ ok: false, error: "そのアイテムがありません" }); return; }
          /* 空で送られたら手直しを取り消し、耐用年数×使用強度の計算に戻す */
          if (years === null || years === "" || years === undefined) {
            await ref.set({ effectiveYearsOverride: FieldValue.delete(),
              overrideBy: FieldValue.delete(), overrideAt: FieldValue.delete() }, { merge: true });
            res.json({ ok: true, cleared: true });
            return;
          }
          const y = Number(years);
          if (!Number.isFinite(y) || y <= 0 || y > 100) {
            res.status(400).json({ ok: false, error: "年数は 1〜100 で入れてください" }); return;
          }
          await ref.set({ effectiveYearsOverride: Math.round(y * 10) / 10,
            overrideBy: email, overrideAt: new Date().toISOString() }, { merge: true });
          res.json({ ok: true });
          return;
        }
        case "saveEstimate": {                                // 見積の取得状況（未／済）
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
          const { id, obtained } = req.body ?? {};
          if (!id) { res.status(400).json({ ok: false, error: "アイテムが指定されていません" }); return; }
          const ref = db.collection("equipment").doc(String(id));
          if (!(await ref.get()).exists) { res.status(404).json({ ok: false, error: "そのアイテムがありません" }); return; }
          await ref.set({ estimateObtained: !!obtained,
            estimateObtainedAt: obtained ? new Date().toISOString() : FieldValue.delete(),
            estimateObtainedBy: obtained ? email : FieldValue.delete() }, { merge: true });
          res.json({ ok: true });
          return;
        }
        case "contracts": {                                   // 契約書類（原本の所在の正本）
          const snap = await db.collection("contracts").get();
          const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }))
            .sort((a, b) => String((b as { signedAt?: string }).signedAt ?? "")
              .localeCompare(String((a as { signedAt?: string }).signedAt ?? "")));
          /* 期限のあるものは残り日数を出す。切れてから気づくのを防ぐ */
          const today = new Date().toISOString().slice(0, 10);
          const expiring = rows.filter((r) => {
            const e = (r as { expiresAt?: string }).expiresAt;
            return e && e >= today && e <= new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10);
          });
          const expired = rows.filter((r) => {
            const e = (r as { expiresAt?: string }).expiresAt;
            return e && e < today;
          });
          const noOriginal = rows.filter((r) => !(r as { path?: string }).path).length;
          res.json({ ok: true, rows, expiring, expired,
            total: { count: rows.length, noOriginal } });
          return;
        }
        case "saveContract": {
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
          const { id, data } = req.body ?? {};
          if (!id) { res.status(400).json({ ok: false, error: "書類が指定されていません" }); return; }
          const FIELDS = ["label", "category", "prop", "counterparty", "signedAt", "expiresAt",
            "autoRenew", "noticeDays", "amount", "path", "status", "note"];
          const clean: Record<string, unknown> = {};
          for (const k of FIELDS) if (k in (data ?? {})) clean[k] = (data as Record<string, unknown>)[k];
          if (!Object.keys(clean).length) { res.status(400).json({ ok: false, error: "保存できる項目がありません" }); return; }
          await db.collection("contracts").doc(String(id))
            .set({ ...clean, updatedAt: new Date().toISOString(), updatedBy: email }, { merge: true });
          res.json({ ok: true });
          return;
        }
        case "contractPdf": {                                 // 原本を一時リンクで開く
          const gs = String(req.query.path ?? "");
          if (!gs.startsWith("gs://yah-homes-os-archive/")) {
            res.status(400).json({ ok: false, error: "その置き場は開けません" }); return;
          }
          const [bucket, ...rest] = gs.slice(5).split("/");
          const [url] = await getStorage().bucket(bucket).file(rest.join("/"))
            .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60 * 1000 });
          res.json({ ok: true, url });
          return;
        }
        case "propJobs": {                                    // 棟ごとの作業（物件カードの作業タブ）
          const prop = String(req.query.prop ?? "");
          if (!prop) { res.status(400).json({ ok: false, error: "棟が指定されていません" }); return; }
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
          return;
        }
        case "renewalPlan": {                                 // 更新計画（設備台帳から毎回引き直す）
          res.json({ ok: true, ...(await renewalPlan(String(req.query.prop ?? "") || undefined)) });
          return;
        }
        case "yields": {                                      // 利回り（取得価額に対する稼ぎ）
          res.json({ ok: true, ...(await yieldSummary()) });
          return;
        }
        case "monthly": {                                     // 月次のまとめ（各カードの合流点）
          res.json({ ok: true, ...(await monthlySummary()) });
          return;
        }
        case "fixedCosts": {                                  // 税金・保険・積立（毎年決まって出ていくもの）
          const [tax, ins, res_, asm] = await Promise.all([
            all("taxes"), all("insurance"), all("reserves"), all("assumptions")]);
          const sumY = (rows: Array<Record<string, unknown>>, key: string) =>
            rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);
          const taxes = sumY(tax as never, "amountPerYear");
          const premiums = sumY(ins as never, "premiumPerYear");
          const reserves = sumY(res_ as never, "amountPerYear");
          /* 棟数で割れるようにしておく。将来の棟数で引き直すときに使う */
          const props = new Set([...tax, ...ins, ...res_].map((r) => (r as { prop?: string }).prop).filter(Boolean)).size || 1;
          const perYear = taxes + premiums + reserves;
          res.json({
            ok: true, taxes: tax, insurance: ins, reserves: res_, assumptions: asm,
            total: {
              taxesPerYear: taxes, insurancePerYear: premiums, reservesPerYear: reserves,
              perYear, perMonth: Math.round(perYear / 12),
              props, perMonthPerProp: Math.round(perYear / 12 / props),
            },
          });
          return;
        }
        case "drawing": {                                     // 図面データ（非公開の保管庫から一時リンクで開く）
          const gs = String(req.query.path ?? "");
          if (!gs.startsWith("gs://yah-homes-os-archive/")) {
            res.status(400).json({ ok: false, error: "その置き場は開けません" }); return;
          }
          const [bucket, ...rest] = gs.slice(5).split("/");
          const [url] = await getStorage().bucket(bucket).file(rest.join("/"))
            .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60 * 1000 });
          res.json({ ok: true, url });
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
          const { jobId, status, note, actual } = req.body ?? {};
          /* 消し込みの実績。verified にする前に入れておく——advance の中で台帳へ書き戻すため */
          if (actual && typeof actual === "object") {
            const a = actual as { amount?: unknown; ym?: unknown; vendor?: unknown; note?: unknown };
            const amt = Number(a.amount ?? 0);
            if (a.amount != null && (!Number.isFinite(amt) || amt < 0)) {
              res.status(400).json({ ok: false, error: "実額の入れ方が違います" }); return;
            }
            const ym = String(a.ym ?? "");
            if (ym && !/^\d{4}-\d{2}$/.test(ym)) {
              res.status(400).json({ ok: false, error: "実施年月は 2026-08 の形で入れてください" }); return;
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

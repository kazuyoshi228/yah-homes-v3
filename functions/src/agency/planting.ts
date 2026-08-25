/**
 * 植栽メンテ — 業者向け「作業に入れる日」カレンダー（公開・トークン認証）
 * 仕様: docs/spec_planting_schedule_beds24.md（2026-08-25 発注者承認）
 *
 * 作業可能日＝清川のチェックアウト日のみ・11:00〜15:00。
 * 完全空室日は出さない（販売中の在庫。後から予約が入ると作業日が潰れる。
 * チェックアウト日は「確定済みの退去」と「16時チェックイン」に挟まれた窓なので壊れない）。
 *
 * 書けるのは「日付の選択（confirmedジョブ作成）」と「完了報告（done止まり）」だけ。
 * 検収（verified）は人だけ——既存の鉄則のまま。
 */
import { onRequest } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import crypto from "node:crypto";
import { agencyDb } from "./engine.js";
import { sendNotice } from "./mailer.js";
import { loadTemplate, fill } from "./templates.js";

/* 通知の宛先の既定値。正本は settings/planting.notifyTo（カードもそこを表示する＝二重に持たない） */
const NOTIFY_FALLBACK = "kazuyoshi.yamada@bonfire.co.jp, airstar.sugimoto@gmail.com";
import { BEDS24_API, BEDS24_WRITE_REFRESH, beds24WriteToken, BOOKING_PROP_IDS } from "../beds24Client.js";

const REGION = "asia-northeast1";
/* niwa.html の置き場。トークンはクエリで来る（POSTボディでも受ける） */
const ALLOW_ORIGIN = ["https://os.yah.homes", "https://yah-os.web.app", "http://localhost:5050"];

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/* 通知メールのHTML（yah.homesのトーン: 生成り背景・緑・yah.ワードマーク。
   メールはCSS対応が貧弱なので全部インラインで書く） */
function noticeHtml(title: string, bodyText: string): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const bodyHtml = esc(bodyText).replace(/\n/g, "<br>");
  /* Gmail は <body> タグとそのスタイルを捨てる。背景色は table の bgcolor で持たせないと
     白地に戻る（2026-08-25 実機で発覚）。ロゴも背景焼き込み版を使う */
  return `<!doctype html><html><head><meta name="color-scheme" content="dark"></head>` +
    `<body style="margin:0;padding:0;background:#0f0f0f">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0f0f0f" ` +
    `style="background:#0f0f0f;margin:0;padding:0;width:100%"><tr><td align="center" ` +
    `style="padding:28px 14px;font-family:-apple-system,'Hiragino Sans','Yu Gothic',sans-serif">` +
    `<table role="presentation" width="460" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;width:100%">` +
    `<tr><td align="center" style="padding:0 0 14px">` +
    `<img src="https://os.yah.homes/logo-yah-onblack.png" alt="yah." width="72" height="72" style="display:block;border:0">` +
    `</td></tr>` +
    `<tr><td bgcolor="#1a1a1a" style="background:#1a1a1a;border:1px solid #2e2e2e;border-radius:12px;padding:22px">` +
    `<p style="margin:0 0 14px;color:#63d297;font-size:15px;font-weight:700">${esc(title)}</p>` +
    `<p style="margin:0;color:#e2e2e2;font-size:14px;line-height:2.0">${bodyHtml}</p>` +
    `</td></tr>` +
    `<tr><td style="padding:14px 0 0;color:#6a6a6a;font-size:11px;line-height:1.7">` +
    `yah. 自動手配（AI）／このメールは清川の植栽カレンダーから自動送信されています。文面はメンテナンスカード > 定型メール で編集できます` +
    `</td></tr></table></td></tr></table></body></html>`;
}

/** テンプレを差し込んで送る（文面の正本は 定型メール＝mailTemplates。ここに文章を書かない） */
async function sendPlantingNotice(key: "plantingSelect" | "plantingUnselect" | "plantingReport",
  to: string, vars: Record<string, string>): Promise<void> {
  const t = await loadTemplate(key);
  const subject = fill(t.subject, vars);
  const body = fill(t.body, vars);
  await sendNotice({ to, subject, body, html: noticeHtml(t.label.replace(/^植栽: /, ""), body) });
}
const jpDate = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${y}年${m}月${dd}日（${"日月火水木金土"[new Date(y, m - 1, dd).getDay()]}）`;
};

/** チェックアウト日を Beds24 から引く（1時間キャッシュ・清川のみ） */
async function checkoutDays(db: FirebaseFirestore.Firestore): Promise<{ dates: string[]; asOf: string }> {
  const ref = db.collection("beds24cache").doc("planting");
  const c = await ref.get();
  const cached = c.exists ? (c.data() as { dates: string[]; at: string }) : null;
  if (cached && Date.now() - Date.parse(cached.at) < 3600e3) {
    return { dates: cached.dates, asOf: cached.at };
  }
  try {
    const token = await beds24WriteToken();
    const from = day(Date.now());
    /* 表示は直近2ヶ月のみ（2026-08-25 発注者指示。遠い日程は予約で埋まって剥がれるため） */
    const to = day(Date.now() + 61 * 86400000);
    const dates = new Set<string>();
    let next: string | null =
      `${BEDS24_API}/bookings?propertyId=${BOOKING_PROP_IDS.kiyokawa}` +
      `&departureFrom=${from}&departureTo=${to}&pageSize=200`;
    while (next) {
      const r = (await fetch(next, { headers: { token } }).then((x) => x.json())) as {
        success?: boolean; data?: Array<{ departure?: string; status?: string }>;
        pages?: { nextPageExists?: boolean; nextPageLink?: string };
      };
      if (!r.success) throw new Error(`beds24: ${JSON.stringify(r).slice(0, 200)}`);
      for (const b of r.data ?? []) {
        /* キャンセル・ブラックは窓にならない */
        if (b.departure && !["cancelled", "black"].includes(String(b.status))) dates.add(b.departure);
      }
      next = r.pages?.nextPageExists ? (r.pages.nextPageLink ?? null) : null;
    }
    const sorted = [...dates].filter((d) => d >= from && d <= to).sort();
    const at = new Date().toISOString();
    await ref.set({ dates: sorted, at });
    return { dates: sorted, asOf: at };
  } catch (e) {
    /* Beds24が落ちていたら最後の断面を「いつのものか」つきで返す。それも無ければ空＝誤った○を出さない */
    if (cached) return { dates: cached.dates, asOf: cached.at };
    throw e;
  }
}

/** 選択済み（＝業者が押さえた日）。ジョブが正本。キャンセル済みは空きに戻る */
async function takenDates(db: FirebaseFirestore.Firestore): Promise<Map<string, string>> {
  const snap = await db.collection("jobs")
    .where("category", "==", "植栽").where("prop", "==", "kiyokawa").get();
  const m = new Map<string, string>();
  for (const d of snap.docs) {
    const j = d.data() as { plantingDate?: string; status?: string };
    if (j.plantingDate && j.status !== "cancelled") m.set(j.plantingDate, d.id);
  }
  return m;
}

/** 1時間あたりの書き込み上限（トークン漏れ時のノイズ抑え） */
async function rateOk(db: FirebaseFirestore.Firestore): Promise<boolean> {
  const hour = new Date().toISOString().slice(0, 13);
  const ref = db.collection("beds24cache").doc("plantingRate");
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const d = s.exists ? (s.data() as { hour: string; n: number }) : { hour, n: 0 };
    const n = d.hour === hour ? d.n + 1 : 1;
    tx.set(ref, { hour, n });
    return n <= 10;
  });
}

export const plantingCal = onRequest(
  { region: REGION, secrets: [BEDS24_WRITE_REFRESH], maxInstances: 2 },
  async (req, res) => {
    const origin = String(req.headers.origin ?? "");
    if (ALLOW_ORIGIN.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Allow-Methods", "GET, POST");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    try {
      const db = agencyDb();
      /* トークン照合。不一致は404＝存在を教えない */
      const t = String(req.query.t ?? (req.body as { t?: string } | undefined)?.t ?? "");
      const st = await db.collection("settings").doc("planting").get();
      const sd = (st.data() ?? {}) as { token?: string; notifyTo?: string };
      const token = String(sd.token ?? "");
      const notifyTo = String(sd.notifyTo ?? "") || NOTIFY_FALLBACK;
      if (!token || !t || t !== token) { res.status(404).send("not found"); return; }

      if (req.method === "GET") {
        const [{ dates, asOf }, taken] = await Promise.all([checkoutDays(db), takenDates(db)]);
        res.json({
          ok: true, prop: "kiyokawa", propLabel: "清川", window: "11:00〜15:00", asOf,
          days: dates.map((d) => ({ date: d, taken: taken.has(d) })),
        });
        return;
      }

      if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
      const body = (req.body ?? {}) as {
        action?: string; date?: string; vendor?: string; text?: string; amount?: number;
        photos?: Array<{ name?: string; b64?: string }>;
      };
      if (!(await rateOk(db))) { res.status(429).json({ ok: false, error: "しばらく待ってから送ってください" }); return; }
      const now = new Date().toISOString();

      if (body.action === "select") {
        const date = String(body.date ?? "");
        const vendor = String(body.vendor ?? "").slice(0, 60);
        const [{ dates }, taken] = await Promise.all([checkoutDays(db), takenDates(db)]);
        if (!dates.includes(date)) { res.status(400).json({ ok: false, error: "この日は作業できません（予約状況が変わった可能性）" }); return; }
        if (taken.has(date)) { res.status(409).json({ ok: false, error: "この日は既に選択されています" }); return; }
        const ref = await db.collection("jobs").add({
          type: "spot", source: "niwa", category: "植栽", prop: "kiyokawa",
          title: `植栽作業（清川・${date} 11:00〜15:00）`,
          dueMonth: date.slice(0, 7), plantingDate: date, vendorName: vendor,
          status: "confirmed", createdAt: now,
          note: "業者がカレンダーから日程を選択（自動確定・取消はメンテナンスカードで）",
          timeline: [{ at: now, status: "confirmed", by: "vendor", note: `${vendor || "業者"} が ${date} を選択（niwa）` }],
        });
        await sendPlantingNotice("plantingSelect", notifyTo, {
          jobId: ref.id, propLabel: "清川", plantingDate: jpDate(date), vendorName: vendor || "—",
        }).catch(() => { /* 通知失敗でも選択は成立させる */ });
        res.json({ ok: true, jobId: ref.id });
        return;
      }

      /* 選び直し: 業者が自分の選択を取り消す。done（報告済み）以降は取り消せない */
      if (body.action === "unselect") {
        const date = String(body.date ?? "");
        const taken = await takenDates(db);
        const jobId = taken.get(date);
        if (!jobId) { res.status(404).json({ ok: false, error: "この日は選択されていません" }); return; }
        const ref = db.collection("jobs").doc(jobId);
        const j = (await ref.get()).data() as { status?: string; source?: string; vendorName?: string; timeline?: unknown[] };
        if (j.source !== "niwa" || j.status !== "confirmed") {
          res.status(409).json({ ok: false, error: "この日は取り消せません（報告済みか、こちらで確定済み）" }); return;
        }
        await ref.set({ status: "cancelled",
          timeline: [...(j.timeline ?? []), { at: now, status: "cancelled", by: "vendor", note: "業者がカレンダーから取消（niwa）" }],
        }, { merge: true });
        await sendPlantingNotice("plantingUnselect", notifyTo, {
          jobId, propLabel: "清川", plantingDate: jpDate(date), vendorName: String(j.vendorName ?? "—"),
        }).catch(() => { /* 通知失敗でも取消は成立 */ });
        res.json({ ok: true });
        return;
      }

      if (body.action === "report") {
        const date = String(body.date ?? "");
        const text = String(body.text ?? "").slice(0, 2000);
        const amount = Number(body.amount ?? 0) || null;
        if (!date || !text) { res.status(400).json({ ok: false, error: "日付と作業内容を入れてください" }); return; }
        /* 写真は5枚・各5MBまで。保管庫へ */
        const photos: string[] = [];
        const bucket = getStorage().bucket("yah-homes-os-archive");
        for (const [i, ph] of (body.photos ?? []).slice(0, 5).entries()) {
          const buf = Buffer.from(String(ph.b64 ?? ""), "base64");
          if (!buf.length || buf.length > 5 * 1024 * 1024) continue;
          const safe = String(ph.name ?? "photo").replace(/[^\w.\-]/g, "_").slice(0, 60);
          const path = `reports/planting-work/${date.slice(0, 7)}/${date}_${i + 1}_${safe}`;
          await bucket.file(path).save(buf, { contentType: "image/jpeg" });
          photos.push(`gs://yah-homes-os-archive/${path}`);
        }
        const taken = await takenDates(db);
        const ev = { at: now, status: "done", by: "vendor", note: `業者報告: ${text}${amount ? `／金額 ¥${amount.toLocaleString()}` : ""}` };
        let jobId = taken.get(date);
        if (jobId) {
          const ref = db.collection("jobs").doc(jobId);
          const cur = (await ref.get()).data() as { timeline?: unknown[]; photos?: string[] };
          await ref.set({
            status: "done", vendorReported: true, reportText: text, reportAmount: amount, reportedAt: now,
            photos: [...(cur.photos ?? []), ...photos],
            timeline: [...(cur.timeline ?? []), ev],
          }, { merge: true });
        } else {
          /* 選択なしの飛び込み報告は、vendorReported付きの突発ジョブとして残す */
          const ref = await db.collection("jobs").add({
            type: "spot", source: "niwa", category: "植栽", prop: "kiyokawa",
            title: `植栽作業（清川・${date}・報告のみ）`, dueMonth: date.slice(0, 7), plantingDate: date,
            status: "done", vendorReported: true, reportText: text, reportAmount: amount,
            reportedAt: now, createdAt: now, photos, timeline: [ev],
          });
          jobId = ref.id;
        }
        await sendPlantingNotice("plantingReport", notifyTo, {
          jobId, propLabel: "清川", plantingDate: jpDate(date),
          reportText: text, photoCount: String(photos.length),
        }).catch(() => { /* 通知失敗でも報告は残る */ });
        res.json({ ok: true, jobId, photos: photos.length });
        return;
      }

      res.status(400).json({ ok: false, error: "unknown action" });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

/** オーナー側のトークン管理（agencyApi から呼ぶ）。無ければ発行、rotate で作り直し */
export async function plantingToken(db: FirebaseFirestore.Firestore, rotate: boolean): Promise<string> {
  const ref = db.collection("settings").doc("planting");
  const s = await ref.get();
  const cur = s.exists ? String((s.data() as { token?: string }).token ?? "") : "";
  if (cur && !rotate) return cur;
  const token = crypto.randomBytes(24).toString("base64url");
  await ref.set({ token, updatedAt: new Date().toISOString() }, { merge: true });
  return token;
}

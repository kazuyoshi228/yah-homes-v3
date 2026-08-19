/**
 * ディスパッチャ — ジョブを1件ずつ前に進める本体
 *
 * エンジン（いつ・何を）と、メール（送る）と、読解（返事の意味）を束ねる。
 * ここが「AIが業者と往復する」実体。
 *
 * 原則:
 *  - 人の判断が要るものは進めず exception にして通知する（黙って進めない）
 *  - 送信はドライラン中なら下書きに落ちる（mailer が判断）
 *  - 全ての送受信・判断を timeline と messages に残す（append-only）
 */
import { agencyDb, advance } from "./engine.js";
import { sendOrDraft, requestMailBody } from "./mailer.js";
import { loadTemplate, fill } from "./templates.js";
import { readReply, withinWindow, suggestDates, type ReadResult } from "./reader.js";
import { contacts, notifySettings } from "./settings.js";
import type { Job, Vendor } from "./model.js";

const PROP_LABEL: Record<string, string> = {
  kiyokawa: "清川", takasago: "高砂", ropponmatsu: "六本松", otemonA: "大手門A", otemonB: "大手門B",
};

const tagOf = (jobId: string) => jobId.slice(0, 8).toUpperCase();

async function vendorOf(job: Job): Promise<Vendor | null> {
  if (!job.vendorId) return null;
  const d = await agencyDb().collection("vendors").doc(job.vendorId).get();
  return (d.data() as Vendor) ?? null;
}

/** テンプレートの差し込み値。SSoT（設定・業者・ジョブ）から作る */
async function varsFor(job: Job & { id?: string }, vendor: Vendor, extra: Record<string, string> = {}) {
  const c = await contacts();
  const n = await notifySettings();
  const [y, m] = job.dueMonth.split("-");
  return {
    vendorName: vendor.name, vendorContact: vendor.contact ?? "ご担当者",
    propLabel: PROP_LABEL[job.prop] ?? job.prop, title: job.title,
    dueYear: y, dueMonth: String(Number(m)),
    confirmedAt: job.confirmedAt ?? "", jobId: tagOf(job.id ?? ""),
    aiAddress: n.aiAddress, vendorPhone: c.vendorPhone || "（担当までご連絡ください）",
    legalName: c.legalName, address: "", candidates: "",
    ...extra,
  };
}

/** 1件のジョブについて、テンプレートでメールを作って送る（またはドライランで下書き） */
async function sendFromTemplate(
  jobId: string, job: Job, vendor: Vendor,
  key: Parameters<typeof loadTemplate>[0], extra: Record<string, string> = {},
): Promise<{ mode: string; id: string }> {
  const t = await loadTemplate(key);
  const vars = await varsFor({ ...job, id: jobId }, vendor, extra);
  const subject = fill(t.subject, vars);
  const body = fill(t.body, vars);
  const r = await sendOrDraft({ to: vendor.email!, subject, body, threadId: (job as { threadId?: string }).threadId });
  await agencyDb().collection("jobs").doc(jobId).collection("messages").add({
    at: new Date().toISOString(), direction: "out", by: "ai",
    subject, body, mode: r.mode, cc: r.cc, gmailId: r.id,
  });
  return r;
}

/** ① 起票済み(draft)のジョブに依頼メールを出す */
export async function sendRequests(): Promise<Array<{ jobId: string; mode: string }>> {
  const db = agencyDb();
  const snap = await db.collection("jobs").where("status", "==", "draft").get();
  const out: Array<{ jobId: string; mode: string }> = [];
  for (const doc of snap.docs) {
    const job = doc.data() as Job & { aiPaused?: boolean; requestMailAt?: string; manualOnly?: boolean };
    if (job.aiPaused) continue;   // 人が対応中のジョブは触らない
    /* 保険の更改のように、相手が業者ではなく代理店の作業。
       期日の見張りはするが、AIは依頼メールを出さない（例外にも落とさない）。 */
    if (job.manualOnly) continue;
    /* ドライラン中は下書きを作っても status が draft のまま残る。
       ここで弾かないと毎朝おなじ依頼の下書きが増え続ける（2026-08-19 本番の初回実行で判明）。 */
    if (job.requestMailAt) continue;
    const vendor = await vendorOf(job);
    if (!vendor?.email) {                       // メールの無い業者は自動化の対象外
      await advance(doc.id, "exception", "system", `業者にメールアドレスが無い（${vendor?.name ?? "未設定"}）。人が手配する`);
      continue;
    }
    const r = await sendFromTemplate(doc.id, job, vendor, "request");
    await db.collection("jobs").doc(doc.id).update({ requestMailAt: new Date().toISOString() });
    await advance(doc.id, r.mode === "sent" ? "sent" : "draft", "ai",
      r.mode === "sent" ? "依頼メールを送信" : "依頼メールを下書きに作成（ドライラン中・人が送信する）");
    out.push({ jobId: doc.id, mode: r.mode });
  }
  return out;
}

/** ② 業者の返信を読んで、次の一手を打つ */
export async function handleReply(jobId: string, body: string): Promise<{ action: string; detail: string }> {
  const db = agencyDb();
  const ref = db.collection("jobs").doc(jobId);
  const job = { ...(await ref.get()).data(), id: jobId } as Job & { id: string; threadId?: string; aiPaused?: boolean };
  if (job.aiPaused) return { action: "paused", detail: "人が対応中のためAIは動かない" };
  const vendor = await vendorOf(job);
  if (!vendor) return { action: "exception", detail: "業者が特定できない" };

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  /* 期日を過ぎたジョブは、AIが交渉を続けても業者に不自然な提案をするだけになる。
     人が事情を判断すべき段階なので、読解の前に例外へ回す（2026-08-19 実地検証で判明）。 */
  if (job.dueMonth < today.slice(0, 7)) {
    await advance(jobId, "exception", "ai", `期日（${job.dueMonth}）を過ぎているため、日程は人が調整する`);
    return { action: "escalate", detail: `期日超過（${job.dueMonth}）` };
  }
  const read: ReadResult = await readReply({ job, vendorName: vendor.name, body, today });

  // AIの判断を必ず記録する（後から検証できるように）
  await ref.collection("messages").add({
    at: new Date().toISOString(), direction: "in", by: "vendor", body,
    interpretation: { label: read.intent, confidence: read.confidence, note: read.note },
  });

  if (read.needsHuman) {
    await advance(jobId, "exception", "ai", `人の判断が必要: ${read.note}（${read.reason}）`);
    return { action: "escalate", detail: read.reason };
  }

  if (read.intent === "completed") {
    await ref.update({ report: { at: read.completedOn ?? today, photos: [], note: read.note } });
    await advance(jobId, "done", "ai", `完了報告を受領（${read.completedOn ?? today}）。検品へ`);
    return { action: "completed", detail: read.completedOn ?? today };
  }

  if (read.intent === "accept" || read.intent === "propose") {
    // 制約内の日付だけを採用する（AIの読解が正しくても窓の外は使わない）
    const ok = read.proposedDates.filter((d) => withinWindow(d, job.dueMonth));
    if (ok.length) {
      await ref.update({ confirmedAt: ok[0] });
      await sendFromTemplate(jobId, { ...job, confirmedAt: ok[0] }, vendor, "confirm");
      await advance(jobId, "confirmed", "ai", `${ok[0]} で確定`);
      return { action: "confirmed", detail: ok[0] };
    }
    // 窓の外だった → 代替日を提案する
    const cands = suggestDates(job.dueMonth, read.proposedDates);
    if (!cands.length) {
      await advance(jobId, "exception", "ai", "作業可能な候補日が作れない（期日と予約の制約）");
      return { action: "escalate", detail: "候補日なし" };
    }
    await sendFromTemplate(jobId, job, vendor, "reschedule", { candidates: cands.map((d) => `　・${d}`).join("\n") });
    await advance(jobId, "negotiating", "ai", `候補日を提案: ${cands.join(" / ")}`);
    return { action: "reschedule", detail: cands.join(" / ") };
  }

  if (read.intent === "reject") {
    await advance(jobId, "exception", "ai", `業者が受けられないと回答: ${read.note}`);
    return { action: "escalate", detail: read.note };
  }

  await advance(jobId, "exception", "ai", `分類できない返信: ${read.note}`);
  return { action: "escalate", detail: read.note };
}

/**
 * 受信 — 業者ディスパッチ仕様書 §4
 *
 * Gmail watch（Pub/Sub プッシュ）で新着を即時に受け、ジョブへ紐付けて記録する。
 * ここでは「読んで記録する」までを担当し、返信の判断は reader（B-8）に渡す。
 *
 * 紐付けの規則:
 *   1. 件名の [yah-XXXXXXXX] （ジョブIDの先頭8桁）
 *   2. 無ければ From の一致 × 直近30日のジョブ（1件に絞れるときだけ）
 *   3. 絞れなければ「未紐付け」として記録し、人へ回す（推測で結び付けない）
 */
import { google } from "googleapis";
import { agencyDb } from "./engine.js";
import { gmailAuthFromKey, AI_ADDRESS } from "./mailer.js";

const gmail = () => google.gmail({ version: "v1", auth: gmailAuthFromKey(process.env.AGENCY_MAILER_KEY ?? "") as never });

/** watch の登録（有効期限は7日なので、日次で貼り直す） */
export async function startWatch(): Promise<{ historyId: string; expiration: string }> {
  const r = await gmail().users.watch({
    userId: "me",
    requestBody: {
      topicName: "projects/yah-homes/topics/agency-gmail",
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    },
  });
  const historyId = String(r.data.historyId);
  await agencyDb().collection("settings").doc("gmail").set(
    { historyId, expiration: String(r.data.expiration), watchedAt: new Date().toISOString() }, { merge: true });
  return { historyId, expiration: String(r.data.expiration) };
}

const header = (h: Array<{ name?: string | null; value?: string | null }> | undefined, key: string) =>
  h?.find((x) => x.name?.toLowerCase() === key.toLowerCase())?.value ?? "";

/** 本文を平文で取り出す（HTMLしか無い場合はタグを落とす） */
function extractBody(payload: unknown): string {
  const walk = (p: { mimeType?: string | null; body?: { data?: string | null }; parts?: unknown[] } | undefined): string => {
    if (!p) return "";
    if (p.body?.data && (p.mimeType === "text/plain" || !p.parts)) {
      const t = Buffer.from(p.body.data, "base64").toString("utf8");
      return p.mimeType === "text/html" ? t.replace(/<[^>]+>/g, " ") : t;
    }
    for (const part of (p.parts ?? []) as typeof p[]) {
      const t = walk(part);
      if (t) return t;
    }
    return "";
  };
  return walk(payload as never).trim();
}

export interface IncomingMail {
  gmailId: string; threadId: string; from: string; subject: string; body: string;
  receivedAt: string; attachments: Array<{ filename: string; attachmentId: string; mimeType: string }>;
}

/** historyId 以降の新着を取り出す */
export async function fetchNew(sinceHistoryId: string): Promise<IncomingMail[]> {
  const g = gmail();
  const h = await g.users.history.list({ userId: "me", startHistoryId: sinceHistoryId, historyTypes: ["messageAdded"] });
  const ids = [...new Set((h.data.history ?? []).flatMap((x) => (x.messagesAdded ?? []).map((m) => m.message?.id)).filter(Boolean))] as string[];

  const out: IncomingMail[] = [];
  for (const id of ids) {
    const m = await g.users.messages.get({ userId: "me", id, format: "full" });
    const hs = m.data.payload?.headers ?? undefined;
    const from = header(hs, "From");
    if (from.includes(AI_ADDRESS)) continue;   // 自分の送信は取り込まない
    const parts = (m.data.payload?.parts ?? []) as Array<{ filename?: string | null; mimeType?: string | null; body?: { attachmentId?: string | null } }>;
    out.push({
      gmailId: id,
      threadId: String(m.data.threadId),
      from, subject: header(hs, "Subject"),
      body: extractBody(m.data.payload),
      receivedAt: new Date(Number(m.data.internalDate)).toISOString(),
      attachments: parts.filter((p) => p.filename && p.body?.attachmentId)
        .map((p) => ({ filename: p.filename!, attachmentId: p.body!.attachmentId!, mimeType: p.mimeType ?? "" })),
    });
    if (h.data.historyId) {
      await agencyDb().collection("settings").doc("gmail").set({ historyId: String(h.data.historyId) }, { merge: true });
    }
  }
  return out;
}

/** ジョブへの紐付け。確信が持てないときは null を返す（推測しない） */
export async function matchJob(mail: IncomingMail): Promise<{ jobId: string; how: "subject" | "sender" } | null> {
  const db = agencyDb();
  const tag = /\[yah-([A-Za-z0-9]{4,})\]/.exec(mail.subject);
  if (tag) {
    const snap = await db.collection("jobs").get();
    const hit = snap.docs.find((d) => d.id.slice(0, 8).toUpperCase() === tag[1].toUpperCase());
    if (hit) return { jobId: hit.id, how: "subject" };
  }
  // 件名で分からないときは、送信元と直近のジョブから絞る（1件に定まるときだけ）
  const email = /<([^>]+)>/.exec(mail.from)?.[1] ?? mail.from.trim();
  const vendors = await db.collection("vendors").where("email", "==", email).get();
  if (vendors.size !== 1) return null;
  const vendorId = vendors.docs[0].id;
  const jobs = await db.collection("jobs")
    .where("vendorId", "==", vendorId)
    .where("status", "in", ["sent", "negotiating", "confirmed", "done"]).get();
  return jobs.size === 1 ? { jobId: jobs.docs[0].id, how: "sender" } : null;
}

/**
 * 引き継ぎ検知 — スレッドに人間の送信があれば、そのジョブでAIは手を引く。
 * 人とAIが同じ相手に二重に返信する事故を防ぐ（仕様書 §4）。
 * 判定: AIが出したメール（messages.by="ai"）以外の送信が Gmail スレッドにあるか。
 */
export async function detectHumanTakeover(jobId: string, threadId: string): Promise<boolean> {
  const g = gmail();
  const t = await g.users.threads.get({ userId: "me", id: threadId, format: "metadata" });
  const db = agencyDb();
  const aiIds = new Set((await db.collection("jobs").doc(jobId).collection("messages").where("direction", "==", "out").get())
    .docs.map((d) => String(d.data().gmailId ?? "")));
  const humanSent = (t.data.messages ?? []).some((m) => {
    const from = (m.payload?.headers ?? []).find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
    return from.includes(AI_ADDRESS) && !aiIds.has(String(m.id));   // AIの箱から出たがAIの記録に無い = 人が送った
  });
  if (humanSent) {
    await db.collection("jobs").doc(jobId).update({
      aiPaused: true, aiPausedAt: new Date().toISOString(),
      aiPausedReason: "スレッドに人の送信を検知したため、AIは手を引きました",
    });
  }
  return humanSent;
}

/** 受信を記録する（append-only）。紐付かないものは unmatched に積んで人へ回す */
export async function record(mail: IncomingMail, jobId: string | null): Promise<void> {
  const db = agencyDb();
  const doc = {
    at: mail.receivedAt, direction: "in" as const, by: "vendor" as const,
    subject: mail.subject, body: mail.body, gmailId: mail.gmailId, threadId: mail.threadId,
    attachments: mail.attachments.map((a) => a.filename),
  };
  if (jobId) {
    await db.collection("jobs").doc(jobId).collection("messages").add(doc);
    await db.collection("jobs").doc(jobId).update({ updatedAt: new Date().toISOString(), threadId: mail.threadId });
  } else {
    await db.collection("unmatched").add({ ...doc, from: mail.from, needsHuman: true });
  }
}

/**
 * 取込のAI化（段D・spec_ai_deepening_20260827・2026-08-27 発注者承認「メールに投げたら、OSに自動で反映」）
 *
 * オーナーが ai.yamada@ へ転送したスクショ・PDFを、AIが読取って「下書き」にする。
 * 正本に入るのは人の検収クリックのみ（fail-closed）。
 *
 * 流れ: Gmail添付 → 保管庫(gs://…/intake/) → Gemini読取（種類判定＋構造化）→ intake台帳(draft)
 *      → OSの受信箱で検収 → 種類ごとの正本へ（cash 等）。原本パスは正本の行に残る（リネージ）。
 */
// Gmail だけを使うので Gmail 専用パッケージにする（2026-09-03）。
// googleapis 全部入りは 209MB あり、Cloud Build が毎回それを取得・展開するため
// Functions のデプロイが目に見えて遅くなっていた。@googleapis/gmail は 1.1MB。
import { gmail as gmailApi } from "@googleapis/gmail";
import { getStorage } from "firebase-admin/storage";
import { GoogleGenAI, Type } from "@google/genai";
import { agencyDb } from "./engine.js";
import { gmailAuthFromKey } from "./mailer.js";
import type { IncomingMail } from "./inbox.js";

const OWNER = "kazuyoshi.yamada@bonfire.co.jp";
const BUCKET = "yah-homes-os-archive";
const READABLE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export const isOwnerIntake = (mail: IncomingMail): boolean =>
  mail.from.toLowerCase().includes(OWNER) && mail.attachments.some((a) => READABLE_MIME.has(a.mimeType));

const EXTRACT_PROMPT = `これは宿泊事業の経営OSへ取り込む書類の画像/PDFです。種類を判定し、数値を構造化してください。
種類（kind）:
- "cash": マネーフォワード等の口座残高一覧。accounts: [{name, balance}]（balanceは円の整数）と total、写っていれば date(YYYY-MM-DD)
- "cvr": Airbnb等の統計画面。rows: [{label, impressions, views, bookings}] など読み取れた指標
- "revenue": 運営会社の月次売上報告。month(YYYY-MM), prop(施設名), revenue, expenses, payout, occ, adr のうち読み取れたもの
- "journal": 仕訳・取引明細の一覧。rows: [{date, description, amount}]
- "airdna": AirDNAの市場データ画面。読み取れた指標を fields に
- "vendor": 業者・取引先の情報（名刺・連絡先画面・会社概要など）。vendors: [{name(社名/屋号), person(担当者), phone, email, address, service(何の業者か)}]（複数可・読み取れた項目のみ）
- "other": 上記以外
出力はJSONのみ: {"kind": "...", "confidence": 0-1, "summary": "1行の日本語要約", "data": {...}}
数値は必ず画像から読む。読めない項目は入れない（推測で埋めない）。`;

/** 添付を保管庫へ移し、Geminiで読取り、intake(draft) に積む */
export async function processIntake(mail: IncomingMail): Promise<number> {
  const gmail = gmailApi({ version: "v1", auth: gmailAuthFromKey(process.env.AGENCY_MAILER_KEY ?? "") as never });
  const ai = new GoogleGenAI({ vertexai: true, project: "yah-homes", location: "global" });
  const db = agencyDb();
  const ym = mail.receivedAt.slice(0, 7);
  let n = 0;

  for (const att of mail.attachments) {
    if (!READABLE_MIME.has(att.mimeType)) continue;
    try {
      const a = await gmail.users.messages.attachments.get({
        userId: "me", messageId: mail.gmailId, id: att.attachmentId });
      const b64 = String(a.data.data ?? "").replace(/-/g, "+").replace(/_/g, "/");
      const safe = att.filename.replace(/[^\w.\-]/g, "_").slice(-60);
      const path = `intake/${ym}/${mail.gmailId}-${n}-${safe}`;
      await getStorage().bucket(BUCKET).file(path).save(Buffer.from(b64, "base64"),
        { contentType: att.mimeType });

      let extracted: Record<string, unknown> = { kind: "other", confidence: 0, summary: "読取り失敗", data: {} };
      try {
        /* flashで十分（定型書類のOCR構造化・コスト約1/10）。スキーマはAPI側で強制し、
           kind検証・confidenceクランプ・途切れ検知をコードでも行う（レビュー2026-08-28 P1: AI出力を信じすぎない） */
        const r = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [
            { inlineData: { mimeType: att.mimeType, data: b64 } },
            { text: EXTRACT_PROMPT }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                kind: { type: Type.STRING, enum: ["cash", "cvr", "revenue", "journal", "airdna", "vendor", "other"] },
                confidence: { type: Type.NUMBER },
                summary: { type: Type.STRING },
                data: { type: Type.OBJECT },
              },
              required: ["kind", "confidence", "summary", "data"],
            },
            maxOutputTokens: 8000,
          },
        });
        const cand = r.candidates?.[0];
        if (cand?.finishReason && cand.finishReason !== "STOP") {
          throw new Error(`生成が完走しなかった（${cand.finishReason}）`);
        }
        extracted = JSON.parse(cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}");
        const KINDS = new Set(["cash", "cvr", "revenue", "journal", "airdna", "vendor", "other"]);
        if (!KINDS.has(String(extracted.kind))) extracted.kind = "other";
        extracted.confidence = Math.min(1, Math.max(0, Number(extracted.confidence ?? 0)));
        if (Number(extracted.confidence) < 0.7) extracted.summary = `【要目視】${String(extracted.summary ?? "")}`;
      } catch (e) {
        extracted.summary = `読取り失敗: ${String((e as Error).message).slice(0, 200)}`;
      }

      /* docID = gmailId-連番 の create() で再配信の二重下書きを弾く（冪等・レビュー2026-08-28） */
      await db.collection("intake").doc(`${mail.gmailId}-${n}`).create({
        at: mail.receivedAt, from: mail.from, subject: mail.subject,
        filename: att.filename, mimeType: att.mimeType, gsPath: `gs://${BUCKET}/${path}`,
        kind: String(extracted.kind ?? "other"),
        confidence: Number(extracted.confidence ?? 0),
        summary: String(extracted.summary ?? ""),
        data: extracted.data ?? {},
        status: "draft", createdAt: new Date().toISOString(),
      });
      n++;
    } catch (e) {
      if ((e as { code?: number }).code === 6) { n++; continue; }   // ALREADY_EXISTS = 再配信・処理済み
      await db.collection("intake").doc(`${mail.gmailId}-${n}-err`).set({
        at: mail.receivedAt, from: mail.from, subject: mail.subject,
        filename: att.filename, kind: "other", confidence: 0, data: {},
        summary: `取込失敗: ${String((e as Error).message).slice(0, 200)}`,
        status: "draft", createdAt: new Date().toISOString(),
      });
    }
  }
  return n;
}

/** 検収 — 種類ごとの正本へ書く（人のクリックだけがここに来る）。対応済み: cash */
export async function acceptIntake(id: string, email: string): Promise<{ wrote: string }> {
  const db = agencyDb();
  const ref = db.collection("intake").doc(id);
  /* 二重検収の防止（レビュー2026-08-28 #8）: draft→accepting をトランザクションで先取りする。
     ダブルクリックや再送は2回目がここで止まる（vendorsのadd()が二重登録になるのを防ぐ） */
  const doc = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!d) throw new Error("取込が見つかりません");
    if (d.status !== "draft") throw new Error("既に処理済みです");
    tx.update(ref, { status: "accepting" });
    return d;
  });

  let wrote = "";
  try {
  if (doc.kind === "cash") {
    const d = doc.data as { date?: string; total?: number; accounts?: Array<{ name: string; balance: number }> };
    const date = String(d.date ?? doc.at.slice(0, 10));
    await db.collection("cash").doc(date).set({
      date, total: Number(d.total ?? 0),
      accounts: (d.accounts ?? []).map((a) => ({ name: String(a.name), balance: Number(a.balance) })),
      source: doc.gsPath ?? "", acceptedBy: email, acceptedAt: new Date().toISOString(),
    });
    wrote = `cash/${date}`;
  } else if (doc.kind === "vendor") {
    const vs = ((doc.data as { vendors?: Array<Record<string, string>> }).vendors ?? []);
    if (!vs.length) throw new Error("業者情報が読み取れていません（破棄して手で登録してください）");
    const ids: string[] = [];
    for (const v of vs) {
      const r = await db.collection("vendors").add({
        name: String(v.name ?? ""), person: String(v.person ?? ""),
        phone: String(v.phone ?? ""), email: String(v.email ?? ""),
        address: String(v.address ?? ""), service: String(v.service ?? ""),
        source: doc.gsPath ?? "", addedBy: email, addedAt: new Date().toISOString(),
      });
      ids.push(r.id);
    }
    wrote = `vendors/${ids.join(",")}`;
  } else {
    throw new Error(`この種類（${doc.kind}）の検収はまだ対応していません（順次拡大）`);
  }
  } catch (e) {
    await ref.update({ status: "draft" });   // 失敗したら draft に戻す（accepting のまま行方不明にしない）
    throw e;
  }
  await ref.update({ status: "accepted", acceptedBy: email, acceptedAt: new Date().toISOString(), wrote });
  return { wrote };
}

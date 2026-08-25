/**
 * routes/contracts.route.ts — エンドポイントの分割（S4・2026-08-25 発注者承認）
 *
 * 新しいエンドポイントは api.ts ではなく、担当カードに対応するこのファイルへ足す。
 * 本文は api.ts から移設したまま（一字も変えない方針。return; → return true; のみ機械置換）。
 */
import { getStorage } from "firebase-admin/storage";

export type Ctx = {
  db: FirebaseFirestore.Firestore;
  email: string;
  all: (col: string) => Promise<Array<Record<string, unknown>>>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handle(action: string, req: any, res: any, ctx: Ctx): Promise<boolean> {
  const { db, email } = ctx;
  switch (action) {
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
          return true;
        }
        case "saveContract": {
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { id, data } = req.body ?? {};
          if (!id) { res.status(400).json({ ok: false, error: "書類が指定されていません" }); return true; }
          const FIELDS = ["label", "category", "prop", "counterparty", "signedAt", "expiresAt",
            "autoRenew", "noticeDays", "amount", "path", "status", "note"];
          const clean: Record<string, unknown> = {};
          for (const k of FIELDS) if (k in (data ?? {})) clean[k] = (data as Record<string, unknown>)[k];
          if (!Object.keys(clean).length) { res.status(400).json({ ok: false, error: "保存できる項目がありません" }); return true; }
          await db.collection("contracts").doc(String(id))
            .set({ ...clean, updatedAt: new Date().toISOString(), updatedBy: email }, { merge: true });
          res.json({ ok: true });
          return true;
        }
        case "contractPdf": {                                 // 原本を一時リンクで開く
          const gs = String(req.query.path ?? "");
          if (!gs.startsWith("gs://yah-homes-os-archive/")) {
            res.status(400).json({ ok: false, error: "その置き場は開けません" }); return true;
          }
          const [bucket, ...rest] = gs.slice(5).split("/");
          const [url] = await getStorage().bucket(bucket).file(rest.join("/"))
            .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60 * 1000 });
          res.json({ ok: true, url });
          return true;
        }
  }
  return false;
}

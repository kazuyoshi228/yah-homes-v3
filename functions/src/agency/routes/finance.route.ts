/**
 * routes/finance.route.ts — エンドポイントの分割（S4・2026-08-25 発注者承認）
 *
 * 新しいエンドポイントは api.ts ではなく、担当カードに対応するこのファイルへ足す。
 * 本文は api.ts から移設したまま（一字も変えない方針。return; → return true; のみ機械置換）。
 */
import { getStorage } from "firebase-admin/storage";
import { loanSummary } from "../finance.js";
import { balanceSheet } from "../bs.js";
import { cashflow } from "../cashflow.js";
import { revenueSummary } from "../revenue.js";
import { utilitySummary } from "../utilities.js";
import { monthlySummary } from "../monthly.js";
import { yieldSummary } from "../yields.js";
import { factsSummary } from "../facts.js";

export type Ctx = {
  db: FirebaseFirestore.Firestore;
  email: string;
  all: (col: string) => Promise<Array<Record<string, unknown>>>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handle(action: string, req: any, res: any, ctx: Ctx): Promise<boolean> {
  const { db, all } = ctx;
  switch (action) {
        case "finance": {                                     // 融資の一覧（残債は契約条件から毎回計算）
          /* asOf を渡せば将来・過去の断面も出せる。残高を持たず条件から計算しているからできること。
             不正な日付で黙って「今日」に落ちると数字を取り違えるので、その時はエラーにする。 */
          const q = String(req.query.asOf ?? "");
          let asOf = new Date();
          if (q) {
            asOf = new Date(q);
            if (Number.isNaN(asOf.getTime())) { res.status(400).json({ ok: false, error: `日付が読めません: ${q}` }); return true; }
          }
          res.json({ ok: true, ...(await loanSummary(asOf)) });
          return true;
        }
        case "revenue": {                                     // 売上レポート（運営会社の月次報告）
          res.json({ ok: true, ...(await revenueSummary(Number(req.query.months ?? 12))) });
          return true;
        }
        case "yields": {                                      // 利回り（取得価額に対する稼ぎ）
          res.json({ ok: true, ...(await yieldSummary()) });
          return true;
        }
        case "monthly": {                                     // 月次のまとめ（各カードの合流点）
          res.json({ ok: true, ...(await monthlySummary()) });
          return true;
        }
        case "cashflow": {                                     // 資金繰り予測（12ヶ月・毎回導出）
          res.json({ ok: true, ...(await cashflow()) });
          return true;
        }
        case "bs": {                                           // BS（貸借対照表）— 主体別の負債＋法人の資産
          res.json({ ok: true, ...(await balanceSheet()) });
          return true;
        }
        case "fixedCosts": {                                  // 税金・保険・積立（毎年決まって出ていくもの）
          const [tax, ins, res_, asm, propDocs] = await Promise.all([
            all("taxes"), all("insurance"), all("reserves"), all("assumptions"), all("properties")]);
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
            /* 棟の和名は properties が正本（P2 #8・画面の直書き表を廃止するため同梱） */
            propLabels: Object.fromEntries(propDocs.map((p) => [String(p.id), String(p.label ?? p.id)])),
            total: {
              taxesPerYear: taxes, insurancePerYear: premiums, reservesPerYear: reserves,
              perYear, perMonth: Math.round(perYear / 12),
              props, perMonthPerProp: Math.round(perYear / 12 / props),
            },
          });
          return true;
        }
        case "utilities": {                                   // 光熱費（会計の仕訳から）
          res.json({ ok: true, ...(await utilitySummary()) });
          return true;
        }
        case "revenuePdf": {                                  // 月次報告の原本
          const id = String(req.query.id ?? "");
          const d = (await db.collection("revenue").doc(id).get()).data();
          const gs = String(d?.pdf ?? "");
          if (!gs.startsWith("gs://")) { res.status(404).json({ ok: false, error: "原本が未登録です" }); return true; }
          const [bucket, ...rest] = gs.slice(5).split("/");
          const [url] = await getStorage().bucket(bucket).file(rest.join("/"))
            .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60 * 1000 });
          res.json({ ok: true, url });
          return true;
        }
        case "loanPdf": {                                     // 契約書の原本を一時リンクで開く
          const id = String(req.query.loanId ?? "");
          const d = (await db.collection("finance").doc(id).get()).data();
          /* doc=schedule で返済予定表を開く（融資カード担当スレッド・loanPdf の範囲内の変更） */
          const field = String(req.query.doc ?? "") === "schedule" ? "schedulePdf" : "pdf";
          const gs = String((d as Record<string, unknown> | undefined)?.[field] ?? "");
          if (!gs.startsWith("gs://")) { res.status(404).json({ ok: false, error: "原本が未登録です" }); return true; }
          const [bucket, ...rest] = gs.slice(5).split("/");
          /* 保管庫は非公開のまま。10分だけ有効な署名付きリンクを都度作る（URLが漏れても長く生きない）。 */
          const [url] = await getStorage().bucket(bucket).file(rest.join("/"))
            .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60 * 1000 });
          res.json({ ok: true, url });
          return true;
        }
        case "insurancePdf": {
          const id = String(req.query.id ?? "");
          const d = (await db.collection("insurance").doc(id).get()).data();
          const gs = String(d?.pdf ?? "");
          if (!gs.startsWith("gs://")) { res.status(404).json({ ok: false, error: "原本が未登録です" }); return true; }
          const [bucket, ...rest] = gs.slice(5).split("/");
          const [url] = await getStorage().bucket(bucket).file(rest.join("/"))
            .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60 * 1000 });
          res.json({ ok: true, url });
          return true;
        }
        case "facts": {                                       // 全金額行の単一射影（B・保存しない）
          res.json({ ok: true, ...(await factsSummary({
            prop: String(req.query.prop ?? "") || undefined,
            ym: String(req.query.ym ?? "") || undefined,
            flow: String(req.query.flow ?? "") || undefined,
          })) });
          return true;
        }
  }
  return false;
}

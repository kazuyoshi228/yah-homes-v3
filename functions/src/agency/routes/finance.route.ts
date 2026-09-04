/**
 * routes/finance.route.ts — エンドポイントの分割（S4・2026-08-25 発注者承認）
 *
 * 新しいエンドポイントは api.ts ではなく、担当カードに対応するこのファイルへ足す。
 * 本文は api.ts から移設したまま（一字も変えない方針。return; → return true; のみ機械置換）。
 */
import { getStorage } from "firebase-admin/storage";
import { agencyDb } from "../engine.js";
import { loanSummary, portfolioYear } from "../finance.js";
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
          res.json({ ok: true, ...(await cashflow(12, new Date(), req.query.funding !== "0")) });
          return true;
        }
        case "financials": {                                   // 決算書【BF】— ボンファイア株式会社の申告書から
          const [fin, dep] = await Promise.all([
            agencyDb().collection("financials").get(),
            agencyDb().collection("depreciation").get(),
          ]);
          const rows = fin.docs
            .map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
            .sort((a, b) => String(a.fy ?? "").localeCompare(String(b.fy ?? "")));
          const assets = dep.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
          res.json({ ok: true, company: "ボンファイア株式会社", rows, assets });
          return true;
        }
        case "personal": {                                     // 個人の財務（山田一慶）— 資産・配当・借入
          const db2 = agencyDb();
          const [as, ds, fin2, bsAdj, inc, nwl] = await Promise.all([
            db2.collection("personalAssets").get(),
            db2.collection("personalDistributions").get(),
            db2.collection("finance").where("entity", "==", "personal").get(),
            db2.collection("bsAdjustments").where("entity", "==", "personal").get(),
            db2.collection("assumptions").doc("personal-income").get(),
            db2.collection("assumptions").doc("nomura-web-loan").get(),
          ]);
          const m = (d: FirebaseFirestore.QueryDocumentSnapshot): Record<string, unknown> =>
            ({ id: d.id, ...(d.data() as Record<string, unknown>) });
          res.json({ ok: true, owner: "山田 一慶",
            assets: as.docs.map(m).sort((x, y) => Number(y.value ?? 0) - Number(x.value ?? 0)),
            distributions: ds.docs.map(m).sort((x, y) => Number(y.annual ?? 0) - Number(x.annual ?? 0)),
            loans: fin2.docs.map(m),
            adjustments: bsAdj.docs.map(m),
            income: inc.exists ? { id: inc.id, ...(inc.data() as Record<string, unknown>) } : null,
            /* 証券担保ローンの条件（金利・掛目・強制売却の基準）。正本は商品概要PDF */
            nomuraTerms: nwl.exists ? { id: nwl.id, ...(nwl.data() as Record<string, unknown>) } : null });
          return true;
        }
        case "landComps": {                                   // 不動産DB — 市場の取引事例と公示地価
          /* 相場のデータ。自社の物件（properties）とは別物なので混ぜない——
             あちらは「持っているもの」、こちらは「外で起きていること」。
             成約（mlit）と鑑定（kouji）と売出（freins）も別物なので source で必ず分ける。
             集計はここでせず、そのまま返す——画面で条件を変えて何度も引き直すため。 */
          const db3 = agencyDb();
          const [comps, props3] = await Promise.all([
            db3.collection("landComps").get(),
            db3.collection("properties").get(),
          ]);
          const own = props3.docs
            .filter((d) => (d.data() as { kind?: string }).kind === "property")
            .map((d) => {
              const x = d.data() as Record<string, unknown>;
              const area = Number(x.landArea ?? 0);
              const paid = Number(x.purchasePrice ?? 0);
              return {
                id: d.id, label: String(x.label ?? d.id),
                landArea: area, purchasePrice: paid,
                /* 取得の㎡単価。保存せず毎回割る（SSoT） */
                unitPrice: area ? Math.round(paid / area) : null,
                access: String(x.access ?? ""), status: String(x.status ?? ""),
              };
            });
          res.json({ ok: true, comps: comps.docs.map((d) => ({ id: d.id, ...(d.data() as object) })), own });
          return true;
        }
        case "bs": {                                           // BS（貸借対照表）— 主体別の負債＋法人の資産
          res.json({ ok: true, ...(await balanceSheet()) });
          return true;
        }
        case "loanYears": {                                   // 借入の年次モデル（設計メモ③・2026-09-04）
          /* 元利均等の計算をサーバの1本（finance.ts）に集約した。カードは呼ぶだけ。
             家族ファンド分（銀行以外）を年ごとに束ねて返す。銀行分はモデル側の数字から引く */
          const [loans, asm, scs] = await Promise.all([
            all("finance"), all("assumptions"), all("scenarios")]);
          const BANK = /銀行|公庫|信用金庫|信用組合|金庫|證券|証券/;
          const fam = loans.filter((l) => String(l.kind ?? "") === "loan"
            && String(l.entity ?? "corp") === "corp"
            && !BANK.test(String(l.lender ?? "")));
          const ff = asm.find((a) => a.id === "family-fund") ?? {};
          /* 利率と切替月はシナリオの override があればそれを、無ければ assumptions を使う */
          const sc = scs.find((x) => (x.overrides as { familyRate?: unknown })?.familyRate) ?? null;
          const fr = (sc?.overrides as { familyRate?: { rate?: number; switchMonth?: string } })?.familyRate;
          const plan = { rate: Number(fr?.rate ?? ff.targetRate ?? 0),
            switchMonth: String(fr?.switchMonth ?? ff.switchMonth ?? "9999-12") };
          const from = Number(req.query.from ?? new Date().getFullYear());
          const to = Number(req.query.to ?? from + 30);
          const years: Record<string, ReturnType<typeof portfolioYear>> = {};
          for (let y = from; y <= to; y++) years[String(y)] = portfolioYear(fam as never, y, plan);
          res.json({ ok: true, years, plan, count: fam.length });
          return true;
        }
        case "scenarios": {                                   // シナリオ一覧（案の正本・2026-09-04）
          /* 実在の台帳（finance / assumptions）とは別。overrides に前提の差分だけを持つ。
             当てた結果は ?action=bs の plans に入る——ここは一覧と中身だけ */
          res.json({ ok: true, rows: await all("scenarios") });
          return true;
        }
        case "terms": {                                       // 用語マスタ（語の意味の正本・2026-09-04）
          /* 数字は持たない。label が正式名、aka が画面に出ている表記のゆれ。
             カードは見出しの説明（ツールチップ）にこれを使う */
          const rows = await all("terms");
          res.json({ ok: true, rows: rows.sort((a, b) =>
            String(a.group ?? "").localeCompare(String(b.group ?? ""))
            || String(a.label ?? "").localeCompare(String(b.label ?? ""))) });
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

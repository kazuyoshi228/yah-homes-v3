/**
 * BS（貸借対照表）— 2026-08-30 発注者指示「財務にBSという項目を追加」
 *
 * **主体を混ぜない。** finance.entity で法人（ボンファイア株式会社）と
 * 個人（山田一慶）を分け、それぞれの負債を出す。合算は「借入総額」としてだけ示す。
 * 資産は法人側しか台帳に無い（物件の取得・投資）ため、
 * **純資産を出せるのは法人のみ**——個人は負債だけを載せ、その旨を画面に明記する。
 *
 * 何も保存しない（毎回導出）。数字の出どころは properties / items / equipment / finance / cash。
 */
import { agencyDb } from "./engine.js";
import { loanState, type Loan } from "./finance.js";

export type BsLine = { label: string; amount: number; note?: string; docPath?: string };
export type BsSide = { entity: "corp" | "personal"; label: string;
  liabilities: BsLine[]; liabilityTotal: number; conditionsUnknown: number };

/** 負債の1本あたりの計上額（純関数・テスト対象）。
    条件が登録済みなら返済表から導いた残債、未登録なら申告額をそのまま使う */
export function liabilityAmount(
  d: { conditionsUnknown?: boolean; amountReported?: number; principal?: number },
  derivedBalance: number | null): number {
  /* 申告額が 0/未設定 なら当初額に落とす（?? だと 0 をそのまま採ってしまう） */
  if (d.conditionsUnknown) return Number(d.amountReported || d.principal || 0);
  return derivedBalance ?? Number(d.principal ?? 0);
}

export async function balanceSheet(asOf = new Date()) {
  const db = agencyDb();
  const [finSnap, propSnap, itemSnap, eqSnap, cashSnap] = await Promise.all([
    db.collection("finance").where("kind", "==", "loan").get(),
    db.collection("properties").get(),
    db.collection("items").get(),
    db.collection("equipment").where("kind", "==", "equipment").get(),
    db.collection("cash").get(),
  ]);

  /* ---- 負債（主体別） ---- */
  const sides: Record<"corp" | "personal", BsSide> = {
    corp: { entity: "corp", label: "ボンファイア株式会社", liabilities: [], liabilityTotal: 0, conditionsUnknown: 0 },
    personal: { entity: "personal", label: "山田 一慶（個人）", liabilities: [], liabilityTotal: 0, conditionsUnknown: 0 },
  };
  for (const doc of finSnap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const entity = String(d.entity ?? "corp") === "personal" ? "personal" : "corp";
    let derived: number | null = null;
    if (!d.conditionsUnknown) {
      try { derived = loanState({ id: doc.id, ...d } as unknown as Loan, asOf).balance; } catch { derived = null; }
    }
    const amount = liabilityAmount(d as never, derived);
    if (!amount) continue;
    sides[entity].liabilities.push({
      label: String(d.tabLabel ?? d.lender ?? doc.id),
      amount,
      note: d.conditionsUnknown ? "条件未登録（申告額）" : String(d.repayment ?? ""),
      docPath: `finance/${doc.id}`,
    });
    sides[entity].liabilityTotal += amount;
    if (d.conditionsUnknown) sides[entity].conditionsUnknown++;
  }
  for (const s of Object.values(sides)) s.liabilities.sort((a, b) => b.amount - a.amount);

  /* ---- 資産（法人のみ台帳がある） ---- */
  const num = (v: unknown) => Number(v ?? 0) || 0;
  const propRows: Array<Record<string, unknown>> = propSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  const invest = itemSnap.docs.reduce((a, d) => a + num(d.data().amount), 0);
  const equip = eqSnap.docs.reduce((a, d) => a + (d.data().futureCost === true ? 0 : num(d.data().amount)), 0);
  const latestCash = cashSnap.docs.map((d) => ({ id: d.id, total: num(d.data().total) }))
    .sort((a, b) => a.id.localeCompare(b.id)).at(-1) ?? null;
  const assets: BsLine[] = [
    { label: "物件（取得・投資の累計）", amount: invest, note: `items ${itemSnap.size}行`, docPath: "items" },
    { label: "設備（未払いの概算を除く）", amount: equip, note: `equipment ${eqSnap.size}行`, docPath: "equipment" },
  ];
  if (latestCash) assets.push({ label: "現金", amount: latestCash.total, note: `${latestCash.id} 時点`, docPath: `cash/${latestCash.id}` });
  const assetTotal = assets.reduce((a, x) => a + x.amount, 0);

  return {
    asOf: asOf.toISOString().slice(0, 10),
    sides: [sides.corp, sides.personal],
    assets, assetTotal,
    /* 純資産は法人のみ。個人は資産が台帳に無いので出さない（出すと嘘になる） */
    corpEquity: assetTotal - sides.corp.liabilityTotal,
    grandLiability: sides.corp.liabilityTotal + sides.personal.liabilityTotal,
    props: propRows.map((p) => ({ id: p.id, label: String(p.label ?? p.id), status: String(p.status ?? "") })),
    cashMissing: latestCash == null,
  };
}

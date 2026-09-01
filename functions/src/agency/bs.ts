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
  const [finSnap, propSnap, itemSnap, eqSnap, cashSnap, adjSnap, paSnap, bpSnap] = await Promise.all([
    db.collection("finance").where("kind", "==", "loan").get(),
    db.collection("properties").get(),
    db.collection("items").get(),
    db.collection("equipment").where("kind", "==", "equipment").get(),
    db.collection("cash").get(),
    db.collection("bsAdjustments").get(),
    db.collection("personalAssets").get(),
    db.collection("buildPayments").get(),
  ]);

  const num = (v: unknown) => Number(v ?? 0) || 0;

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
    /* 明細の1行に返済のしかたを添える。条件が未登録でも、分かっている範囲は出す
       （毎月返済額・利息のみ、など。2026-08-31 発注者から条件が届いたため） */
    const monthly = num(d.monthlyPayment);
    const how = d.repayment === "interest-only" ? "利息のみ"
      : monthly ? `毎月 ¥${monthly.toLocaleString()}` : "";
    const note = [d.conditionsUnknown ? "条件一部未登録（申告額）" : String(d.repayment ?? ""), how]
      .filter(Boolean).join("・");
    sides[entity].liabilities.push({
      label: String(d.tabLabel ?? d.lender ?? doc.id),
      amount, note,
      docPath: `finance/${doc.id}`,
    });
    sides[entity].liabilityTotal += amount;
    if (d.conditionsUnknown) sides[entity].conditionsUnknown++;
  }
  for (const s of Object.values(sides)) s.liabilities.sort((a, b) => b.amount - a.amount);

  /* ---- 資産（法人のみ台帳がある） ---- */
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

  /* bsAdjustments（人の宣言）。既定では合計に入れず、画面のスイッチで足す「候補」として返す。
     group=unbooked … 建設中で台帳にまだ無い建物
     group=personal … 個人の資産（法人の外にあるもの）
     excluded=true  … **計上してはいけない**もの。自社株がこれ——その価値は
       「法人の物件−法人の負債」そのもので、法人を展開している画面に足すと二重計上になる
       （連結でいう投資と資本の相殺消去）。理由を画面に出すため、消さずに返す */
  const adj = adjSnap.docs
    .filter((d) => String(d.data().kind ?? "asset") === "asset" && d.data().superseded !== true)
    .map((d) => ({ label: String(d.data().label ?? d.id), amount: num(d.data().amount),
      note: String(d.data().reason ?? ""), docPath: `bsAdjustments/${d.id}`,
      group: String(d.data().group ?? "unbooked"), excluded: d.data().excluded === true }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  /* 個人の投資信託は personalAssets（銘柄ごとの一次事実）が正本。
     ここで合計を作る——BS側に金額を持たせると二重になり、実際に食い違った
     （2026-09-02: bsAdjustments に ¥174,431,999、明細の合計は ¥172,022,799）。
     銘柄を1本売れば合計は自動で変わる */
  const paTotal = paSnap.docs.reduce((a, d) => a + num(d.data().value), 0);
  if (paTotal > 0) {
    adj.unshift({ label: "投資信託（個人）", amount: paTotal,
      note: `personalAssets ${paSnap.size}銘柄の合計。個人の財務カードが正本`,
      docPath: "personalAssets", group: "personal", excluded: false });
  }
  /* 建設中の建物は**支払予定表（buildPayments）から導く**（2026-08-31 発注者提供）。
     資産＝契約総額（建物＋家具）／負債＝まだ払っていない分。**対で載せる**ので、
     純資産に効くのは「すでに払った分」だけ——これが正しい姿。
     資産だけ足すと未払分まで純資産が膨らみ、負債だけ足すと逆に沈む。
     支払済みの判定は paid フラグ（人が確認したもの）。日付だけで自動判定しない——
     予定日に必ず払われる保証はないため */
  const payRows = bpSnap.docs.map((d) => d.data() as Record<string, unknown>);
  const propLabel = new Map(propSnap.docs.map((d) => [d.id, String(d.data().label ?? d.id)]));
  const byProp = new Map<string, { total: number; unpaid: number }>();
  for (const r of payRows) {
    const k = String(r.prop ?? "");
    const cur = byProp.get(k) ?? { total: 0, unpaid: 0 };
    cur.total += num(r.amount);
    if (r.paid !== true) cur.unpaid += num(r.amount);
    byProp.set(k, cur);
  }
  const unbooked: BsLine[] = [...byProp.entries()]
    .filter(([, v]) => v.total > 0)
    .map(([k, v]) => ({ label: `${propLabel.get(k) ?? k} 建物・家具（建設中）`, amount: v.total,
      note: `契約総額。支払済み ¥${(v.total - v.unpaid).toLocaleString()}`, docPath: "buildPayments" }))
    .sort((a, b) => b.amount - a.amount);
  const unbookedLiabilities: BsLine[] = [...byProp.entries()]
    .filter(([, v]) => v.unpaid > 0)
    .map(([k, v]) => ({ label: `${propLabel.get(k) ?? k} 工事の未払金`, amount: v.unpaid,
      note: "支払予定表の未払分", docPath: "buildPayments" }))
    .sort((a, b) => b.amount - a.amount);
  /* 直近の支払予定（資金繰りの手がかり。BSの合計には効かない） */
  const upcoming = payRows
    .filter((r) => r.paid !== true)
    .map((r) => ({ date: String(r.date ?? ""), prop: propLabel.get(String(r.prop ?? "")) ?? String(r.prop ?? ""),
      kind: String(r.kind ?? ""), amount: num(r.amount) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const personalAssets: BsLine[] = adj.filter((x) => x.group === "personal" && !x.excluded);
  const excludedAssets = adj.filter((x) => x.excluded);

  return {
    asOf: asOf.toISOString().slice(0, 10),
    unbooked, unbookedTotal: unbooked.reduce((a, x) => a + x.amount, 0),
    unbookedLiabilities,
    unbookedLiabilityTotal: unbookedLiabilities.reduce((a, x) => a + x.amount, 0),
    upcoming,
    personalAssets, personalAssetTotal: personalAssets.reduce((a, x) => a + x.amount, 0),
    excludedAssets,
    sides: [sides.corp, sides.personal],
    assets, assetTotal,
    /* 純資産は法人のみ。個人は資産が台帳に無いので出さない（出すと嘘になる） */
    corpEquity: assetTotal - sides.corp.liabilityTotal,
    grandLiability: sides.corp.liabilityTotal + sides.personal.liabilityTotal,
    props: propRows.map((p) => ({ id: p.id, label: String(p.label ?? p.id), status: String(p.status ?? "") })),
    cashMissing: latestCash == null,
  };
}

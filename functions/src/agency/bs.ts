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

export type BsLine = { label: string; amount: number; note?: string; docPath?: string;
  related?: string; lenderKind?: "bank" | "family";
  basis?: AmountBasis; principal?: number; asOf?: string };

/* 貸し手が金融機関か家族かで分ける（2026-09-04 発注者指示）。
   同じ「負債」でも性格がまったく違う——銀行は返済期限と担保があり、
   家族は条件を相談で決められる。画面では別の塊として見せる */
/* 銀行かどうか。**本来は people.kind が持つ属性**で、この正規表現は名前からの推測。
   people にマスタがあればそちらを優先し、無い借入だけこの正規表現に落とす（設計メモ⑤・2026-09-04） */
const BANK_LENDER = /銀行|公庫|信用金庫|信用組合|金庫|證券|証券/;

/* 山田一慶が法人へ貸し付けている役員借入（loan-kazuyoshi-officer）の原資になっている、
   一慶が個人で家族から借りている3本（2026-09-04 発注者指摘）。
   これらを「負債（法人＋個人）」に平たく並べると、法人→一慶の借入と
   一慶→家族の借入が別々の行に見え、資金の流れが読めない——実態は
   「家族 → 一慶（個人） → 法人」という1本の流れの、2つの区間である。
   金額は一致しない（一慶が個人の手元資金も混ぜて貸しているため）。
   assumptions/family-fund の pending「①個人間の貸付を法人へ付け替えるか」が
   解消されるまでは、実在する別々の負債として両方に残し、右のカードで
   「関連している」ことだけを示す。 */
const RELATED_TO_OFFICER_LOAN = new Set([
  "loan-kazuyoshi-harunobu-a", "loan-kazuyoshi-harunobu-b", "loan-kazuyoshi-masako",
]);
const OFFICER_LOAN_ID = "loan-kazuyoshi-officer";
export type BsSide = { entity: "corp" | "personal"; label: string;
  liabilities: BsLine[]; liabilityTotal: number; conditionsUnknown: number };

/** 負債の1本あたりの計上額（純関数・テスト対象）。
    条件が登録済みなら返済表から導いた残債、未登録なら申告額をそのまま使う */
export function liabilityAmount(
  d: { conditionsUnknown?: boolean; amountReported?: number; principal?: number },
  derivedBalance: number | null): number {
  return liabilityAmountWithBasis(d, derivedBalance).amount;
}

/** 額と一緒に【その額が何なのか】を返す（設計メモ⑧・2026-09-04）。
 *
 *  同じ列に3種類の意味の数字が並んでいた:
 *    derived  … 返済表から導いた、その時点の残高
 *    principal… 当初元本（まだ返済が始まっていない等で残高を導けない）
 *    reported … 申告額（返済条件が未登録）
 *
 *  2026-09-04、同条件の3本のうちウィズダムだけ ¥29,591,920 と出ていて
 *  「30,000,000のはずだが、いつ変わったのか」という疑問が出た。
 *  正解は「返済が2026-05に始まっているので残高を引き直した値」——
 *  台帳は正しく、画面が意味を伝えていなかった。分岐は元からここにあり、
 *  返していなかっただけなので、返すようにする。 */
export type AmountBasis = "derived" | "principal" | "reported";
export function liabilityAmountWithBasis(
  d: { conditionsUnknown?: boolean; amountReported?: number; principal?: number },
  derivedBalance: number | null): { amount: number; basis: AmountBasis } {
  /* 申告額が 0/未設定 なら当初額に落とす（?? だと 0 をそのまま採ってしまう） */
  if (d.conditionsUnknown) {
    const rep = Number(d.amountReported || 0);
    return rep ? { amount: rep, basis: "reported" }
      : { amount: Number(d.principal || 0), basis: "principal" };
  }
  if (derivedBalance != null) return { amount: derivedBalance, basis: "derived" };
  return { amount: Number(d.principal ?? 0), basis: "principal" };
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
  /* 人物・法人マスタ（people・設計メモ⑤）。表示名と「銀行かどうか」の正本。
     台帳が lenderId を持っていればマスタを引く。持っていない借入は従来どおり文字列で扱う
     （移行の途中でも画面が壊れないように。設計メモ⑤の順序4より前に後方互換を外さない） */
  const peopleSnap = await db.collection("people").get();
  const people = new Map(peopleSnap.docs.map((d) => [d.id, d.data() as
    { displayName?: string; kind?: string }]));
  const nameOf = (id: unknown, fallback: unknown) =>
    (typeof id === "string" && people.get(id)?.displayName) || String(fallback ?? "");
  const isBank = (id: unknown, lender: unknown) => {
    const k = typeof id === "string" ? people.get(id)?.kind : undefined;
    return k ? k === "bank" : BANK_LENDER.test(String(lender ?? ""));
  };

  /* シナリオ（scenarios）。人の判断なので台帳が正本。
     2026-09-04、assumptions の中の postPlan という隠し部屋から独立させた（設計メモ①）——
     1本しか持てず、上書きすると前の案が消えていたため */
  const scSnap = await db.collection("scenarios").get();

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
    const { amount, basis } = liabilityAmountWithBasis(d as never, derived);
    if (!amount) continue;
    /* 明細の1行に返済のしかたを添える。条件が未登録でも、分かっている範囲は出す
       （毎月返済額・利息のみ、など。2026-08-31 発注者から条件が届いたため） */
    const monthly = num(d.monthlyPayment);
    const how = d.repayment === "interest-only" ? "利息のみ"
      : monthly ? `毎月 ¥${monthly.toLocaleString()}` : "";
    const note = [d.conditionsUnknown ? "条件一部未登録（申告額）" : String(d.repayment ?? ""), how]
      .filter(Boolean).join("・");
    sides[entity].liabilities.push({
      label: String(d.tabLabel ?? nameOf(d.lenderId, d.lender) ?? doc.id),
      amount, note,
      /* この額が何なのか。画面はこれを見て「残高」「当初元本」「申告額」を添える */
      basis, principal: num(d.principal), asOf: asOf.toISOString().slice(0, 10),
      docPath: `finance/${doc.id}`,
      lenderKind: isBank(d.lenderId, d.lender) ? "bank" : "family",
      ...(doc.id === OFFICER_LOAN_ID || RELATED_TO_OFFICER_LOAN.has(doc.id)
        ? { related: "officer-loan" } : {}),
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

  /* 関連当事者間の貸借（右カード用・2026-09-04）。
     資産・負債の合計計算には影響しない——表示のための別レイヤー */
  const officerLoan = sides.corp.liabilities.find((l) => l.docPath === `finance/${OFFICER_LOAN_ID}`) ?? null;
  const personalFunding = sides.personal.liabilities.filter((l) => l.related === "officer-loan");
  const personalFundingTotal = personalFunding.reduce((a, x) => a + x.amount, 0);
  const relatedParty = officerLoan ? {
    label: "山田 一慶 → ボンファイア株式会社",
    officerLoan,                          // 法人→一慶（役員借入）
    personalFunding, personalFundingTotal, // 一慶→家族（個人の借入。原資の一部）
    diff: officerLoan.amount - personalFundingTotal,
    note: "一慶が法人に貸している役員借入の原資は、家族からの個人の借入で一部まかなわれている。"
      + "金額は一致しない（一慶の手元資金も混ざるため）。"
      + "資産・負債の合計はこれまでどおり両方を別々の実在する負債として数える——"
      + "ここは資金の流れを示す別レイヤー。",
  } : null;

  /* ---- シナリオ（案・未実行）を当てた姿 ----
     実在の残高ではない。実在の負債は上の sides が正本で、こちらは合計を別に持つ——
     画面で現状と並べて比べるための、もう1つの射影。
     金額は scenarios の overrides（人の判断）から取る。コードに焼き込まない。
     いまサポートする override は replaceLoan（借入1本を複数本に置き換える）だけ。
     新しい種類を足すときは、ここに分岐を1つ増やす */
  type ScenarioRow = { id: string; label?: string; status?: string; note?: string;
    overrides?: { replaceLoan?: { docPath?: string; lines?: Array<{ lender?: string; amount?: number }> } } };
  const scenarios: ScenarioRow[] = scSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }));

  function applyScenario(sc: ScenarioRow) {
    const rl = sc.overrides?.replaceLoan;
    if (!rl?.lines?.length) return null;
    const replaces = String(rl.docPath ?? "");
    const replaced = sides.corp.liabilities.find((l) => l.docPath === replaces) ?? null;
    /* 置き換える1本を抜いた残り＋案の行。ここに入らない借入（銀行・他の家族ファンド）はそのまま */
    const kept = sides.corp.liabilities.filter((l) => l.docPath !== replaces);
    const planLines: BsLine[] = rl.lines.map((x) => ({
      label: String(x.lender ?? ""), amount: num(x.amount), note: "整理後の案",
      docPath: `scenarios/${sc.id}`, lenderKind: "family" as const,
    }));
    const planTotal = planLines.reduce((a, x) => a + x.amount, 0);
    const keptFamily = kept.filter((l) => l.lenderKind !== "bank");
    const liabilityTotal = kept.reduce((a, x) => a + x.amount, 0) + planTotal;
    return {
      id: sc.id,
      label: String(sc.label ?? "整理後（案）"),
      note: String(sc.note ?? ""), status: String(sc.status ?? "proposed"),
      lines: planLines, planTotal,
      replaced,                     // 消える1本。画面で「何が無くなるか」を出すため
      keptFamily,
      familyTotal: keptFamily.reduce((a, x) => a + x.amount, 0) + planTotal,
      liabilityTotal, equity: assetTotal - liabilityTotal,
    };
  }
  const plans = scenarios.map(applyScenario).filter(Boolean);

  return {
    asOf: asOf.toISOString().slice(0, 10),
    relatedParty, plans,
    /* シナリオの一覧（画面の選択肢）。中身は plans に入っている */
    scenarios: scenarios.map((x) => ({ id: x.id, label: x.label ?? x.id, status: x.status ?? "proposed" })),
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

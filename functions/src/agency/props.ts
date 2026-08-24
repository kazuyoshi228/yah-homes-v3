/**
 * 物件 — 棟そのものの属性の正本
 *
 * ここが持つのは「開発時に決まって以後変わらないもの」だけ:
 *   面積・取得年月日・取得価額・築年月・構造・住所・定員・状態
 *   宿泊以外の収入（オフィス賃料など。宿泊の報告書に載らないもの）
 *
 * 売上・光熱費・税金・保険・積立は、それぞれのカードが正本。ここでは参照して並べるだけ。
 * 借入はこの画面では扱わない（融資カードの領分・2026-08-19 発注者指示）。
 */
import { getStorage } from "firebase-admin/storage";
import { agencyDb } from "./engine.js";
import { revenueSummary } from "./revenue.js";
import { utilitySummary } from "./utilities.js";

/* 収益還元の還元利回り。正本は assumptions/cap-rate（2026-08-25 焼き付け解消・D）。
   ここはデータが読めないときのフォールバックのみ */
export const CAP_RATE_FALLBACK = 0.05;

/** 画面から編集できる項目。ここに無いものは保存時に弾く（勝手な項目が増えないように） */
export const PROP_FIELDS = [
  "label", "status", "address", "area", "acquiredAt", "acquisitionPrice",
  "built", "structure", "rooms", "capacity", "note",
  /* 資料から拾えた項目（物件概要書・売買契約書） */
  "landArea", "floorAreaForFAR", "layout", "zoning", "coverageRatio", "access",
  "listPrice", "purchasePrice",
  /* 取得の相手と根拠（決済のご案内・売買契約書） */
  "seller", "broker", "contractDate", "buildingPermit", "warranty",
  /* 現地の条件（物件概要書） */
  "utilities", "roads", "parking", "surroundings", "psychologicalDefect", "encroachment",
  "riverDistance", "hazard",
  "interior", "interiorSource",   // 内装・仕様の一覧（標準仕様書から正本化）
  "buildingConfirmation", "buildingConfirmationSource",   // 建築確認（確認済証類から正本化）
  "contractDateNote",
  "otherIncomeLabel", "otherIncomePerMonth", "otherIncomeNote",
  "landPrice", "units", "planned",
  "plants",                 // 植栽の台帳（植栽メンテカードが編集する）
  /* 明細（備品・工事・取得費用）の正本は items コレクション、リフォーム・追加投資は導出。
     配列や合計をここへ書き戻す経路は廃止した（2026-08-25 焼き付け最小化・C/G） */
  "investmentNote", "investmentSource",
  "drawings",               // 図面データ（保管庫のパスと名前）
  "requiredDocs",           // 追加必須書類（揃っていないものの一覧）
  "suppliesSource", "constructionSource", "constructionNote",   // 取込の出典メモ
] as const;

export async function propertySummary() {
  const db = agencyDb();
  const [snap, rev, util, taxSnap, insSnap, resSnap, schedSnap] = await Promise.all([
    db.collection("properties").get(),
    revenueSummary(12), utilitySummary(),
    db.collection("taxes").get(), db.collection("insurance").get(),
    db.collection("reserves").get(), db.collection("schedules").get(),
  ]);
  const eqSnap = await db.collection("equipment").where("kind", "==", "equipment").get();
  /* 明細の正本。備品・工事・取得費用は items（1行=1ドキュメント・idx順） */
  const itemsSnap = await db.collection("items").get();
  const itemsOf = (prop: string, kind: string): Array<Record<string, unknown>> => itemsSnap.docs
    .filter((x) => x.data().prop === prop && x.data().kind === kind)
    .sort((a, b) => Number(a.data().idx ?? 0) - Number(b.data().idx ?? 0))
    .map((x) => ({ id: x.id, ...(x.data() as object) } as Record<string, unknown>));
  const capDoc = await db.collection("assumptions").doc("cap-rate").get();
  const capRate = Number(capDoc.data()?.value ?? CAP_RATE_FALLBACK);

  /* 書類一式の格納日時。保管庫（GCS）のオブジェクト作成時刻から毎回引く——
     手入力の日付は必ずズレるため、日時をFirestoreに保存しない（2026-08-25 発注者指示） */
  const storedAt = new Map<string, string>();
  try {
    const [files] = await getStorage().bucket("yah-homes-os-archive")
      .getFiles({ prefix: "properties/" });
    for (const f of files) {
      const t = (f.metadata as { timeCreated?: string }).timeCreated;
      if (t) storedAt.set(`gs://yah-homes-os-archive/${f.name}`, t);
    }
  } catch { /* 保管庫が読めなくても物件データは返す */ }

  const activeCount = rev.byProp.length || 1;
  const utilPerYear = Math.round(
    util.byPlace.filter((p) => p.place !== "千人町").reduce((a, p) => a + p.perMonth, 0) / activeCount * 12);
  const per = (s: FirebaseFirestore.QuerySnapshot, prop: string, key: string) =>
    s.docs.filter((d) => d.data().prop === prop).reduce((a, d) => a + Number(d.data()[key] ?? 0), 0);

  const rows = snap.docs.map((d) => {
    const p = d.data() as Record<string, unknown>;
    const r = rev.byProp.find((x) => x.prop === d.id);
    const supplies = itemsOf(d.id, "supply");
    const construction = itemsOf(d.id, "construction");
    const acquisition = itemsOf(d.id, "acquisition");
    let invTotal = 0;   // 取得費用＋導出リフォーム。下で確定する
    let price = 0;
    /* 宿泊以外の収入。OTA手数料も運営代行も清掃もかからないので、ほぼ全額がNOIに乗る */
    const other = Number(p.otherIncomePerMonth ?? 0) * 12;

    const stayRevenue = r ? Math.round(r.revenue / r.months * 12) : 0;
    const stayPayout = r ? Math.round(r.payout / r.months * 12) : 0;
    const tax = per(taxSnap, d.id, "amountPerYear");
    const ins = per(insSnap, d.id, "premiumPerYear");
    const res = per(resSnap, d.id, "amountPerYear");
    const utilities = r ? utilPerYear : 0;
    const noi = r || other ? stayPayout + other - utilities - tax - ins - res : null;

    /* 二重計上の検知。同じ仕訳（取引No）が複数の置き場に現れたら警告する。
       エアスター・toolbox・カーテンFIXで実際に3回起きた失敗を、構造で防ぐ（2026-08-24）。
       同一置き場内の分割（例: 振替¥760,000をキッチンと洗面台に分ける）は正常なので数えない。 */
    const txSources: Record<string, Set<string>> = {};
    const addTx = (t: unknown, src: string, splitOk?: unknown) => {
      const k = String(t ?? ""); if (!k) return;
      if (splitOk === true) return;   // 明示的な分割（1つの振込を2品目に割ったもの）は正常
      (txSources[k] ??= new Set()).add(src);
    };
    for (const it of supplies) addTx(it.txNo, "備品", it.splitOk);
    for (const it of construction) addTx(it.txNo, "工事", it.splitOk);
    for (const it of acquisition) addTx(it.txNo, "投資額", it.splitOk);
    for (const e of eqSnap.docs.filter((e) => e.data().prop === d.id))
      addTx(e.data().txNo, String(e.data().group ?? "設備"), e.data().splitOk);
    const dupWarnings = Object.entries(txSources)
      .filter(([, srcs]) => srcs.size > 1)
      .map(([txNo, srcs]) => ({ txNo, sources: [...srcs] }));

    const sumArr = (arr: Array<{ amount?: unknown; date?: unknown }>, y2026?: boolean) =>
      arr.filter((x) => y2026 === undefined || String(x.date ?? "").startsWith("2026") === y2026)
        .reduce((a, x) => a + Number(x.amount ?? 0), 0);
    /* 期別: 2026年の追加投資分（date="2026"…）は初期投資から除く */
    const eqSum = (g: string) => eqSnap.docs
      .filter((e) => e.data().prop === d.id && String(e.data().group ?? "設備") === g
        && !String(e.data().date ?? "").startsWith("2026"))
      .reduce((a, e) => a + Number(e.data().amount ?? e.data().price ?? 0), 0);
    const derived: Record<string, number> = {
      "備品": sumArr(supplies), "工事": sumArr(construction, false),
      "家具": eqSum("家具"), "カーテン": eqSum("カーテン"), "照明": eqSum("照明"),
      "建材": eqSum("建材"), "装飾": eqSum("装飾"), "設備": eqSum("設備"),
    };
    /* 設備台帳の group は、画面のタブ割りと合っていないと二重に見える。
       宣言していない group が現れたら監査に出す（黙って設備タブに紛れ込ませない） */
    const GROUPS = new Set(["設備", "家具", "建材", "建材・照明", "カーテン", "照明", "装飾",
      "長期修繕", "建物"]);
    const strayGroups = [...new Set(eqSnap.docs
      .filter((e) => e.data().prop === d.id)
      .map((e) => String(e.data().group ?? "設備"))
      .filter((g) => !GROUPS.has(g)))];

    /* 追加投資額（2026年以降）も同じ作りにする。保存行を正本にすると、
       台帳に足したものが追加投資に出てこない（洗濯機がそうなっていた・2026-08-24）。
       cat は画面のタブ名と揃える——「設備」と言いながら中身が家具、を防ぐため。 */
    const eqSum2026 = (g: string) => eqSnap.docs
      .filter((e) => e.data().prop === d.id && String(e.data().group ?? "設備") === g
        && String(e.data().date ?? "").startsWith("2026"))
      .reduce((a, e) => a + Number(e.data().amount ?? e.data().price ?? 0), 0);
    const conSum2026 = sumArr(construction, true);
    const addDerived = [
      ...["設備", "家具", "カーテン", "照明", "建材", "装飾"]
        .map((g) => ({ cat: g, label: g, amount: eqSum2026(g), date: "2026" }))
        .filter((x) => x.amount > 0),
      ...(conSum2026 ? [{ cat: "工事", label: "工事", amount: conSum2026, date: "2026" }] : []),
    ];
    /* 投資額の表＝取得費用（一次事実・items）＋リフォーム（タブから導出）＋申請関連ほか。
       保存済みのリフォーム行・合計値は廃止した——保存が無ければ腐りようがない（2026-08-25 G） */
    const REFORM_ORDER = ["設備", "照明", "家具", "カーテン", "建材", "装飾", "備品", "工事"];
    const investmentDerived = [
      ...acquisition.filter((it) => it.cat === "取得費用"),
      ...REFORM_ORDER.filter((g) => derived[g] > 0)
        .map((g) => ({ cat: "リフォーム", label: g, amount: derived[g] })),
      ...acquisition.filter((it) => it.cat !== "取得費用"),
    ];
    const invTotalDerived = investmentDerived.reduce((a, it) => a + Number(it.amount ?? 0), 0);
    invTotal = invTotalDerived;
    price = invTotal || Number(p.acquisitionPrice ?? 0);

    /* 監査: 検算スクリプトを常設化。バッジ表示用 */
    const lineage = (rows: Array<{ txNo?: string; offLedger?: boolean }>, label: string) => {
      const target = rows.filter((r) => r.offLedger !== true);
      return { label, withTx: target.filter((r) => r.txNo).length, total: target.length };
    };
    const eqRows = eqSnap.docs.filter((e) => e.data().prop === d.id)
      .map((e) => e.data() as { txNo?: string; offLedger?: boolean });
    /* 保存行との突合は廃止（比較すべき保存側を消したため）。残る監査は
       「一次事実の血統」と「置き場の規律」——腐り得るものだけを見る */
    const auditChecks = [
      { name: "group未宣言", ok: strayGroups.length === 0, detail: strayGroups.join(",") },
      { name: "二重計上", ok: dupWarnings.length === 0,
        detail: dupWarnings.map((w) => w.txNo).join(",") },
      ...[lineage(supplies as never, "血統:備品"),
          lineage(construction as never, "血統:工事"),
          lineage(eqRows, "血統:台帳")].map((l) => ({
        name: l.label, ok: l.withTx === l.total, detail: `${l.withTx}/${l.total}` })),
    ];
    const audit = { ok: auditChecks.filter((c) => c.ok).length,
      warn: auditChecks.filter((c) => !c.ok), total: auditChecks.length };

    return {
      id: d.id, ...p,
      supplies, construction,
      investment: investmentDerived,
      investmentTotalDerived: invTotalDerived,
      audit,
      dupWarnings,
      investmentTotal: invTotal || null,
      priceBasis: invTotal ? "総投資額" : "取得価額",
      months: r?.months ?? 0, occ: r?.occ ?? null, adr: r?.adr ?? null,
      stayRevenue, stayPayout, otherIncomePerYear: other,
      utilities, tax, insurance: ins, reserve: res,
      noi,
      /* 実質利回りと収益還元の評価。取得価額が未入力なら出さない（0で割らない） */
      netYield: noi && price ? Math.round((noi / price) * 10000) / 100 : null,
      capRate,
      value: noi ? Math.round(noi / capRate) : null,
      gain: noi && price ? Math.round(noi / capRate) - price : null,
      schedules: schedSnap.docs.filter((s) => s.data().prop === d.id)
        .map((s) => ({ id: s.id, title: s.data().title, months: s.data().months, everyYears: s.data().everyYears ?? 1 })),
      /* 更新計画の前提。実効年数＝耐用年数×usageFactor（上限 lifespanCapYears） */
      usageFactor: Number(p.usageFactor ?? 2.0),
      lifespanCapYears: Number(p.lifespanCapYears ?? 30),
      buildingLifeYears: Number(p.buildingLifeYears ?? 0) || null,
      lifecycleNote: p.lifecycleNote ?? null,
      /* 書類一式に格納日時を合成（保管庫の作成時刻＝導出。...p の後なので上書きになる） */
      drawings: Array.isArray(p.drawings)
        ? (p.drawings as Array<{ path?: string }>).map((dd) => ({
            ...dd, storedAt: dd.path ? storedAt.get(String(dd.path)) ?? null : null }))
        : p.drawings,
      /* 設備台帳。故障時に業者へ即答できるよう、型番まで持つ */
      strayGroups,
      /* 追加投資額は台帳（equipment 2026）と工事明細（items 2026）から毎回導出。保存しない */
      additionalInvestment: addDerived,
      equipment: eqSnap.docs.filter((e) => e.data().prop === d.id)
        .map((e) => ({ id: e.id, ...(e.data() as object) })),
      docs: insSnap.docs.filter((s) => s.data().prop === d.id)
        .map((s) => ({ id: s.id, label: `${s.data().product}（${s.data().plan}）` })),
    };
  }).sort((a, b) => (b.netYield ?? -1) - (a.netYield ?? -1));

  return { rows, utilNote: "光熱費・通信費は棟別に分かれていないため、稼働棟数で割った概算" };
}

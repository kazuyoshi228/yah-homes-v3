/**
 * 更新計画 — 積立額が足りているかを、設備台帳から毎回引き直す
 *
 * 数字はここで持たない。持つのは equipment の各アイテムだけ:
 *   amount（いくらだったか）・installedAt（いつ入れたか）・lifespanYears（通常想定の耐用年数）
 *
 * そこから計算で出す:
 *   実効年数  = lifespanYears × usageFactor（宿泊は使用強度が住居より低い）、ただし上限で頭打ち
 *   年割り額  = amount ÷ 実効年数
 *   更新予定年 = installedAt + 実効年数
 *
 * 年割り額の合計と、積立カード（reserves）の額を突き合わせる。
 * 積立が年割り合計を下回っていたら、その差はいつか現金で払うことになる。
 */
import { agencyDb } from "./engine.js";

/** 使用強度の既定。物件側に usageFactor があればそれを使う */
const DEFAULT_FACTOR = 2.0;
/** 実効年数の上限。これ以上先の更新は計画の精度が出ない（2026-08-24 発注者判断で 20 → 30） */
const DEFAULT_CAP = 30;

export type RenewalItem = {
  id: string; prop: string; propLabel: string; group: string; label: string;
  amount: number; installedAt: string;
  /* まだ払っていない将来の支出（長期修繕の概算）。取得額の合計には足さない */
  futureCost: boolean; estimate: string | null;
  lifespanYears: number; effectiveYears: number; overridden: boolean;
  /* 作業として起票する対象か。¥10万以上・法令・建物の維持だけを立てる */
  workOrder: boolean;
  /* 紐づくジョブの状態（あれば）。予定だけなら "予定" */
  job: { status: string; dueMonth: string; id: string } | null;
  perYear: number; dueYear: number | null; yearsLeft: number | null;
};

export async function renewalPlan(prop?: string) {
  const db = agencyDb();
  const [eqSnap, propSnap, resSnap, scSnap, jobSnap] = await Promise.all([
    db.collection("equipment").where("kind", "==", "equipment").get(),
    db.collection("properties").get(),
    db.collection("reserves").get(),
    db.collection("schedules").get(),
    db.collection("jobs").where("status", "in",
      ["draft", "sent", "negotiating", "confirmed", "done"]).get(),
  ]);
  /* 設備台帳の項目 → いま動いているジョブ。schedules.ledgerId でつなぐ */
  const byLedger = new Map<string, { status: string; dueMonth: string; id: string }>();
  const schedOf = new Map<string, string>();   // scheduleId → ledgerId
  for (const d of scSnap.docs) {
    const l = String(d.data().ledgerId ?? "");
    if (l) schedOf.set(d.id, l);
  }
  for (const j of jobSnap.docs) {
    const l = schedOf.get(String(j.data().scheduleId ?? ""));
    if (l && !byLedger.has(l)) {
      byLedger.set(l, { status: String(j.data().status), dueMonth: String(j.data().dueMonth ?? ""), id: j.id });
    }
  }

  const factors = new Map<string, { factor: number; cap: number; label: string }>();
  for (const d of propSnap.docs) {
    const p = d.data();
    factors.set(d.id, {
      factor: Number(p.usageFactor ?? DEFAULT_FACTOR),
      cap: Number(p.lifespanCapYears ?? DEFAULT_CAP),
      label: String(p.label ?? d.id),
    });
  }

  const thisYear = new Date().getFullYear();
  const items: RenewalItem[] = [];
  let noLifespan = 0;

  for (const d of eqSnap.docs) {
    const e = d.data() as Record<string, unknown>;
    const pid = String(e.prop ?? "");
    if (prop && pid !== prop) continue;
    const amount = Number(e.amount ?? e.price ?? 0);
    const life = Number(e.lifespanYears ?? 0);
    /* 工事費・保証・配送など、更新の概念がないものは対象外（欠測ではない） */
    if (e.noRenewal === true) continue;
    /* 耐用年数が未設定のものは黙って落とさず数える（欠測は明記する） */
    if (!life) { if (amount > 0) noLifespan++; continue; }

    const fx = factors.get(pid) ?? { factor: DEFAULT_FACTOR, cap: DEFAULT_CAP, label: pid };
    /* 画面で手直しした実効年数があればそれを優先する。無ければ耐用年数×使用強度（上限あり）。
       建物本体など、係数を当てないものは noFactor で除く */
    const ov = Number(e.effectiveYearsOverride ?? 0);
    const eff = ov > 0 ? ov
      : e.noFactor === true ? life : Math.min(life * fx.factor, fx.cap);

    const at = String(e.installedAt ?? e.date ?? "");
    const y0 = /^\d{4}/.test(at) ? Number(at.slice(0, 4)) : null;
    const dueYear = y0 === null ? null : Math.round(y0 + eff);

    items.push({
      id: d.id, prop: pid, propLabel: fx.label,
      group: String(e.group ?? "設備"),
      label: String(e.model || e.category || d.id),
      amount, installedAt: at,
      futureCost: e.futureCost === true,
      estimate: e.estimate ? String(e.estimate) : null,
      lifespanYears: life, effectiveYears: Math.round(eff * 10) / 10,
      /* 手直しされた値か（画面で印を出すため） */
      overridden: ov > 0,
      perYear: Math.round(amount / eff),
      dueYear, yearsLeft: dueYear === null ? null : dueYear - thisYear,
      workOrder: e.workOrder === true,
      job: byLedger.get(d.id) ?? null,
    });
  }

  const perYearTotal = items.reduce((a, i) => a + i.perYear, 0);

  /* 群ごとの内訳。どこに年割りが偏っているかを見る */
  const byGroup = [...new Map(items.map((i) => [i.group, 0])).keys()]
    .map((g) => {
      const rows = items.filter((i) => i.group === g);
      return {
        group: g, count: rows.length,
        amount: rows.reduce((a, i) => a + (i.futureCost ? 0 : i.amount), 0),
        futureAmount: rows.reduce((a, i) => a + (i.futureCost ? i.amount : 0), 0),
        perYear: rows.reduce((a, i) => a + i.perYear, 0),
      };
    })
    .sort((a, b) => b.perYear - a.perYear);

  /* 今後20年の更新カレンダー。どの年に山が来るか */
  const timeline = Array.from({ length: 20 }, (_, k) => thisYear + k).map((y) => ({
    year: y,
    amount: items.filter((i) => i.dueYear === y).reduce((a, i) => a + i.amount, 0),
    count: items.filter((i) => i.dueYear === y).length,
  }));

  /* 棟ごとのロールアップ。どの棟に更新の負担が寄っているか */
  const propIds = [...new Set(items.map((i) => i.prop))];
  const byProp = propIds.map((pid) => {
    const rows = items.filter((i) => i.prop === pid);
    const rsv = resSnap.docs.filter((d) => d.data().prop === pid)
      .reduce((a, d) => a + Number(d.data().amountPerYear ?? 0), 0);
    const per = rows.reduce((a, i) => a + i.perYear, 0);
    return {
      prop: pid, propLabel: factors.get(pid)?.label ?? pid,
      count: rows.length,
      amount: rows.reduce((a, i) => a + (i.futureCost ? 0 : i.amount), 0),
      futureAmount: rows.reduce((a, i) => a + (i.futureCost ? i.amount : 0), 0),
      perYear: per, reservesPerYear: rsv, gap: rsv - per,
      /* 直近に来る更新。棟の一覧で「次に何が来るか」を出す */
      next: rows.filter((i) => i.dueYear !== null)
        .sort((a, b) => (a.dueYear ?? 0) - (b.dueYear ?? 0))[0] ?? null,
    };
  }).sort((a, b) => b.perYear - a.perYear);

  /* 積立カードとの突合。足りているか、足りていないか */
  const reserves = resSnap.docs
    .filter((d) => !prop || d.data().prop === prop)
    .reduce((a, d) => a + Number(d.data().amountPerYear ?? 0), 0);

  return {
    items: items.sort((a, b) => (a.dueYear ?? 9999) - (b.dueYear ?? 9999)),
    byGroup, byProp, timeline,
    total: {
      count: items.length,
      /* 取得額（もう払ったもの）と、将来の支出（長期修繕の概算）は混ぜない */
      amount: items.reduce((a, i) => a + (i.futureCost ? 0 : i.amount), 0),
      futureAmount: items.reduce((a, i) => a + (i.futureCost ? i.amount : 0), 0),
      /* 概算のまま年割りに入っている件数。見積が出たら置き換える */
      estimated: items.filter((i) => i.estimate).length,
      perYear: perYearTotal, reservesPerYear: reserves,
      gap: reserves - perYearTotal,
      /* 欠測。耐用年数がまだ入っていない有償アイテムの数 */
      noLifespan,
    },
  };
}

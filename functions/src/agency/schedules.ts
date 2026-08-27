/**
 * 定期作業の導出（メンテナンスカード）
 * 仕様: docs/spec_schedules_editable_20260825.md（2026-08-25 承認）
 *
 * schedules に保存してよいのは「予定の決めごと」だけ。次の2つはここで毎回引き直す:
 *   周期     … ledgerId があれば設備台帳の実効年数から（＝写しを持たない）
 *   前回実施 … jobs の検収済みの最新。無ければ設備台帳の設置年月
 *
 * 以前は schedules.everyYears が設備台帳の実効年数の写しになっており、
 * 2026-08-24 に上限を20→30年へ変えたときに追随せず、11件中2件がズレていた。
 */
type Doc = Record<string, unknown>;

const num = (v: unknown) => Number(v ?? 0) || 0;

/** 設備台帳の実効年数（更新計画と同じ式。持たずに毎回引く） */
function effectiveYears(eq: Doc, factor: number, cap: number): number {
  const life = num(eq.lifespanYears);
  if (!life) return 0;
  const ov = num(eq.effectiveYearsOverride);
  if (ov > 0) return ov;
  return eq.noFactor === true ? life : Math.min(life * factor, cap);
}

export type ScheduleView = Doc & {
  id: string;
  everyMonths: number;          // 周期（ヶ月）。0＝単発
  cycleLabel: string;           // 画面の表示用
  cycleFromLedger: boolean;     // true なら編集不可（設備台帳が正本）
  ledgerId: string;
  lastDone: string | null;      // 前回実施（YYYY-MM または YYYY-MM-DD）
  lastDoneFrom: "job" | "ledger" | null;
  nextDueMonth: string | null;  // 次回（自動）
  nextDueFrom: "job" | "anchor" | "month" | null;   // どう出したか（推測の度合いを画面に出す）
};

export function enrichSchedules(
  schedules: Doc[], jobs: Doc[], equipment: Doc[], properties: Doc[],
): ScheduleView[] {
  const eqById = new Map(equipment.map((e) => [String(e.id), e]));
  const fx = new Map(properties.map((p) => [String(p.id),
    { f: Number(p.usageFactor ?? 2), c: Number(p.lifespanCapYears ?? 30) }]));

  /* この周期に紐づく「検収済み」の最新。実施日は confirmedAt → dueMonth の順に見る */
  const lastBySchedule = new Map<string, string>();
  for (const j of jobs) {
    if (j.status !== "verified") continue;
    const sid = String(j.scheduleId ?? "");
    if (!sid) continue;
    const at = String(j.doneAt ?? j.confirmedAt ?? j.dueMonth ?? "");
    if (!at) continue;
    const cur = lastBySchedule.get(sid);
    if (!cur || at > cur) lastBySchedule.set(sid, at);
  }

  return schedules.map((s) => {
    const ledgerId = String(s.ledgerId ?? "");
    const eq = ledgerId ? eqById.get(ledgerId) : undefined;
    const p = fx.get(String(s.prop ?? "")) ?? { f: 2, c: 30 };

    /* 周期。設備台帳に紐づくものは台帳が正本＝ここでは編集させない */
    const fromLedger = !!eq && effectiveYears(eq, p.f, p.c) > 0;
    const everyMonths = fromLedger
      ? Math.round(effectiveYears(eq as Doc, p.f, p.c) * 12)
      : num(s.everyMonths) || (num(s.everyYears) >= 99 ? 0 : num(s.everyYears) * 12);

    const months = (Array.isArray(s.months) ? s.months as number[] : []).map(Number).filter(Boolean);
    /* 実施月は「次回」の列で分かるので、周期には出さない（2026-08-25 発注者指摘） */
    const cycleLabel = everyMonths === 0 ? "単発"
      : everyMonths % 12 === 0 ? `${everyMonths / 12}年ごと`
        : `${everyMonths}ヶ月ごと`;

    /* 前回実施。ジョブが最優先、無ければ設備の設置年月 */
    const fromJob = lastBySchedule.get(String(s.id)) ?? null;
    const fromEq = eq ? String(eq.installedAt ?? "") || null : null;
    const lastDone = fromJob ?? fromEq;
    const lastDoneFrom = fromJob ? "job" as const : (fromEq ? "ledger" as const : null);

    /* 次回。実績が無くても分かるものは出す。分からないものは推測せず「初回待ち」と言う
       （2026-08-25 発注者指摘: 単発も繰り返しも「—」ばかりで区別できなかった） */
    const anchor = num(s.anchorYear);
    const now = new Date();
    const fmt = (y: number, m: number) => `${y}/${String(m).padStart(2, "0")}`;
    let nextDueMonth: string | null = null;
    let nextDueFrom: "job" | "anchor" | "month" | null = null;

    if (lastDone && everyMonths > 0) {
      /* ① 実績がある: 前回＋周期。実施月が決まっていればその月に丸める */
      const [y, m] = lastDone.split("-").map(Number);
      if (y) {
        const d = new Date(Date.UTC(y, (m || 1) - 1 + everyMonths, 1));
        let yy = d.getUTCFullYear(), mm = d.getUTCMonth() + 1;
        if (months.length) mm = months.reduce((a, b) =>
          Math.abs(b - mm) < Math.abs(a - mm) ? b : a, months[0]);
        nextDueMonth = fmt(yy, mm); nextDueFrom = "job";
      }
    } else if (anchor) {
      /* ② 起点年がある（単発・長周期）: その年の実施月。過ぎていて繰り返しなら次の周期へ送る */
      let yy = anchor, mm = months.length ? months[0] : 1;
      if (everyMonths > 0) {
        while (yy * 12 + mm < now.getFullYear() * 12 + now.getMonth() + 1) {
          const d = new Date(Date.UTC(yy, mm - 1 + everyMonths, 1));
          yy = d.getUTCFullYear(); mm = d.getUTCMonth() + 1;
        }
      }
      nextDueMonth = months.length ? fmt(yy, mm) : `${yy}年`;
      nextDueFrom = "anchor";
    } else if (months.length && everyMonths > 0 && everyMonths <= 12) {
      /* ③ 毎年・半年など短い周期で実施月が決まっている: 次に来るその月
            （2年以上は起点が分からないと年が決まらないので推測しない） */
      const nowKey = now.getFullYear() * 12 + now.getMonth() + 1;
      const cands = months.map((m) => (nowKey <= now.getFullYear() * 12 + m
        ? { y: now.getFullYear(), m } : { y: now.getFullYear() + 1, m }));
      const pick = cands.sort((a, b) => (a.y * 12 + a.m) - (b.y * 12 + b.m))[0];
      nextDueMonth = fmt(pick.y, pick.m); nextDueFrom = "month";
    }

    return { ...s, everyMonths, cycleLabel, cycleFromLedger: fromLedger, ledgerId,
             lastDone, lastDoneFrom, nextDueMonth, nextDueFrom } as ScheduleView;
  });
}

/** 画面から保存してよい項目。ここに無いものは弾く（勝手な項目が増えないように） */
export const SCHEDULE_FIELDS = [
  "title", "prop", "category", "everyMonths", "months", "leadDays", "vendorId",
  "budget", "active", "needsDecision", "manualOnly", "statutory", "note",
  "anchorYear",   // 起点年。次回は導出だが「いつから始まるか」は人が決める（2026-08-25）
  "dueDate",     // 日が決まっているものだけ（YYYY-MM-DD）。消し込み帳が「あと3日」を出すために使う（2026-08-27）
] as const;

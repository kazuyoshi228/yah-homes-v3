/**
 * アラート配信 — 業者ディスパッチ仕様書 §6（fail-closed の出口）
 *
 * 見張り（engine.findOverdue / staleHeartbeats）が見つけた異常を、人に届ける。
 * 静かに壊れないための最後の一段。届かなければ意味がないので、
 * ここ自体の失敗も次回のハートビート点検で検知される。
 */
import { agencyDb, findOverdue, staleHeartbeats } from "./engine.js";
import { notifySettings } from "./settings.js";
import { sendNotice } from "./mailer.js";
import { askAI } from "./ai.js";

const PROP_LABEL: Record<string, string> = {
  kiyokawa: "清川", takasago: "高砂", ropponmatsu: "六本松", otemonA: "大手門A", otemonB: "大手門B",
};

/** 例外ジョブ（人の判断待ち）を集める */
async function exceptions() {
  const snap = await agencyDb().collection("jobs").where("status", "==", "exception").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as Array<{
    id: string; title: string; prop: string; dueMonth: string;
    timeline: Array<{ note?: string }>;
  }>;
}

/** 未紐付けメール（誰宛か分からなかったもの） */
async function unmatched() {
  const snap = await agencyDb().collection("unmatched").where("needsHuman", "==", true).get();
  return snap.docs.map((d) => d.data() as { from: string; subject: string });
}

/**
 * 毎朝の点検メール。異常ゼロの日も「全て正常」を1通送る（2026-08-27 発注者指示）——
 * 毎日届くこと自体が見張りの生存証明になる（届かない日＝配信系の異常）。
 */
/**
 * 見積の催促 — 概算のまま実施年が近づいている長期修繕を拾う。
 *
 * これが無いと、2036年に¥132万の請求書を見て初めて概算が甘かったと気づくことになる。
 * 実施年の1年前に出す。金額が概算（estimate が付いている）ものだけが対象。
 */
export async function estimatesDue(now: Date): Promise<Array<{ label: string; prop: string; due: number; amount: number }>> {
  const db = agencyDb();
  const [eq, props] = await Promise.all([
    db.collection("equipment").where("kind", "==", "equipment").get(),
    db.collection("properties").get(),
  ]);
  const label = new Map(props.docs.map((d) => [d.id, String(d.data().label ?? d.id)]));
  const fx = new Map(props.docs.map((d) => [d.id,
    { f: Number(d.data().usageFactor ?? 2), c: Number(d.data().lifespanCapYears ?? 30) }]));
  const y = now.getFullYear();
  const out: Array<{ label: string; prop: string; due: number; amount: number }> = [];
  for (const d of eq.docs) {
    const e = d.data();
    if (!e.estimate) continue;                       // 実額が入っているものは催促しない
    if (e.estimateObtained === true) continue;       // 見積を取り終えたものも催促しない
    const life = Number(e.lifespanYears ?? 0);
    if (!life) continue;
    const p = fx.get(String(e.prop)) ?? { f: 2, c: 30 };
    const ov = Number(e.effectiveYearsOverride ?? 0);
    const eff = ov > 0 ? ov : e.noFactor === true ? life : Math.min(life * p.f, p.c);
    const at = String(e.installedAt ?? e.date ?? "");
    if (!/^\d{4}/.test(at)) continue;
    const due = Math.round(Number(at.slice(0, 4)) + eff);
    if (due - y > 1 || due < y) continue;            // 1年前になったら／過ぎたものは overdue 側で拾う
    out.push({ label: String(e.model ?? d.id), prop: label.get(String(e.prop)) ?? String(e.prop),
      due, amount: Number(e.amount ?? e.price ?? 0) });
  }
  return out.sort((a, b) => a.due - b.due);
}

/**
 * CVの突合 — GA4直取り（ga4Daily）と定点シート経由（bookingDaily.cv）を昨日ぶんで比べる。
 * 同じGA4を見た2系統が食い違う＝どちらかの取得が壊れた合図（spec_ga4_teiten §3）。
 */
async function cvCrosscheck(now: Date): Promise<string | null> {
  const db = agencyDb();
  const y = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  const [g, b] = await Promise.all([
    db.collection("ga4Daily").doc(y).get(),
    db.collection("bookingDaily").doc(y).get(),
  ]);
  const gv = g.data()?.keyEventsTotal ?? g.data()?.keyEvents?.total;
  const bv = b.data()?.cv;
  if (g.data()?.fetchFailed) return `GA4定点の取得が失敗（${y}・fetchFailed）`;
  if (gv == null || bv == null) return null;        // どちらか未着はまだ判定しない
  return Number(gv) === Number(bv) ? null
    : `CV突合の乖離（${y}）: GA4直取り ${gv} vs 定点シート経由 ${bv}`;
}

/** 当月の植栽作業日が未選択なら知らせる（毎月10日から・清川）。
    業者ページで日を選べば消える。2026-08-25 発注者指示 */
export async function plantingUnscheduled(now: Date): Promise<string | null> {
  /* 周期の正本は settings/planting（コードに埋めない）。植栽は定期作業に置かない——
     予定を立てるのは業者で、こちらは「今月まだ選ばれていない」ことに気づければよい */
  const st = await agencyDb().collection("settings").doc("planting").get();
  const cfg = (st.data() ?? {}) as { cadenceMonths?: number; alertFromDay?: number };
  const fromDay = Number(cfg.alertFromDay ?? 10);
  if (now.getDate() < fromDay) return null;
  const ym = now.toISOString().slice(0, 7);
  const snap = await agencyDb().collection("jobs")
    .where("category", "==", "植栽").where("prop", "==", "kiyokawa").get();
  const has = snap.docs.some((d) => {
    const j = d.data() as { plantingDate?: string; status?: string };
    return (j.plantingDate ?? "").startsWith(ym) && j.status !== "cancelled";
  });
  return has ? null : `清川: 今月（${ym}）の植栽作業日がまだ選ばれていません（花屋アンへ業者ページの確認を）`;
}

/**
 * 保証期限ウォッチ（H・2026-08-25 発注者承認）。
 * 保証は症状がないと使えない——防ぐのは「調子悪いまま放置→期限切れ→実費」。
 * warrantyUntil（YYYY-MM）の90日前から拾い、期限月を過ぎたら黙る（過去は対象外）。
 */
export async function warrantyDue(now: Date): Promise<Array<{ id: string; label: string; prop: string; until: string }>> {
  const snap = await agencyDb().collection("equipment").where("kind", "==", "equipment").get();
  const ym = (d: Date) => d.toISOString().slice(0, 7);
  const nowYm = ym(now);
  const limit = ym(new Date(now.getFullYear(), now.getMonth() + 3, 1));
  return snap.docs
    .map((d) => ({ id: d.id, label: String(d.data().model ?? d.id),
      prop: String(d.data().prop ?? ""), until: String(d.data().warrantyUntil ?? "") }))
    .filter((x) => x.until && x.until >= nowYm && x.until <= limit)
    .sort((a, b) => a.until.localeCompare(b.until));
}

/** 実施予定日を過ぎたのに報告が無い植栽ジョブ（P10・2026-08-25）。
    「選んだのに来なかった」「やったのに報告を忘れた」の両方を拾う */
export async function plantingUnreported(now: Date): Promise<string[]> {
  const today = now.toISOString().slice(0, 10);
  const snap = await agencyDb().collection("jobs")
    .where("category", "==", "植栽").where("status", "==", "confirmed").get();
  return snap.docs.map((d) => d.data() as { plantingDate?: string; vendorName?: string })
    .filter((j) => j.plantingDate && j.plantingDate < today)
    .map((j) => `清川 ${j.plantingDate} の作業（${j.vendorName ?? "業者"}）— 完了報告がまだありません`);
}

export async function sendDailyAlert(now = new Date()): Promise<{ sent: boolean; items: number }> {
  const overdue = await findOverdue(now);
  const stale = await staleHeartbeats(now);
  const exc = await exceptions();
  const un = await unmatched();
  const est = await estimatesDue(now);
  const cvx = await cvCrosscheck(now);
  const planting = await plantingUnscheduled(now);
  const wty = await warrantyDue(now);
  const pUnrep = await plantingUnreported(now);
  const total = overdue.length + stale.length + exc.length + un.length + est.length + wty.length
    + (cvx ? 1 : 0) + (planting ? 1 : 0) + pUnrep.length;
  /* 異常ゼロでも毎日1通送る（2026-08-27 発注者指示）。
     「静かだから正常」ではなく「正常だと毎日言ってくる」——見張り自体が生きている証明を兼ねる */

  /* セクションを一度データで組み、テキスト版とHTML版を同じ内容から生成する（2026-08-27 発注者指示でHTML化）。
     期日の表示は dueLabel（実施日が決まっていれば日付・なければ月） */
  const crit = overdue.filter((o) => o.level === "critical");
  const warn = overdue.filter((o) => o.level === "warn");
  /* 各行に「消し込む場所」への深リンクを持たせ、HTML版は表で出す（2026-08-27 発注者指示）。
     列 = 対象 / 施設 / 期日 / 状況。テキスト版は従来の箇条書きを列から合成する */
  const OS = "https://os.yah.homes";
  type Row = { c: [string, string, string, string]; url?: string };
  const secs: Array<{ title: string; tone: "bad" | "warn" | "info"; rows: Row[] }> = [];
  if (stale.length) secs.push({ title: "自動処理が動いていない可能性（最優先）", tone: "bad",
    rows: stale.map((s2) => ({ c: [s2.name, "", "", `${Math.floor(s2.silentSec / 3600)}時間 音沙汰なし`] })) });
  if (crit.length) secs.push({ title: "期日を大きく超過", tone: "bad",
    rows: crit.map((o) => ({ c: [o.job.title, PROP_LABEL[o.job.prop] ?? o.job.prop, o.dueLabel, o.reason],
      url: `${OS}/maintenance?tab=cal` })) });
  if (warn.length) secs.push({ title: "期日が近い・遅れている", tone: "warn",
    rows: warn.map((o) => ({ c: [o.job.title, PROP_LABEL[o.job.prop] ?? o.job.prop, o.dueLabel, o.reason],
      url: `${OS}/maintenance?tab=cal` })) });
  if (exc.length) secs.push({ title: "人の判断待ち", tone: "warn",
    rows: exc.map((e) => ({ c: [e.title, PROP_LABEL[e.prop] ?? e.prop, e.dueMonth, e.timeline?.at(-1)?.note ?? ""],
      url: `${OS}/maintenance?tab=cal` })) });
  if (cvx) secs.push({ title: "GA4定点の点検", tone: "warn",
    rows: [{ c: ["CV突合", "", "", cvx], url: `${OS}/reports` }] });
  if (planting || pUnrep.length) secs.push({ title: "植栽", tone: "warn",
    rows: [...(planting ? [{ c: ["作業日の選択", "清川", "", planting] as Row["c"], url: `${OS}/planting` }] : []),
      ...pUnrep.map((t) => ({ c: ["完了報告", "清川", "", t] as Row["c"], url: `${OS}/planting` }))] });
  if (est.length) secs.push({ title: "見積を取る時期（概算のまま実施年が近い）", tone: "info",
    rows: est.map((e) => ({ c: [e.label, e.prop, `${e.due}年`, `いまの見込み ¥${e.amount.toLocaleString()}`],
      url: `${OS}/properties?tab=ren` })) });
  if (wty.length) secs.push({ title: "保証の期限が近い（不調がないか点検・あれば保証で修理）", tone: "info",
    rows: wty.map((w) => ({ c: [w.label, "", `${w.until}まで`, "保証期限"], url: `${OS}/maintenance?tab=ren` })) });
  if (un.length) secs.push({ title: "ジョブに紐付かなかったメール", tone: "info",
    rows: un.map((u) => ({ c: [`「${u.subject}」`, "", "", u.from], url: `${OS}/maintenance?tab=hist` })) });

  const SCREEN = "https://os.yah.homes/maintenance";
  const L: string[] = ["yah.OS 外部委託の点検結果です。", ""];
  /* aiNote はこの時点では未生成なので、後で先頭へ差し込む（下の sendNotice 直前） */
  for (const sec of secs) {
    L.push(`■ ${sec.title}`);
    sec.rows.forEach((r2) => L.push(`　・${r2.c.filter(Boolean).join("／")}`));
    L.push("");
  }
  if (total === 0) L.push("✓ 全て正常です（期日・ハートビート・突合・保証・受信箱、すべて異常なし）", "");
  L.push(`画面: ${SCREEN}`);

  const escH = (v: string) => v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
  const toneColor = { bad: "#c0392b", warn: "#b07d10", info: "#556" };
  const toneBg = { bad: "#fbeeec", warn: "#faf4e4", info: "#eef0f4" };
  const td = 'style="padding:7px 10px;border-bottom:1px solid #eceae6;font-size:12.5px;color:#333;vertical-align:top"';
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f2;font-family:-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;color:#1c1c1c">
  <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e2e2de;border-radius:10px;padding:26px 30px">
    <p style="margin:0 0 4px;font-size:15px;font-weight:700">yah.OS 外部委託の点検結果</p>
    <p style="margin:0 0 16px;font-size:12px;color:#888">${total ? `要対応 ${total}件` : "要対応なし"}</p>
    ${total === 0 ? `<p style="margin:0;font-size:13px;color:#1e7d3e;background:#eef7f0;border:1px solid #cfe8d6;border-radius:7px;padding:10px 14px">✓ 全て正常です——期日・ハートビート・突合・保証・受信箱、すべて異常なし</p>` : `
    <div>
      ${secs.map((sec) => `
        <p style="margin:14px 0 6px;padding:7px 12px;font-size:12.5px;font-weight:700;letter-spacing:.04em;color:${toneColor[sec.tone]};background:${toneBg[sec.tone]};border-radius:6px">■ ${escH(sec.title)}</p>
        ${sec.rows.map((r2) => `
        <div style="padding:9px 4px 10px;border-bottom:1px solid #eceae6">
          <div style="font-size:14px;line-height:1.6">
            ${r2.url ? `<a href="${r2.url}" style="color:#1a4f9c;text-decoration:none;font-weight:700">${escH(r2.c[0])} →</a>` : `<b>${escH(r2.c[0])}</b>`}
            ${(r2.c[1] || r2.c[2]) ? `<span style="font-size:12px;color:#888">　${[r2.c[1], r2.c[2]].filter(Boolean).join("・")}</span>` : ""}
          </div>
          ${r2.c[3] ? `<div style="font-size:13px;line-height:1.7;color:#444;margin-top:2px">${escH(r2.c[3])}</div>` : ""}
        </div>`).join("")}`).join("")}
    </div>`}
    <p style="margin:24px 0 0"><a href="${SCREEN}" style="display:inline-block;background:#1c1c1c;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 22px;border-radius:6px">yah.OS で確認する</a></p>
  </div>
</body></html>`;

  /* AI所見（C+G・spec_ai_deepening・2026-08-27 発注者承認）: 警告がある日だけ、
     ①全体所見3行 ②主要警告の原因一次調査 を冒頭に添える。AIが失敗してもメールは出す（本文が主・所見は従） */
  let aiNote = "";
  if (total > 0) {
    try {
      const digest = secs.map((sec) => `■${sec.title}\n` + sec.rows.map((r2) => `・${r2.c.filter(Boolean).join("／")}`).join("\n")).join("\n");
      const r = await askAI(
        `毎朝の点検メールの冒頭に添える所見を書いてください。今日の警告一覧:\n${digest}\n\n` +
        `出力は次の2部だけ・合計10行以内・Markdown記号なし:\n` +
        `【所見】全体を3行以内で。数字の傾向（前月比など）は道具で実データを確認してから書く\n` +
        `【原因の見立て】重要な警告に絞り「警告名: 原因の見立て（根拠）」を各1行。道具で裏取りできないものは書かない`,
        [], { maxTurns: 8, maxOutputTokens: 4000 });
      aiNote = r.answer.trim();
    } catch { /* 所見なしで送る */ }
  }

  const to = (await notifySettings()).exceptionsTo;
  /* 点検メールは「起きた事実の通知」——autoSendゲート（業者へのAI発信の停止弁）を通らない。
     ゲートに掛けると下書きに眠って誰にも届かない（2026-08-25 植栽の通知で発覚・同日修正） */
  const bodyText = aiNote ? `yah.OS 外部委託の点検結果です。\n\n${aiNote}\n\n` + L.slice(2).join("\n") : L.join("\n");
  const htmlWithNote = aiNote
    ? html.replace('<table style="width:100%;border-collapse:collapse">',
        `<div style="background:#f4f6fa;border:1px solid #dde3ee;border-radius:8px;padding:12px 16px;margin:0 0 16px;font-size:12.5px;line-height:1.9;color:#334;white-space:pre-wrap">${escH(aiNote)}</div><table style="width:100%;border-collapse:collapse">`)
    : html;
  await sendNotice({
    to,
    subject: total === 0 ? "[yah.OS] 点検 異常なし"
      : `[yah.OS] 外部委託の要対応 ${total}件${stale.length ? "（自動処理の停止あり）" : ""}`,
    body: bodyText,
    html: htmlWithNote,
  });
  const r = { mode: "sent" as const };
  await agencyDb().collection("alertLogs").add({
    at: new Date().toISOString(), items: total, mode: r.mode,
    breakdown: { stale: stale.length, critical: crit.length, warn: warn.length,
      exception: exc.length, unmatched: un.length, estimates: est.length },
  });
  return { sent: true, items: total };
}

/**
 * 警報のテスト（原則2-5）— 月1回、わざと異常を作ってアラートが鳴るか確かめる。
 *
 * 鳴らない警報は無いのと同じで、しかも「静かだから正常」と誤解させる分だけ有害。
 * 内部ジョブとして期日切れの状態を1件作り、アラートに載ることを確認して片付ける。
 */
export async function testAlarm(): Promise<{ ok: boolean; detail: string }> {
  const db = agencyDb();
  const ref = await db.collection("jobs").add({
    type: "internal", title: "【警報テスト】これは訓練です", prop: "takasago",
    dueMonth: "2020-01", status: "sent", createdAt: new Date().toISOString(),
    requestMailAt: new Date().toISOString(),
    timeline: [{ at: new Date().toISOString(), status: "sent", by: "system", note: "警報が鳴るかの訓練" }],
  });
  const overdue = await findOverdue();
  const caught = overdue.some((o) => (o.job as { id?: string }).id === ref.id || o.job.title.includes("警報テスト"));
  await ref.delete();
  await db.collection("alarmTests").add({ at: new Date().toISOString(), caught });
  return { ok: caught, detail: caught ? "期日超過として検知された" : "検知されなかった（見張りが壊れている）" };
}

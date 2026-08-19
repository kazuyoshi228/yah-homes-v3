/**
 * アラート配信 — 業者ディスパッチ仕様書 §6（fail-closed の出口）
 *
 * 見張り（engine.findOverdue / staleHeartbeats）が見つけた異常を、人に届ける。
 * 静かに壊れないための最後の一段。届かなければ意味がないので、
 * ここ自体の失敗も次回のハートビート点検で検知される。
 */
import { agencyDb, findOverdue, staleHeartbeats } from "./engine.js";
import { notifySettings } from "./settings.js";
import { sendOrDraft } from "./mailer.js";

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
 * 毎朝の点検メール。異常が1つも無ければ送らない（通知が増えると読まれなくなるため）。
 * ただし「沈黙の検知」だけは別で、ハートビートが切れていたら必ず送る。
 */
export async function sendDailyAlert(now = new Date()): Promise<{ sent: boolean; items: number }> {
  const overdue = await findOverdue(now);
  const stale = await staleHeartbeats(now);
  const exc = await exceptions();
  const un = await unmatched();
  const total = overdue.length + stale.length + exc.length + un.length;
  if (total === 0) return { sent: false, items: 0 };

  const L: string[] = ["yah.OS 外部委託の点検結果です。", ""];
  if (stale.length) {
    L.push("■ 自動処理が動いていない可能性（最優先）");
    stale.forEach((s) => L.push(`　・${s.name}: ${Math.floor(s.silentSec / 3600)}時間 音沙汰なし`));
    L.push("");
  }
  const crit = overdue.filter((o) => o.level === "critical");
  if (crit.length) {
    L.push("■ 期日を大きく超過");
    crit.forEach((o) => L.push(`　・${o.job.title}（${PROP_LABEL[o.job.prop] ?? o.job.prop}・${o.job.dueMonth}）— ${o.reason}`));
    L.push("");
  }
  const warn = overdue.filter((o) => o.level === "warn");
  if (warn.length) {
    L.push("■ 期日が近い・遅れている");
    warn.forEach((o) => L.push(`　・${o.job.title}（${PROP_LABEL[o.job.prop] ?? o.job.prop}・${o.job.dueMonth}）— ${o.reason}`));
    L.push("");
  }
  if (exc.length) {
    L.push("■ 人の判断待ち");
    exc.forEach((e) => L.push(`　・${e.title}（${PROP_LABEL[e.prop] ?? e.prop}・${e.dueMonth}）— ${e.timeline?.at(-1)?.note ?? ""}`));
    L.push("");
  }
  if (un.length) {
    L.push("■ ジョブに紐付かなかったメール");
    un.forEach((u) => L.push(`　・${u.from}「${u.subject}」`));
    L.push("");
  }
  L.push("画面: https://os.yah.homes/vendors.html");
  L.push("（このメールは異常がある日だけ届きます）");

  const to = (await notifySettings()).exceptionsTo;
  const r = await sendOrDraft({
    to,
    subject: `[yah.OS] 外部委託の要対応 ${total}件${stale.length ? "（自動処理の停止あり）" : ""}`,
    body: L.join("\n"),
  });
  await agencyDb().collection("alertLogs").add({
    at: new Date().toISOString(), items: total, mode: r.mode,
    breakdown: { stale: stale.length, critical: crit.length, warn: warn.length, exception: exc.length, unmatched: un.length },
  });
  return { sent: true, items: total };
}

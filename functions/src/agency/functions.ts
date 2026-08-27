/**
 * 業者ディスパッチの入口 — 毎朝の自動運転と、業者返信の受け口
 *
 * ここが「人が何もしなくても回る」ための唯一の駆動点。
 *  - agencyDaily     : 毎朝7:00 JST。起票 → 依頼 → 見張り → watch貼り直し → アラート
 *  - agencyGmailPush : Gmail の新着通知（Pub/Sub）。返信を読んでジョブを進める
 *
 * Gmailの委任鍵は Secret Manager（AGENCY_MAILER_KEY）から実行時に注入する。
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { agencyDb, createDueJobs, createWarrantyJobs, beat } from "./engine.js";
import { startWatch, fetchNew, matchJob, record, detectHumanTakeover } from "./inbox.js";
import { isOwnerIntake, processIntake } from "./intake.js";
import { sendRequests, handleReply } from "./dispatcher.js";
import { notifySettings } from "./settings.js";
import { sendNotice } from "./mailer.js";
import { monthlyAiReport } from "./ai.js";
import { sendDailyAlert, testAlarm } from "./alerts.js";

const AGENCY_MAILER_KEY = defineSecret("AGENCY_MAILER_KEY");
const REGION = "asia-northeast1";

/** 毎朝の自動運転。どれか1つが落ちても残りは走らせる（一蓮托生にしない） */
export const agencyDaily = onSchedule(
  { schedule: "0 7 * * *", timeZone: "Asia/Tokyo", region: REGION, secrets: [AGENCY_MAILER_KEY], timeoutSeconds: 540 },
  async () => {
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        const r = await fn();
        await beat(name, 26 * 3600);          // 日次なので26時間で「沈黙」とみなす
        logger.info(`agency/${name}`, r);
      } catch (e) {
        logger.error(`agency/${name} 失敗`, e);   // 失敗はハートビートを更新しない = 翌朝アラートで露見する
      }
    };
    await step("createDueJobs", () => createDueJobs());
    await step("createWarrantyJobs", () => createWarrantyJobs());
    await step("sendRequests", () => sendRequests());
    await step("gmailWatch", () => startWatch());   // 有効期限7日。毎日貼り直して切れないようにする
    await step("dailyAlert", () => sendDailyAlert());
    /* 月次経営レポート（段E）: 毎月1日のJSTに送る。手動再実行は settings/aiReport.runOnce=true を置く
       （実行後に自動で消す・認証配管を増やさないための運用スイッチ） */
    const jstDay = new Date(Date.now() + 9 * 3600e3).getUTCDate();
    const flagRef = agencyDb().collection("settings").doc("aiReport");
    const runOnce = (await flagRef.get()).data()?.runOnce === true;
    if (jstDay === 1 || runOnce) {
      await step("monthlyAiReport", async () => {
        const r = await monthlyAiReport();
        const to = (await notifySettings()).exceptionsTo;
        const ym = new Date(Date.now() + 9 * 3600e3);
        const label = `${ym.getUTCFullYear()}-${String(ym.getUTCMonth() === 0 ? 12 : ym.getUTCMonth()).padStart(2, "0")}`;
        await sendNotice({
          to, subject: `[yah.OS] 月次経営レポート ${label}`,
          body: r.answer + `\n\n（参照: ${[...new Set(r.toolsUsed)].join("・")}／このレポートはAIが台帳から毎回導出しています。数字の正本は各カード）`,
          html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f2;font-family:-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;color:#1c1c1c"><div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e2e2de;border-radius:10px;padding:26px 30px"><p style="margin:0 0 14px;font-size:15px;font-weight:700">yah.OS 月次経営レポート ${label}</p><pre style="margin:0;font-family:inherit;font-size:13px;line-height:1.95;white-space:pre-wrap;color:#333">${r.answer.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))}</pre><p style="margin:18px 0 0;font-size:11px;color:#999">参照: ${[...new Set(r.toolsUsed)].join("・")}／AIが台帳から毎回導出（保存しない）。数字の正本は各カード。<a href="https://os.yah.homes/" style="color:#1a4f9c">yah.OS を開く</a></p></div></body></html>`,
        });
        if (runOnce) await flagRef.set({ runOnce: false }, { merge: true });
        return { sent: true, tools: r.toolsUsed.length };
      });
    }
    /* 月初だけ、警報そのものが生きているかを試す（原則2-5・鳴らない警報は有害） */
    if (new Date().getDate() === 1) {
      await step("alarmTest", async () => {
        const r = await testAlarm();
        if (!r.ok) throw new Error(`警報が鳴らない: ${r.detail}`);   // 失敗させてハートビートを止める
        return r;
      });
    }
  },
);

/** Gmail 新着 → 返信を読んでジョブを進める */
export const agencyGmailPush = onMessagePublished(
  { topic: "agency-gmail", region: REGION, secrets: [AGENCY_MAILER_KEY] },
  async (event) => {
    const db = agencyDb();
    const ref = db.collection("settings").doc("gmail");
    const since = String((await ref.get()).data()?.historyId ?? "");
    if (!since) { logger.warn("agency/gmailPush: historyId 未登録のため見送り"); return; }

    let mails;
    try {
      mails = await fetchNew(since);
    } catch (e) {
      logger.error("agency/gmailPush: 取得失敗", e);
      return;                                        // historyId は進めない（取りこぼしを防ぐ）
    }
    const newHistoryId = String((event.data.message.json as { historyId?: number })?.historyId ?? since);

    for (const mail of mails) {
      try {
        /* オーナーが転送したスクショ・PDF → 取込パイプ（段D）。業者メールのフローには流さない */
        if (isOwnerIntake(mail)) {
          const n = await processIntake(mail);
          logger.info(`agency/gmailPush: 取込 ${n}件（${mail.subject}）`);
          continue;
        }
        const m = await matchJob(mail);
        const jobId = m?.jobId ?? null;
        await record(mail, jobId);
        if (!jobId) continue;                        // 紐付かないものは unmatched に積まれ、翌朝のアラートに出る
        if (await detectHumanTakeover(jobId, mail.threadId)) {
          logger.info(`agency/gmailPush: ${jobId} は人が対応中のためAIは動かない`);
          continue;
        }
        const r = await handleReply(jobId, mail.body);
        logger.info(`agency/gmailPush: ${jobId} → ${r.action}`, r);
      } catch (e) {
        logger.error(`agency/gmailPush: ${mail.gmailId} の処理に失敗`, e);
      }
    }
    await ref.set({ historyId: newHistoryId }, { merge: true });
    await beat("gmailPush", 8 * 24 * 3600);          // 受信は不定期。8日沈黙したら watch 切れを疑う
  },
);

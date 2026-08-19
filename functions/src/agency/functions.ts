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
import { agencyDb, createDueJobs, beat } from "./engine.js";
import { startWatch, fetchNew, matchJob, record, detectHumanTakeover } from "./inbox.js";
import { sendRequests, handleReply } from "./dispatcher.js";
import { sendDailyAlert } from "./alerts.js";

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
    await step("sendRequests", () => sendRequests());
    await step("gmailWatch", () => startWatch());   // 有効期限7日。毎日貼り直して切れないようにする
    await step("dailyAlert", () => sendDailyAlert());
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

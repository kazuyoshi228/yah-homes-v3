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
import { aiSelfCheck } from "./aicheck.js";

const AGENCY_MAILER_KEY = defineSecret("AGENCY_MAILER_KEY");
const REGION = "asia-northeast1";
/** 月次バッチの沈黙しきい値（32日）。日次の26時間を当てると毎月ほぼ全期間で警報が鳴る */
const MONTHLY_SEC = 32 * 24 * 3600;

/** 毎朝の自動運転。どれか1つが落ちても残りは走らせる（一蓮托生にしない） */
export const agencyDaily = onSchedule(
  { schedule: "0 7 * * *", timeZone: "Asia/Tokyo", region: REGION, secrets: [AGENCY_MAILER_KEY], timeoutSeconds: 540 },
  async () => {
    /* 沈黙とみなすまでの猶予。日次は26時間、月次は32日——月に1度しか走らないものに
       日次の物差しを当てると、実行の翌々日から月末までずっと「要対応」が点灯し続ける。
       本物の異常と見分けがつかなくなるため分けた（2026-08-28 発注者指摘） */
    const step = async (name: string, fn: () => Promise<unknown>, expectEverySec = 26 * 3600) => {
      try {
        const r = await fn();
        await beat(name, expectEverySec);
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
    /* AIの自己点検（2026-08-29）。決まった質問で「期待した道具を引いたか」だけを見る。
       落ちると heartbeat が打たれず、翌日の点検メール・今日ボードに沈黙として出る */
    await step("aiSelfCheck", () => aiSelfCheck());
    /* 月次経営レポート（段E）: 毎月1日のJSTに送る。手動再実行は settings/aiReport.runOnce=true を置く
       （実行後に自動で消す・認証配管を増やさないための運用スイッチ） */
    const jstDay = new Date(Date.now() + 9 * 3600e3).getUTCDate();
    const flagRef = agencyDb().collection("settings").doc("aiReport");
    const runOnce = (await flagRef.get()).data()?.runOnce === true;
    if (jstDay === 1 || runOnce) {
      await step("monthlyAiReport", async () => {
        let r;
        try { r = await monthlyAiReport(); }
        catch (e) {
          /* 生成失敗でも「失敗した」メールは届ける——沈黙が一番怖い（レビューP1） */
          const to0 = (await notifySettings()).exceptionsTo;
          await sendNotice({ to: to0, subject: "[yah.OS] 月次経営レポート 生成失敗",
            body: `AIによるレポート生成に失敗しました: ${String((e as Error).message ?? e).slice(0, 300)}\n数字の正本は各カードで確認できます。再実行: settings/aiReport.runOnce=true` });
          if (runOnce) await flagRef.set({ runOnce: false }, { merge: true });
          return { sent: false, error: true };
        }
        const to = (await notifySettings()).exceptionsTo;
        /* 前月ラベル: 前月1日のDateを作ってから整形する（月だけ戻すと1月に年がズレる・レビュー2026-08-28 #3） */
        const jstNow = new Date(Date.now() + 9 * 3600e3);
        const prev = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() - 1, 1));
        const label = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
        await sendNotice({
          to, subject: `[yah.OS] 月次経営レポート ${label}`,
          body: r.answer + `\n\n（参照: ${[...new Set(r.toolsUsed)].join("・")}／このレポートはAIが台帳から毎回導出しています。数字の正本は各カード）`,
          html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f2;font-family:-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;color:#1c1c1c"><div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e2e2de;border-radius:10px;padding:26px 30px"><p style="margin:0 0 14px;font-size:15px;font-weight:700">yah.OS 月次経営レポート ${label}</p><pre style="margin:0;font-family:inherit;font-size:13px;line-height:1.95;white-space:pre-wrap;color:#333">${r.answer.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))}</pre><p style="margin:18px 0 0;font-size:11px;color:#999">参照: ${[...new Set(r.toolsUsed)].join("・")}／AIが台帳から毎回導出（保存しない）。数字の正本は各カード。<a href="https://os.yah.homes/" style="color:#1a4f9c">yah.OS を開く</a></p></div></body></html>`,
        });
        if (runOnce) await flagRef.set({ runOnce: false }, { merge: true });
        return { sent: true, tools: r.toolsUsed.length };
      }, MONTHLY_SEC);
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

    let mails, newHistoryId;
    try {
      ({ mails, newHistoryId } = await fetchNew(since));
    } catch (e) {
      logger.error("agency/gmailPush: 取得失敗", e);
      return;                                        // historyId は進めない（取りこぼしを防ぐ）
    }

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
        const fresh = await record(mail, jobId);
        if (!fresh) { logger.info(`agency/gmailPush: ${mail.gmailId} は記録済み（再配信）——読解をスキップ`); continue; }
        if (!jobId) continue;                        // 紐付かないものは unmatched に積まれ、翌朝のアラートに出る
        if (await detectHumanTakeover(jobId, mail.threadId)) {
          logger.info(`agency/gmailPush: ${jobId} は人が対応中のためAIは動かない`);
          continue;
        }
        const r = await handleReply(jobId, mail.body);
        logger.info(`agency/gmailPush: ${jobId} → ${r.action}`, r);
      } catch (e) {
        /* 失敗は台帳に残してから前へ進む（レビュー2026-08-28 #1: 黙って握りつぶすとメールが恒久消失していた）。
           mailFailures は health の「紐付かなかったメール」と同様に人へ露出させる */
        logger.error(`agency/gmailPush: ${mail.gmailId} の処理に失敗`, e);
        await db.collection("mailFailures").doc(mail.gmailId).set({
          at: mail.receivedAt, from: mail.from, subject: mail.subject,
          error: String((e as Error).message ?? e).slice(0, 500),
          needsHuman: true, failedAt: new Date().toISOString(),
        }, { merge: true });
      }
    }
    /* historyId は単調増加のみ（並行配信で古い値が新しい値を巻き戻さないように） */
    await db.runTransaction(async (tx) => {
      const cur = String((await tx.get(ref)).data()?.historyId ?? "0");
      if (BigInt(newHistoryId) > BigInt(cur)) tx.set(ref, { historyId: newHistoryId }, { merge: true });
    });
    await beat("gmailPush", 8 * 24 * 3600);          // 受信は不定期。8日沈黙したら watch 切れを疑う
  },
);

#!/usr/bin/env bash
# 日次の自動更新を仕込む（2026-09-03）★発注者が実行する
#
# 構成: Cloud Scheduler → Firestore export → （読み込みは手動 or 別途）
# ただし export だけでは BigQuery に載らないので、
# 「エクスポート＋読み込み＋VIEW再作成」を1本にした bq-setup.sh を
# ローカルの cron か、Cloud Run ジョブで回すのが素直。
#
# ここでは【いちばん単純で確実な方法】＝ローカルの cron を出す。
# 常時起動のサーバーが要らず、失敗すればすぐ気づく（bq-verify が鮮度を見る）。
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"

cat <<EOS
── 方法A: このMacの cron（おすすめ・追加費用ゼロ）──

  crontab -e で以下を1行足す（毎朝3時）:

    0 3 * * * cd $REPO && ./tools/bq-setup.sh >> /tmp/bq-daily.log 2>&1

  Macがスリープしていると動かないので、確実性を求めるなら方法B。

── 方法B: Cloud Scheduler（Macに依存しない）──

  1) エクスポート専用のサービスアカウントを作り、権限を与える
     gcloud iam service-accounts create bq-daily --project=yah-homes
     gcloud projects add-iam-policy-binding yah-homes \\
       --member=serviceAccount:bq-daily@yah-homes.iam.gserviceaccount.com \\
       --role=roles/datastore.importExportAdmin
     gcloud projects add-iam-policy-binding yah-homes \\
       --member=serviceAccount:bq-daily@yah-homes.iam.gserviceaccount.com \\
       --role=roles/storage.objectAdmin

  2) 毎日エクスポートさせる（Scheduler は3ジョブまで無料）
     gcloud scheduler jobs create http agency-export-daily \\
       --project=yah-homes --location=asia-northeast1 \\
       --schedule="0 3 * * *" --time-zone="Asia/Tokyo" \\
       --uri="https://firestore.googleapis.com/v1/projects/yah-homes/databases/agency:exportDocuments" \\
       --http-method=POST \\
       --oauth-service-account-email="bq-daily@yah-homes.iam.gserviceaccount.com" \\
       --message-body='{"outputUriPrefix":"gs://yah-homes-firestore-export/daily"}'

  ※ 方法Bは「GCSへ出す」までしかしない。BigQueryへの読み込みは
     別途 Cloud Run ジョブが要る——そこまでやるなら方法Aで足りる。

── どちらにしても、必ず入れること ──

  同期が止まったら気づけるように、週1回これを流す:
    cd $REPO && node tools/bq-verify.mjs

  36時間を超えて古ければ落ちる。壊れても画面は出てしまうので、
  古い数字を分析に使う事故はこれで止める。
EOS

# 運用手順: バックアップと復元（実演済み・2026-08-29）

- 起票: 2026-08-29 発注者「監視と復元の証跡、も進めて」
- **この手順は実際に一度通した。机上の空論ではない**（下記「演習の記録」）

## 分かっていること（実査 2026-08-29）

| 項目 | 実測 |
|---|---|
| バックアップ | **動いている**。`agency` DB の日次スケジュール（2026-08-24 設定・保持7日） |
| 実体 | 8/25〜8/29 の5件が存在（`(default)` も別途取得されている） |
| 場所 | `asia-northeast1` |
| 予算アラート | **未設定**（Billing Budget API が無効であることを確認）。設定は発注者の作業 |

> 前回の点検で「バックアップの証跡がない」と書いたのは誤り。**リポジトリから見えなかっただけ**で、
> 実際には動いていた。設定はコンソール側にあり、コードには現れない。

## 復元のやり方（本番に触らない）

**鉄則: 復元先は必ず新しい名前のDB。既存の `agency` を上書きしない。**

```bash
G=~/google-cloud-sdk/bin/gcloud

# 1. 直近のバックアップを選ぶ
$G firestore backups list --project=yah-homes --format='value(name,database.segment(-1),snapshotTime)' \
  | grep agency | sort -k3 -r | head -1

# 2. 別名のDBへ復元（10〜20分かかる。完了まで読めない）
$G firestore databases restore --source-backup="<上で得たname>" \
  --destination-database=agency-drtest --project=yah-homes

# 3. 中身を確かめる（本番と件数を突き合わせる）
#    REST: https://firestore.googleapis.com/v1/projects/yah-homes/databases/agency-drtest/documents/equipment

# 4. 確認できたら演習用DBを消す（放置すると課金が続く）
$G firestore databases delete --database=agency-drtest --project=yah-homes --quiet
```

## 演習の記録（2026-08-29）

- 復元元: 2026-08-29 11:07 のバックアップ
- 復元先: `agency-drtest`（新規・本番には触れていない）
- 所要: 復元開始からデータが読めるまで約15分。**開始直後は「復元中のため応答できない」と返る**（正常）
- 検証: `equipment` が **198件**で本番と一致
- 後片付け: 演習用DBを削除。`agency` / `(default)` / `chat` が無傷であることを一覧で確認

## まだ無いもの（発注者の作業が要る）

1. **予算アラート** … コンソールで Billing Budget API を有効化 → 予算と通知先を設定。
   AIは課金設定を変更できない（安全上の決まり）
2. **Error Reporting** … Cloud Functions の例外は Cloud Logging に入っているが、
   集約ビューを見る運用がまだ無い

## 次にこの手順を通す時期

半年に1回、または**スキーマを大きく変えた直後**。手順が古びていないかの確認も兼ねる。

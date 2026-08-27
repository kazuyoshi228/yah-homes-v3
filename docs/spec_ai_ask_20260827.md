# 仕様書 — AI質問窓（yah.OS × Claude API 連携・段A）

- 状態: **承認済み・Gemini（Vertex AI）へ切替済み（同日「GEMINI」指示）・デプロイ済み・IAM付与待ち**
- 起票: 2026-08-27

## 何を作ったか

ホーム（os.yah.homes/）の最上部に質問窓。質問すると Claude（claude-opus-5）が OS の実データを**自分で道具として叩いて**回答する。

```
「高砂の8月の光熱費は？」→ AIが get_facts(prop=takasago, ym=2026-08) を実行 → 実データの数字で回答（参照した道具名を表示）
```

## 構成

- サーバ: `functions/src/agency/ai.ts`（道具ループ）＋ `routes/ai.route.ts`（`?action=ask`・POSTのみ）
- 道具（**読み取り専用**・4本）: get_health（全検証）/ get_facts（全金額行・prop/ym/flowで絞る・400行超は刈って通知）/ get_renewal_plan（更新計画）/ list_overdue_jobs（期日ジョブ）
- クライアント: index.html の質問窓。履歴は画面を開いている間だけ（メモリ）
- モデル: gemini-2.5-pro（Vertex AI・location=global）。**APIキー不要**——実行SA（yah-homes@appspot）の IAM（roles/aiplatform.user）で認証。請求は既存GCPに合算
- agencyApi: timeoutSeconds 300 に延長（道具ループが60秒を超えることがある）

## 規律（既存ルールとの整合）

1. **読み取り専用。** 書き込みの道具を持たせない。操作を求められたら「画面から人が行う」と案内（fail-closed 維持）
2. **回答は保存しない**（SSoT原則。保存するのは一次事実と人の判断だけ）
3. **数字は道具の結果のみ**から。データが無ければ「無い」と言う（system で明示）
4. 認証は既存の owner ゲート（verify）をそのまま通る。鍵は存在しない（Vertex AI は実行SAのIAMのみ）

## 残作業（発注者・ターミナルで3行）

```
gcloud auth login
gcloud services enable aiplatform.googleapis.com --project=yah-homes
gcloud projects add-iam-policy-binding yah-homes --member="serviceAccount:yah-homes@appspot.gserviceaccount.com" --role="roles/aiplatform.user"
```

## コスト目安

gemini-2.5-pro（$1.25/1M入力・$10/1M出力）。1質問 ≒ **1〜10円**。日常利用で月数百円。

## 次の段（未着工・別承認）

- B: 操作の下書き（「見積催促ジョブを起こして」→ draft 作成まで）
- C: 毎朝の点検メールに AI の一言所見

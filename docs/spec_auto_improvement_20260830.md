# 仕様書: 自動改善ループ（承認待ち・2026-08-30）

- 起票: 発注者「システムを自動で定期的に改善されていくように。Human-in-the-Loopの仕組みも入れて」
  「PCで指示でよい」→ 初期3本の構成に「いいね」
- 状態: **仕様承認待ち。実装はこの文書の承認後**
- 実行基盤: **GitHub Actions 上の Claude Code**（Firebaseは使わない——指示の入口をPCにしたため
  台帳・橋渡しが不要になった。指示書=GitHub Issue）

## 全体の形

```
定期実行（GitHub Actions スケジュール）
   ├─ A: 完全自動の家事 ──────────→ PR（ゲート通過が承認代わり）
   └─ B: レビュー・提案 ──→ Issue起票 → 発注者が「ai実装」ラベル → Claude CodeがPR
                                                     ↓
                            発注者が PR を Merge（HITL）→ 既存CI → 本番
```

Human-in-the-Loop は2箇所のみ: **着工の承認（ラベル付け）** と **本番の承認（Merge）**。
AIはデプロイ権限を持たない（今と同じ・CIだけが持つ）。

- **ラベルはターミナルの会話から付けてよい**（2026-08-30 発注者決定）。
  発注者が「#12やって」と明示したときだけ、共有部スレッドが `ai実装` ラベルを付ける。
  AIが自分の判断でラベルを付けることはない（自作の提案に自分で着工させない）。
  Merge（本番承認）は従来どおり発注者のみ

## 初期スコープ（3本）

### 1. 週次ミニレビュー（月曜 朝に実行）
- 2026-08-28/29 に手動で行った全体レビュー（確定バグ8件を発見した実績）の縮小版
- 対象: 直近1週間の変更差分＋health/aiChecks/aiLogs の実データ
- 出力: **Issueのみ**（コードは書かない）。1件=1 Issue・再現手順と根拠の file:line 必須
- 誤検知対策: 「推測を書かない・実ファイルとFirestoreの実測のみ」を指示に明記

### 2. ラチェット下げ＋期日監視（毎日）
- `typecheck.mjs`（現基準188）と `check-hardcoded.mjs` を実行し、実測が基準を下回っていたら
  **基準値を下げるだけのPR**を自動作成（1行変更・機械的に正解が決まる）
- コード内の期日つき約束（例:「旧URLシムは2027-02に削除可」）を走査し、期日が来たらIssue起票
- 依存更新（firebase SDK / playwright / typescript）は**月次**: 更新→スモークが通ればPR、
  落ちたら原因メモつきIssue

### 3. 週報（月曜のメールに1段落）
- aiLogs（AI費用の実測）・aiChecks（自己点検の合否推移）・自動化自身の稼働記録を集計
- 既存の朝メール配管（agencyDaily→sendNotice）に載せる。新しい通知経路は作らない
- **沈黙する自動化は信用できない**——自動化が止まったこと自体が週報とhealthに出る

## やらないこと（明示）

- 業務ロジック・金額の意味・fail-closed境界の変更（対話でしか決めない）
- UXの自動「改善」（2026-08-29 ナビ改名事故の教訓——使う人の感覚が正解）
- データの穴埋め（出典なし26行・契約書原本6件は書類の問題。リマインドのみ）
- 1日のPR上限: 3本。Issue上限: 10本（暴走の歯止め）

## 安全の枠

- Claude Code の権限: リポジトリの読み書きとPR作成まで。**Secrets・課金・認証設定・
  firebase deploy には触れない**
- 週次レビューは読み取り専用（Firestoreも READABLE 相当の範囲のみ）
- すべての自動PRは既存CIゲート（型・テスト・スモーク・ラチェット・本番200確認）を通る

## 実行役の割り当て（2026-08-30 質疑で修正）

| 作業 | 実行役 | APIキー |
|---|---|---|
| ラチェット下げ・期日監視・依存更新 | **純スクリプト（AI不要）** | 不要 |
| 週報の文章 | 既存の Vertex AI Gemini（朝の所見と同じ配管） | 不要（IAM） |
| 週次ミニレビュー（Issue起票） | Vertex AI Gemini | 不要（IAM） |
| Issueラベル → 実装PR | Claude Code（GitHub Actions） | **ここだけ ANTHROPIC_API_KEY** |

**第1段はキー登録ゼロで開始できる。** 実装PRの実行役は、レビューの提案品質を見てから
Claude Code か Gemini CLI かを決める（第2段で判断）。

## 認証（2026-08-31 構築・疎通確認済み）

**静的なAPIキーは使わない。** Anthropic の ID連携（Workload Identity Federation）を設定し、
GitHub Actions の本人証明を数分で失効する短命トークンに交換する。Secrets への登録はゼロ。

- 連携ルール: `fdrl_01Mez1KLb6LKgQ13rGmEegoz`（発行者 github-actions・組織 `1aa736bd-4c51-4007-88c3-3b3e77937aad`）
- サービスアカウント: `yah-os-actions`（`svac_014m34RJJKhv2ZAzocn2xbxR`）・ワークスペース Default（`wrkspc_01HhAfY51yC7NeYGkxDo9JkB`）・スコープ workspace:developer
- 件名パターンは **数値ID埋め込み形式**: `repo:kazuyoshi228@47837716/yah-os@1338565023:*`
  （GitHubのsubは `owner@id/repo@id` 形式で来る。名前だけの `repo:owner/repo:*` では match_subject_prefix で拒否される——2026-08-31 実測でハマった点）
- 追加クレーム: repository / repository_owner / repository_owner_id の完全一致
- 疎通: `.github/workflows/anthropic-wif-test.yml`（workflow_dispatch・診断用に常備）で access_token 発行を確認済み
- ワークフロー側の要件: `permissions: id-token: write` のみ

## 必要な準備（発注者の作業）

1. **完了**（ID連携を2026-08-31に設定済み・上記）。クレジット残高 $18.05 あり、チャージも不要
2. 費用感: 第1段は月数百円以内（Gemini flash＋Actions実行費）。第2段込みでも従量制——使わない月は0円

## 検収（1ヶ月後）

- Issueの当たり率（承認された提案 ÷ 起票数）を週報で報告。低ければ指示を調整 or 縮小
- 完了条件: 3本が4週連続で稼働し、週報に稼働記録が残っていること

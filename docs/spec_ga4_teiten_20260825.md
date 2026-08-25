# 仕様書 — GA4定点の蓄積（ga4Daily）

- 状態: **提案・未実装（承認待ち）**
- 起票: 2026-08-25・定期レポート担当スレッド
- 前提: BaaSファースト（サーバーを持たない）・SSoT化必須（発注者要件）

---

## 1. いま何が捨てられているか

毎朝の観測ジョブはGA4から **セッション数・キーイベントの内訳（click_airbnb / click_booking_com /
click_booking_calendar / purchase）・purchase売上** を取得している。しかし**残るのは合計CV数1個だけ**
（定点シートH列→bookingDaily）。内訳・セッション・売上はメールに書かれて捨てられている。

手渡し率（click_airbnb÷セッション）や、8/16のCV定義切替をまたぐ比較は、いまのデータでは組めない。

## 2. 設計 — GA4の数字はGA4から直接積む

```
GA4 Data API（正本はGoogleの計測そのもの・APIで何度でも再取得可能）
   ↓ 毎朝 8:05  ga4TeitenSync（onSchedule・appspot SA=GA4閲覧者共有済み）
Firestore agency/ga4Daily/{YYYY-MM-DD}   ← OSが読む唯一の置き場
   ↓ agencyApi ga4Teiten（読むだけ）
定期レポート > 定点観測 > GA4（既存ビューの中身を差し替え）
```

- **BaaSファースト**: Cloud Scheduler＋Functions v2＋Firestoreのみ。新しいサーバー・鍵・手作業ゼロ。
  SAの権限も現状のまま（appspotは既にGA4閲覧者・観測ジョブが現に使っている）
- **観測ジョブ（メール）は無傷**。fail-closedの系はそのまま

## 3. スキーマ（1日=1ドキュメント）

```
ga4Daily/{date}: {
  date: "2026-08-24",
  sessions: 51,  activeUsers: 44,
  keyEvents: { click_airbnb: 9, click_booking_com: 2, click_booking_calendar: 1,
               purchase: 0, other: 0, total: 12 },
  revenue: 0,                       // purchase の eventValue
  source: "GA4 Data API（property 539535968）",
  syncedAt: <serverTimestamp>,
}
```

### SSoTの規律

| 原則 | ここでの形 |
|---|---|
| 正本は1つ | GA4の数字の正本＝**ga4Daily**（APIから直接）。シートH列/bookingDaily.cv は定点シートの鏡として残す（別系統の記録） |
| 派生値を保存しない | 手渡し率・7日合計・前週比は**表示時に計算**。保存しない |
| 突合 | ga4Daily.keyEvents.total と bookingDaily.cv を毎朝突合し、**乖離したらアラートに1行**（同じGA4を見た2系統が食い違う＝どちらかの取得が壊れた合図） |
| 欠測明記 | GA4障害で取れなかった日は `fetchFailed: true` の空ドキュメントを置く（欠測を無言にしない） |
| 血統 | source・syncedAt・propertyId を各行に |
| 原本アーカイブ | **作らない**。原本はGA4本体でAPI再取得可能（スクショやメールと違い消えない） |

## 4. 取得の作法

- 毎朝 8:05: **直近3日ぶん**を日付ディメンションで取得し冪等upsert
  （GA4の日次集計は24〜48時間ゆらぐため、前日1日だけ取ると数字が育つ前の値で固まる）
- **バックフィル**: 初回実行時、サイト開設（2026-07-12）〜前日を一括取得（date次元1クエリ・約45行）。
  予約状況と同じ「初回実行＝バックフィル」方式
- クエリは2本/日（keyEvents内訳＋sessions/users/revenue）。GA4 APIの無償枠に対して誤差レベル

## 5. 画面（既存GA4ビューの中身を差し替え）

| 日付 | セッション | CV計 | click_airbnb | booking | calendar | purchase | 手渡し率 |
|---|---:|---:|---:|---:|---:|---:|---:|

- 右パネル: 直近7日 vs 前7日（セッション・CV・手渡し率）＋ **8/16のCV定義切替線を表に明示**
  （切替前後を1本の推移として読まないための目印）
- 指標見出しクリック→推移はCVRと同じ操作系
- 施設タブは非表示のまま（サイト横断の数字）

## 6. 実装順（承認後）・工数

| 順 | 内容 | 工数 |
|---|---|---|
| 1 | ga4TeitenSync（バックフィル込み・fetchFailed対応） | 1.5h |
| 2 | agencyApi ga4Teiten ＋ 画面差し替え | 1.5h |
| 3 | 突合をアラートへ（毎朝の点検メールに1行） | 0.5h |

## 7. やらないこと

- 流入元・ページ別・国別の蓄積: 第2段。まず日次コアを3ヶ月貯めてから、見たい断面が固まった時に列を足す
  （最初から広く取ると、使わない列のメンテだけが残る）
- BigQueryエクスポート連携: 規模に対して過剰。Firestoreで数年分は余裕

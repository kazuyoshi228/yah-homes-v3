# コミュニケーション遷移図（現状）

2026-08-11 時点。実線＝動いている経路 ／ 点線＝検証済み・未実装 ／ ⚠＝設定・運用の要対応。

```mermaid
flowchart TB
    subgraph OTA経由のお客様
        GA[ゲスト（Airbnb / Booking.com）]
    end
    subgraph 直販のお客様
        GD[ゲスト（yah.homes 直販）]
    end

    subgraph Beds24
        INBOX[受信箱（メッセージ）]
        BK[予約データ]
        AA[Airstarオートアクション×2（清川）<br/>確定時 即時・前日12:00<br/>✅ Airbnb/Booking.com 指名済み<br/>＝直販には発火しない]
    end

    subgraph yah.homes システム
        SITE[予約フロー（/book）※本番未公開]
        MAIL[自動メール 4通＋キャンセル<br/>確定／前日10:00 暗証番号カード／<br/>当日7:00／レビュー依頼（mailto返信型）]
        SSOT[/admin/templates 文言SSoT・5言語/]
        SEC[/admin/secrets 暗証番号/]
    end

    subgraph Airstar 運営
        OP[スタッフ（Beds24受信箱で作業）]
        GM[airstar.sugimoto@gmail.com（転送先・指定済み）]
    end

    CONTACT[contact@mail.yah.homes]

    %% OTA経路（現行運用）
    GA -->|予約| BK
    BK --> AA
    AA -->|チャネルメッセージ（スマート送信）| GA
    GA <-->|メッセージ双方向| INBOX
    INBOX <--> OP
    AA -.->|返信先=zeal.aspiration.partner@gmail.com| GM

    %% 直販経路（実装済み・公開待ち）
    GD -->|予約| SITE
    SITE -->|referer=API で書込| BK
    SSOT --> MAIL
    SEC --> MAIL
    MAIL -->|Gmail SMTP| GD
    GD -->|メール返信| CONTACT
    CONTACT -.->|⚠ 自動転送 未設定| GM

    %% 検証済み・未実装
    CONTACT -.->|同期ジョブ（beds24CancelWatcher 稼働中）<br/>メール→guestメッセージ転記| INBOX
    INBOX -.->|同期ジョブ（未実装）<br/>host返信→メール配達| GD
    BK -.->|Webhook設定あり<br/>⚠ 受け口 /api/webhooks/beds24 未実装| SITE
```

## 読み方

- **OTAのお客様**：従来どおり。Airstarの自動送信（指名リスト化済み）とBeds24受信箱の双方向で完結。
- **直販のお客様**：うちの5言語メールで案内が完結。返信は contact@ に届くが、**転送が未設定**なのが現在の唯一の穴（⚠）。
- **点線の3本**が次の実装候補：contact@→受信箱転記／host返信→メール配達（この2本で受信箱に完全集約）、Webhook受け口（リアルタイム化の基盤）。
- 検証で確定した事実：メッセージAPIは直販予約でも双方向に使え、受信箱にAirbnbと同列表示される（2026-08-11 実測）。

# 作業指示書 — メールが迷惑メールに入る問題の根本対処（SPF / DKIM / DMARC）

- 状態: **調査完了・作業待ち（発注者の作業が必要／Claudeは実行不可）**
- 起票: 2026-08-25
- きっかけ: 植栽の通知メールが kazuyoshi.yamada / airstar.sugimoto の両方で迷惑メール判定
- 調査方法: 外部からのDNS実査（dig）。管理コンソールは見ていない

---

## 1. 結論 — SPFが致命的に間違っている

```
現在:  v=spf1 include:_spf.heteml.jp ~all
MX  :  ASPMX.L.GOOGLE.COM ほか（＝Google Workspace で受信している）
```

**SPFが許可しているのは heteml（旧レンタルサーバ）だけで、Google が入っていない。**
`ai.yamada@bonfire.co.jp` や `kazuyoshi.yamada@bonfire.co.jp` から出る
Google Workspace 経由のメールは、**受信側から見ると「送信を許可されていないサーバから来た」**
状態になる。これが迷惑メール判定の最大の原因。

さらに:

| 項目 | 状態 | 影響 |
|---|---|---|
| SPF | **誤り**（Googleが無い） | 認証失敗。最優先で修正 |
| DKIM | **未公開**（`google._domainkey` が引けない） | 署名なし。Gmail宛の信頼度が大きく落ちる |
| DMARC | **未設定**（`_dmarc` レコードなし） | 方針表明なし。近年のGmail/Yahooの要件を満たさない |

「DKIMをやったような気がする」件は、**管理コンソールで生成しただけでDNSに貼っていない**
可能性が高い（Google側で「認証を開始」を押しても、TXTレコードを公開しないと有効にならない）。

---

## 2. 直す場所

**ムームードメイン**（ネームサーバ: dns01/dns02.muumuu-domain.com）のDNS設定画面。
ムームーDNSの「カスタム設定」でTXTレコードを追加・変更する。

---

## 3. やること（3つ・上から順に）

### ① SPFの修正（最優先・5分・効果大）

既存のTXTレコードを**書き換える**（新規追加ではない。SPFは1ドメインに1本まで）:

```
種別: TXT   ホスト名: （空欄＝bonfire.co.jp 自身）
内容: v=spf1 include:_spf.google.com include:_spf.heteml.jp ~all
```

- heteml を残すのは、旧サーバからの送信（サイトの問い合わせフォーム等）がまだ生きている場合の保険。
  完全に使っていないと確認できたら `include:_spf.heteml.jp` を外してよい
- `~all`（ソフトフェイル）のままでよい。いきなり `-all` にすると取りこぼしが出る

### ② DKIMの有効化（10分・効果大）

1. Google管理コンソール → アプリ → Google Workspace → **Gmail** → **メールの認証（DKIM）**
2. ドメイン `bonfire.co.jp` を選び「**新しいレコードを生成**」（鍵の長さ 2048ビット）
3. 表示された **ホスト名（例: `google._domainkey`）** と **TXT値**（`v=DKIM1; k=rsa; p=…`）を
   ムームーDNSにTXTレコードとして追加
4. DNSが反映されたら（数分〜1時間）、管理コンソールに戻って「**認証を開始**」を押す

※ここまでやらないとDKIMは効かない。「生成しただけ」で止まっているのが今の状態と推測される。

### ③ DMARCの追加（5分・①②の後で）

①②が反映されてから追加する（先に入れると正規のメールが弾かれうる）:

```
種別: TXT   ホスト名: _dmarc
内容: v=DMARC1; p=none; rua=mailto:kazuyoshi.yamada@bonfire.co.jp; adkim=r; aspf=r
```

- `p=none` は「監視だけ・何も拒否しない」の安全な始め方。レポートが届くようになる
- 1〜2ヶ月レポートを見て問題がなければ `p=quarantine` に上げる

---

## 4. 確認のしかた（作業後）

DNSの反映後、以下で確認できる（Claudeが実行可）:

```
dig +short TXT bonfire.co.jp              → Googleが入っているか
dig +short TXT google._domainkey.bonfire.co.jp  → DKIM鍵が引けるか
dig +short TXT _dmarc.bonfire.co.jp       → DMARCがあるか
```

実際のメールでの最終確認: Gmailで受信 → メニュー「メッセージのソースを表示」→
**SPF: PASS / DKIM: PASS / DMARC: PASS** の3つが揃えば完了。

---

## 5. 応急処置（DNS作業までの間）

- 受信側で `ai.yamada@bonfire.co.jp` を連絡先に追加＋「迷惑メールではない」を1回押す
  （kazuyoshi.yamada 側は 2026-08-25 対応済み。杉本様にも依頼する）
- これは**その受信者にしか効かない**。新しい宛先が増えるたび同じ問題が起きるため、
  ①②は早めに実施する

---

## 6. なぜ急ぐか

植栽の通知だけの話ではない。**yah.OSの自動化はメールが届く前提で組まれている**:

- 毎朝の点検メール（期日超過・自動処理の停止）
- 業者への作業依頼（dispatcher）
- 見積の催促・完了報告の通知

SPFが誤ったままだと、これらが**静かに迷惑メールへ落ち続ける**。
「警報が鳴らない＝正常」と誤解する状態が最も危険で、それを避けるために作った仕組みが
配送の問題で無効化されてしまう。

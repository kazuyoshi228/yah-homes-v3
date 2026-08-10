# 定型メール文面 改訂案

作成 2026-08-10 ／ 状態：**承認待ち**
現行文面は `/admin/templates`（Firestore `mail_templates`）に投入済み。本書はその**改訂案**。
承認後、管理画面に反映する。

---

## 1. 現行文面で直したい5点

### ① 高砂のチェックイン案内が清川のまま → **解消（2026-08-10）**

マニュアルURL・Google マップに清川のものが入っていた。運営会社より正しい値の提供を受け、反映済み。

| 項目 | 清川 | 高砂 |
|---|---|---|
| マニュアル | `sites.google.com/view/kiyokawa-yah/` | `sites.google.com/view/yahhomestakasago/` |
| 地図 | `maps.app.goo.gl/DP6xuPWf132uRrv76` | `maps.app.goo.gl/bf8zLf6qKxhSyAyA8` |
| 電話 | 050-1721-4419 | 同左 |
| キーボックス | `2345` | **`2345`（同一・§5④参照）** |

**キーボックス番号が両棟で同一であることは、写し間違いではなく現状の運用と確認された。**

### ② ★5を名指しで依頼している（**プラットフォーム規約のリスク**）

現行：

> ご滞在にご満足いただけましたら、「★5」のレビューをご投稿いただけますと幸いです。
> もし気になる点や改善してほしい点などございましたら、レビューをご投稿いただく前に、ぜひメッセージにてお知らせください。

Airbnb・Booking.com はいずれも、**特定の評価を名指しで求めること**と、**低評価になりそうな人だけ先に個別対応へ誘導すること**（review gating）を禁止している。掲載順位の低下やアカウント警告の対象になり得る。

星の数に触れず、全員に等しくレビューを依頼する形へ変える。改善要望の受付は「レビューの前に」ではなく「レビューとは別に、いつでも」と位置づける。

### ③ 直販ゲスト向けの版がない

「予約サイト：」欄があり、レビュー依頼もAirbnb前提。**公式サイトから予約したお客様はAirbnbにレビューを書けない。** 直販用の分岐が要る。

### ④ 読み手が「今なにをすべきか」を掴みにくい

予約確定メッセージは、感謝 → 無人チェックインの説明 → 名簿 → 時間 → 予約内容 → 注意事項6件、と続く。**最も重要な「2日前までに名簿を登録しないと鍵の受け取り方法が届かない」**が本文の中ほどに埋もれている。

冒頭に「やること」を1つだけ置く。

### ⑤ 罰則と歓迎が同じ段落にある

「喫煙が発覚した場合は５万円を別途請求」は必要な記載だが、注意事項6件が横並びで、どれが金銭的な話でどれがお願いなのか区別がない。**「必ずお守りいただくこと」と「快適にお過ごしいただくために」を分ける。**

---

## 2. 表記の統一

| 項目 | 統一後 |
|---|---|
| チェックイン | `{{checkinTime}}以降`（物件ファクトの値・現在16:00） |
| チェックアウト | `{{checkoutTime}}まで`（同・現在10:00） |
| 名簿の期限 | **チェックイン2日前まで** |
| 名簿の対象 | **全員分**（運営会社判断で清川に統一・2026-08-10） |
| 署名（OTA経由） | `yah.homes（運営：AIRSTAR）` |
| 署名（直販） | `yah.homes ／ ボンファイア株式会社` |
| 署名（英語・OTA） | `yah.homes (operated by AIRSTAR)` |

---

## 3. 改訂案

差し込み記号は `{{ }}`。値は予約データと物件ファクトから入る。

---

### 3-1. 予約確定メッセージ（清川／高砂 共通・施設名のみ差し替え）

**件名**：`【{{propertyName}}】ご予約ありがとうございます／宿泊者名簿のご登録をお願いします`

```
{{guestName}} 様

この度は {{propertyName}} をご予約いただき、ありがとうございます。

━━━━━━━━━━━━━━━━━━━━
■ {{registerDeadline}} までにお願いしたいこと
　宿泊者名簿のご登録（ご宿泊者 全員分）

　{{registerUrl}}

　ご登録の確認後、チェックイン日までに
　鍵の受け取り方法をお送りします。
　ご登録がない場合、入室方法をお送りできません。
━━━━━━━━━━━━━━━━━━━━
※日本国内に住所のない外国籍のお客様は、旅館業法に基づき
　ご宿泊者全員分のパスポートの画像が必要です。

── ご予約内容 ──────────────
予約者名　　　　{{guestName}}
施設名　　　　　{{propertyName}}
ご予約経路　　　{{channel}}
宿泊人数　　　　{{guests}}名
チェックイン　　{{checkinDateJa}}　{{checkinTime}}以降
チェックアウト　{{checkoutDateJa}}　{{checkoutTime}}まで
宿泊日数　　　　{{nights}}泊
────────────────────────

■ 必ずお守りいただくこと
・全室禁煙です。喫煙が確認された場合、清掃費として50,000円を申し受けます。
・ご申告の人数でご利用ください。無断でのご宿泊は追加料金の対象となります。
　人数が変わる場合は、事前に必ずご連絡ください。
・夜9時以降はお静かにお願いします。周辺は住宅街です。

■ 快適にお過ごしいただくために
・駐車場は1台分です。2台目以降は周辺のコインパーキングをご利用ください。
・タオルは1泊分のご用意です。連泊の場合はご相談ください。
・ゴミは屋外・ベランダに出さないでください。カラスが荒らします。

■ ご到着について
フロントのない無人チェックインの施設です。到着時刻の制限はありません。
深夜のご到着でも問題ありません。

お荷物のお預かり、アーリーチェックイン、レイトチェックアウトは
原則承っておりませんが、ご希望の場合は前日までにご相談ください。

ご不明な点は、このメッセージにそのままご返信ください。

福岡でのご滞在が、良い時間になりますように。

yah.homes（運営：AIRSTAR）
```

**変更点** — 冒頭に「やること1つ」を枠で括った。パスポートの注記を両棟に入れた（清川に無かった）。注意事項を「必ずお守りいただくこと（金銭・法令）」と「快適に過ごすために（お願い）」に分けた。

---

### 3-2. チェックイン案内（清川／高砂 共通・値のみ差し替え）

**件名**：`【{{propertyName}}】入室方法のご案内（{{checkinDateJa}}）`

```
{{guestName}} 様

{{checkinDateJa}} からのご滞在、お待ちしております。
入室方法をお送りします。

━━━━━━━━━━━━━━━━━━━━
■ キーボックス暗証番号
　{{keyboxCode}}

■ 入室手順・アクセス
　{{manualUrl}}

■ 地図
　{{mapUrl}}
━━━━━━━━━━━━━━━━━━━━

チェックイン　{{checkinTime}}以降（時間の制限はありません）
チェックアウト　{{checkoutTime}}まで

到着が遅くなっても大丈夫です。ご連絡は不要です。

■ 滞在中について
・タオルはお1人様につきバスタオル1枚・フェイスタオル1枚です。
・滞在中の清掃は入りません。
・ゴミは屋外に出さないでください。虫が発生します。
・駐車場は1台分です。2台目以降は周辺のコインパーキングをご利用ください。

■ 困ったときは
このメッセージにご返信いただくか、お電話ください。
{{phone}}

それでは、ごゆっくりお過ごしください。

yah.homes（運営：AIRSTAR）
```

**変更点** — 暗証番号・マニュアル・地図を冒頭の枠にまとめた（現行は文章の中に散っている）。「再確認のため改めて案内する場合があります」は削除（不要な不安を生む）。連絡先を独立させた。

---

### 3-3. チェックアウト当日の案内（両物件）

**件名**：`【{{propertyName}}】本日 {{checkoutTime}} チェックアウトです`

```
{{guestName}} 様

ご滞在ありがとうございました。
本日 {{checkoutTime}} がチェックアウトのお時間です。

■ お帰りの前に
・鍵はキーボックスへお戻しください。
・駐車場も {{checkoutTime}} までにお願いします。
・お忘れ物、大型のゴミ（スーツケース・衣類など）の置き忘れにご注意ください。

特別な清掃や片付けは不要です。そのままお発ちください。

━━━━━━━━━━━━━━━━━━━━
■ ご感想をお聞かせください

ご滞在の感想をレビューとしてご投稿いただけると、
これから福岡を訪れる方の助けになります。

　{{reviewUrl}}

お気づきの点、直したほうが良い点があれば、
このメッセージにご返信ください。実際に直します。
大通りに面した窓のロールスクリーンを遮光タイプに変えたのも、
お客様のご指摘がきっかけでした。
━━━━━━━━━━━━━━━━━━━━

またお会いできる日を楽しみにしています。

yah.homes（運営：AIRSTAR）
```

**変更点** — **★5の名指しを削除**。「レビューの前に不満を教えてください」という誘導も削除（review gating に当たる）。改善要望はレビューと切り離し、「実際に直す」ことの証拠（遮光ロールスクリーン）を1つだけ添えた。

---

### 3-4. 予約確定メッセージ（**公式サイト予約 専用**・新規）

直販は決済が完了しており、キャンセル規定も自社のものが適用される。既存の確定メールと重複しないよう、**名簿の依頼に絞る**。

**件名**：`【yah.homes】宿泊者名簿のご登録をお願いします（{{checkinDateJa}}）`

```
{{guestName}} 様

{{checkinDateJa}} からのご予約、ありがとうございます。
ご予約の確定メールとは別に、1点だけお願いがあります。

━━━━━━━━━━━━━━━━━━━━
■ {{registerDeadline}} までに
　宿泊者名簿のご登録（ご宿泊者 全員分）

　{{registerUrl}}
━━━━━━━━━━━━━━━━━━━━

旅館業法により、宿泊されるすべての方の情報をいただくことが
義務づけられています。日本国内に住所のない外国籍のお客様は、
あわせてパスポートの画像が必要です。

ご登録の確認後、チェックイン日までに入室方法をお送りします。

ご予約の内容確認・変更は My Page からいただけます。
{{myPageUrl}}

ご不明な点は、このメールにご返信ください。

yah.homes
```

**変更点** — 直販の確定メール（自動送信・HTML）と役割を分けた。こちらは**名簿の1点のみ**。予約内容の再掲はしない。

---

### 3-5. 英語版（インバウンド向け・上記と同一構成）

**予約確定**
件名：`[{{propertyName}}] Booking confirmed — please register your guests`

```
Dear {{guestName}},

Thank you for booking {{propertyName}}.

────────────────────────
ONE THING TO DO BY {{registerDeadline}}
Register every guest staying with you

  {{registerUrl}}

We send the key box code once this is done.
Without it we cannot send you entry instructions.
────────────────────────
Guests without an address in Japan must also upload a passport
photo for every person, as required by Japanese law.

── Your booking ──────────
Name           {{guestName}}
House          {{propertyName}}
Booked via     {{channel}}
Guests         {{guests}}
Check-in       {{checkinDateJa}}  from {{checkinTime}}
Check-out      {{checkoutDateJa}}  until {{checkoutTime}}
Nights         {{nights}}
──────────────────────────

HOUSE RULES — please observe
・No smoking anywhere. A JPY 50,000 cleaning fee applies if we find evidence.
・Please stay with the number of guests you booked. Undeclared guests are charged.
  Tell us in advance if the number changes.
・Quiet after 9pm. This is a residential neighbourhood.

TO MAKE YOUR STAY EASIER
・One parking space. Coin parking nearby for a second car.
・Towels are provided for one night. Ask us if you stay longer.
・Do not leave rubbish outside or on the balcony — crows get into it.

ARRIVAL
Self check-in, no front desk, no time limit. Late-night arrival is fine.

We cannot normally store luggage or offer early check-in / late check-out,
but ask us the day before and we will see what we can do.

Just reply to this message with any questions.

We hope Fukuoka treats you well.

yah.homes (operated by AIRSTAR)
```

**チェックイン案内**
件名：`[{{propertyName}}] How to get in ({{checkinDateJa}})`

```
Dear {{guestName}},

Here is how to get in.

────────────────────────
KEY BOX CODE
  {{keyboxCode}}

ENTRY INSTRUCTIONS
  {{manualUrl}}

MAP
  {{mapUrl}}
────────────────────────

Check-in    from {{checkinTime}} (no time limit)
Check-out   until {{checkoutTime}}

Arriving late is fine. You do not need to tell us.

DURING YOUR STAY
・One bath towel and one face towel per person.
・No housekeeping during the stay.
・Please keep rubbish inside — insects otherwise.
・One parking space; coin parking nearby for a second car.

IF SOMETHING GOES WRONG
Reply to this message, or call {{phone}}.

Enjoy your stay.

yah.homes (operated by AIRSTAR)
```

**チェックアウト当日**
件名：`[{{propertyName}}] Check-out is today at {{checkoutTime}}`

```
Dear {{guestName}},

Thank you for staying with us. Check-out is today at {{checkoutTime}}.

BEFORE YOU GO
・Return the key to the key box.
・Vacate the parking space by {{checkoutTime}}.
・Check for belongings and large items (suitcases, clothing).

No cleaning or tidying needed. Just leave.

────────────────────────
TELL US HOW IT WENT

A review helps the next traveller decide.

  {{reviewUrl}}

If anything should be fixed, reply to this message.
We do act on it — the blackout blind on the street-facing window
exists because a guest told us the light was too bright.
────────────────────────

We hope to see you again.

yah.homes (operated by AIRSTAR)
```

---

## 4. 追加した差し込み記号

| 記号 | 内容 | 供給元 |
|---|---|---|
| `{{propertyName}}` | 施設名（清川yah. / yah homes.takasago） | 物件ファクト |
| `{{registerDeadline}}` | 名簿の期限（チェックイン2日前の日付） | 予約データから算出 |
| `{{reviewUrl}}` | レビュー投稿先 | **要決定**（§5） |
| `{{myPageUrl}}` | My Page（直販のみ） | 固定 |

---

## 5. 決めていただきたいこと

1. ~~高砂の正しい値~~ — **提供済（2026-08-10）**。マニュアル `sites.google.com/view/yahhomestakasago/`、地図 `maps.app.goo.gl/bf8zLf6qKxhSyAyA8`
2. ~~名簿の対象~~ — **決定済（2026-08-10）**。清川の「全員分」に統一
3. **レビューの投稿先** — 直販ゲストはAirbnbに投稿できない。Google ビジネスプロフィールを用意するか、投稿依頼をしないか
4. **キーボックス番号** — 両棟とも `2345` で共通・変更履歴なしと確認された（写し間違いではない）。
   Airbnbのレビュー数から推定して、**過去に80組以上が現在も有効な鍵を持っている**状態。保管場所より先に運用を決める必要がある。
   - 今すぐ：`property_secrets`（オーナー限定）へ移し、テンプレートから平文を消す。
     **`property_facts` には入れないこと**（ビルド時読み取りのため公開読み取りを許可しており、誰でも中身を見られる）
   - 数週間以内：月次で番号を変更する運用にする。SSoT化済みなので1箇所直せば以降の送信文に反映される
   - 本筋：Beds24 Marketplace の RemoteLock 連携で、予約ごとに固有コードを発行し滞在期間だけ有効にする。問題そのものが消える
   - あわせて確認：入室マニュアル（Google Sites）は既定で公開・検索対象。**そのページに暗証番号が載っていないか**
5. ~~署名~~ — **決定済（2026-08-10）**。OTA経由は `yah.homes (operated by AIRSTAR)`、直販は `yah.homes ／ ボンファイア株式会社`。
   お客様が予約したのは「yah.homes」であり、署名が「AIRSTAR」だけでは誰からの連絡か伝わらないため、
   ブランド名を前に出したうえで運営者を開示する。直販は販売事業者が当社のため特商法の記載と揃える。

---

## 6. 反映の手順

承認後、`/admin/templates` の本文を差し替える。現行文面はFirestoreに残っているため、問題があれば戻せる。
自動送信への接続は、文面が固まってから別途行う。

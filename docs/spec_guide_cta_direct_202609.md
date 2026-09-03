# 仕様書: 記事の予約導線を直販へ向ける ＋ 直販CTAのクリックを計測する

**作成**: 2026-09-03
**状態**: 承認待ち（未実装）
**対象**: `src/layouts/BaseLayout.astro`（計測）／`src/pages/[...locale]/guides/[slug].astro`（CTA 1行）
**関連**: `docs/GUARD_tracking_baselayout.md`（計測ブロックの保護）

---

## 1. 背景 — 記事は読まれているが、1件も予約に繋がっていない

### 実測（2026-08-04〜09-02・30日間）

チャネル別のファネル:

| | セッション | 空室照会 | 手渡し | 手渡し率 |
|---|---|---|---|---|
| 広告 | 905 | 576 (64%) | 167 | **18.5%** |
| **自然検索** | **306** | **41 (13%)** | **19** | **6.2%** |
| 直接 | 309 | 59 (19%) | 13 | 4.2% |

自然検索の手渡し19回を**発生位置**で分けると:

```
hero（トップページ）    7回
property_card          4回
property_detail        4回
nav                    2回
article_footer         1回   ← 記事から出たのはこれだけ
property_card_rating   1回
```

**記事ページ発の手渡しは30日間で1回。** 自然検索の着地は記事に集中している（英語 where-to-stay 41／繁体字 whole-house 22／韓国語 where-to-stay 16 セッション）にもかかわらず。

### 原因は2つ

**(a) いちばん目立つCTAがAirbnbに向いている**

`InlineBookingCta` は `labels` を渡すと直販、渡さないと Airbnb に遷移する作り。記事では:

| 位置 | `labels` | 行き先 | 見た目 |
|---|---|---|---|
| 冒頭（要約直下・`after_summary`） | あり | 直販 | 小さいピル2つ |
| **末尾（`article_footer`）** | **なし** | **Airbnb** | h2見出し＋★評価つきの大きなセクション |

末尾は 2026-07-25 の一括変更（全記事を Airbnb 直行に統一）のままで、**直販サイト公開後に更新されていない**。

**(b) 直販CTAのクリックが計測されていない**

`BaseLayout.astro` のクリック委譲は `airbnb` / `booking.com` / `#booking` / `instagram` / `prtimes` のみを拾う。`/book` への遷移は**イベントを送っていない**ため、記事→直販の導線が機能しているか判定できない。

---

## 2. 変更内容

### 2-1. 直販CTAのクリックを計測する（`BaseLayout.astro`）

既存のクリック委譲チェーンに分岐を1つ足す。**位置は `booking.com` の分岐より後**（`booking.com` を先に捕まえるため）。

```js
} else if (/^\/(?:[a-z]{2}\/)?book(?:\?|#|\/?$)/.test(href)) {
  gtag("event", "click_book_direct", { property: property, page_path: path, cta_location: ctaLocation });
  // 直販の見込み客は Lead。OTAへの流出は OutboundBookingClick で別管理しているので混ざらない。
  window.fbq && fbq("track", "Lead", { property_id: property, cta_location: ctaLocation });
}
```

**正規表現の意図**: `/book` `/ja/book` `/zh/book?prop=…` は拾い、**`/book/checkout` は拾わない**（予約フロー内の遷移でありCTAではない）。`/guides/how-to-book` のような記事スラッグも拾わない。

### 2-2. 記事末尾のCTAを直販に向ける（`[slug].astro` L313）

```astro
<InlineBookingCta lang={lang} ctaLocation="article_footer" showRating onLight align="center"
                  labels={MIDCTA_LABELS[lang]} />
```

`labels` を渡すだけ。文言は既存の `guideMidctaLabels`（5言語とも用意済み）:

```
ja「清川を予約する →」 en「Book Kiyokawa →」 zh「預訂清川 →」
ko「기요카와 예약하기 →」 th「จอง Kiyokawa →」
```

**【2026-09-03 訂正】記事末尾からAirbnbリンクは無くなる。**

当初この欄に「Airbnbはレビューの確認先として別行に残る」と書いたが、**誤りだった**。
`InlineBookingCta` は排他分岐で、直販モードでは直販ボタン2つだけを出す:

```astro
{isBookCta ? ( 直販ボタン×2 ) : ( Airbnbリンク×2 )}
{showRating && <p class="ibc-rating">{ratingLabel}</p>}
```

`showRating` が出すのは**評価の文字列のみ**（リンクではない）。したがって変更後、記事ページの
Airbnbリンクは **0本**になる。

- HEROからAirbnbボタンを外した方針（2026-09-02）と方向は一致している
- 物件ページにはAirbnbリンクが残るため、サイト全体で導線は失われない
- **残る論点**: 記事に「★4.77 Kiyokawa (48)」と出典リンクなしで表示される。
  出典を辿れるようにするか否かは別途判断（§6 に回す）

---

## 3. GA4側の作業

**`click_book_direct` をキーイベントにはしない。**

理由: キーイベントにすると Google Ads にインポートされ、入札が**再びクリック最適化に戻る**。いま是正しようとしている状態そのもの。直販の成果は `purchase` で測る。

`cta_location` は**登録済みのカスタムディメンション**（2026-07-19）なので、追加登録は不要。イベントパラメータ `property` も既存。

---

## 4. 検証

| # | 確認 | 期待 |
|---|---|---|
| 1 | プレビューで記事末尾を表示 | 「清川を予約する →」等の直販ボタン。下にAirbnbのレビューリンク |
| 2 | 末尾ボタンのリンク先 | `/xx/book?prop=kiyokawa` |
| 3 | 本番でクリック → GA4リアルタイム | `click_book_direct`（`cta_location: article_footer`）が届く |
| 4 | `/book/checkout` への遷移 | `click_book_direct` が**発火しない** |
| 5 | Airbnbレビューリンクをクリック | 従来どおり `click_airbnb` が届く（**壊していないこと**） |
| 6 | 1週間後 | `cta_location` 別に `click_book_direct` の分布が見える |

**判定（2週間後）**: 記事発の `click_book_direct` が月20件を超えれば導線として機能。1桁なら位置か文言の問題として ③〜⑤（本文中盤への追加・文脈別文言・パラメータ付与）に進む。

---

## 5. リスクと巻き戻し

| リスク | 対策 |
|---|---|
| `BOOK_PREVIEW=1` なしでビルドすると末尾CTAがAirbnbに戻る | **安全側のフォールバック**。`safe-deploy.sh` が `BOOK_PREVIEW=1` を強制するため通常は起きない |
| 記事からのAirbnb手渡しが減る | 30日間で1回しかないので実質ゼロ。レビューリンクとしては残る |
| 正規表現の取りこぼし／誤爆 | §4の③④で両方向を確認する |
| クリック委譲を壊すと全計測が止まる | `safe-deploy.sh` の計測アサーションと `smoke-dist.mjs` で検出 |

**巻き戻し**: 2ファイル・数行の変更。`git revert` → 再ビルド → デプロイで即座に戻せる。

---

## 6. この仕様でやらないこと

以下は**計測結果を見てから**判断する（先に入れると、どれが効いたか分からなくなる）。

- **本文中盤への導線追加** — 記事が長文化しており中盤が空白だが、まず末尾の効果を測る
- **記事の文脈に合わせたCTA文言** — 「6人で泊まれる日を見る」等
- **記事に応じたパラメータ付与** — `&guests=6` 等で着地時の手間を減らす
- **★評価の出典リンク** — **見送り（2026-09-03 発注者判断・案A採用）**。記事にAirbnbリンクは戻さない。
  HEROからAirbnbボタンを外した方針と一致させる。★評価は出典リンクなしで表示するが、
  物件ページにはAirbnbリンクが残るため辿れないわけではない。

---

## 7. 期待効果と、その限界

自然検索の手渡し率 6.2% を 12% に上げられたとして、**増えるのは月18件程度**。絶対量は小さい。

**より大きい打ち手は順位**である。英語 `where-to-stay` は表示2,531回・掲載順位7.56位・CTR0.99%。3〜4位に上げればクリックは25回→200回規模になり、この導線改善の10倍効く。

ただし**本仕様の 2-1（計測）は、その順位改善の効果を測るためにも必要**。順序として先に入れる。

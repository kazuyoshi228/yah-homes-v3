# 申し送り — os.css の `.tabs` が hidden 属性に勝つ

- 宛先: **共有部スレッド**
- 状態: **対応済み（2026-08-25 共有部）** — os.css に `.tabs[hidden]` と、display を持つ他クラス（.bigkpi/.subnav系）の対も追加。utilities.html のローカル暫定は撤去済み。CI経由で本番反映を確認
- 起票: 2026-08-25・光熱費カード担当スレッド（共有部は触っていません）

## 事象

`os.css` の `.tabs { display: flex; }` が、HTMLの `hidden` 属性（UAスタイルの `display:none`）より
詳細度で勝つため、**`el.hidden = true` にしてもタブが消えません**。

光熱費カードでビューを切り替えても種別タブ（すべて／ガス／電気…）が残り続けていました。
`.tabs` を hidden で出し分けている画面は同じ症状のはずです（定期レポート・売上の日/週/月タブなど）。

## 直し方（共有部で）

`os.css` の `.tabs` の定義の近くに1行:

```css
.tabs[hidden] { display: none; }
```

`[hidden]` 全般に効かせるなら `[hidden] { display: none !important; }` でもよいですが、
`!important` は後で困るので `.tabs[hidden]` の方を勧めます。

## 暫定対応

光熱費カード（utilities.html）はページ内の `<style>` で同じ1行を持って塞いでいます。
共有部で直ったら、こちらのローカル指定は削除して構いません。

# 提案書 — OSの各カードを別々のClaudeスレッドで並行更新できるようにする

- 状態: **S1・S2 実装済み（2026-08-25 発注者承認）**。S3（CI）・S4（api分割）は未着手
  - S1: yah-os/CLAUDE.md 新設・yah.homes-v2/CLAUDE.md に並行運用の節を追記
  - S2: yah-os/deploy.sh（--preview でプレビューチャンネル）・yah.homes-v2/deploy-functions.sh
- 起票: 2026-08-25
- きっかけ: 「各カードをそれぞれスレッドで別々にClaudeで更新していっても、保存やPUSH・デプロイに影響がないようにしたい」（発注者）

---

## 1. いま並行すると何が壊れるか（3つの競合点）

### ① デプロイが「作業ツリーの丸ごとスナップショット」である（最重要）

`firebase deploy --only hosting:yah-os` は **その瞬間のフォルダ全体**を配信する。
スレッドAがデプロイすると、**スレッドBが編集途中の properties.html も一緒に本番へ出る**。
コミットしていなくても、壊れていても、出る。これが並行作業で一番先に事故る点。

functions も同じ。`yah.homes-v2/functions` 全体がビルド・デプロイされるので、
別スレッドの書きかけ TS が混ざる（tsc が通れば本番に乗ってしまう）。

### ② push の競合

2スレッドが同じ main へ push すると後発が non-fast-forward で弾かれる。
これ自体は `git pull --rebase` で解決できる軽症だが、**放置したまま①のデプロイをすると
「pushしていない古い状態＋自分の変更」という誰のものでもない断面が本番に出る**。

### ③ 共有ファイルのホットスポット

カード＝1ファイル（properties.html / fixedcosts.html …）なので、**別カードなら衝突しない**。
今日の共通化（P5）でこの分離はむしろ強くなった。残るホットスポットは4つだけ:

| ファイル | 触る理由 | 衝突頻度 |
|---|---|---|
| `index.html` | カード追加・LINKS・並び替え | 中 |
| `os.css` / `os-core.js` / `os-embed.js` | 共通デザイン・共通処理 | 低（だが影響は全ページ） |
| `functions/.../api.ts` | エンドポイント追加が全部ここの switch に入る | **高** |
| Firestore | — | **無し**（コレクション別・updateMaskのPATCHで元から安全） |

---

## 2. 結論 — 3層で守る

**ルール（今日できる）→ 道具（今週）→ 構造（来週以降）** の順で入れる。
S1だけでも事故の9割は消える。

### S1. ルールを CLAUDE.md に書く（実装30分・効果◎）

yah-os リポジトリには **CLAUDE.md が無い**。Claudeスレッドに規律を強制する装置はこれなので、まず作る:

```
# CLAUDE.md — yah-os（要点）
1. 作業開始時に必ず git pull --rebase。終了時に必ず commit → push（溜めない）
2. デプロイは ./deploy.sh 経由のみ。firebase deploy を直接叩かない
3. 自分のカード（担当ファイル）以外を編集しない。特に
   index.html / os.css / os-core.js / os-embed.js / api.ts は
   「共有部の変更」とタスクに明記されている場合のみ触る
4. 本番確認は preview channel（deploy.sh --preview）で行い、
   本番デプロイは変更が push 済み・ツリーが clean のときだけ
```

### S2. deploy.sh — 汚れたツリーからのデプロイを物理的に不可能にする（実装1時間・効果◎）

```bash
#!/bin/bash
# yah-os デプロイ門番。並行スレッド対策（2026-08-25 提案）
set -e
git fetch origin
[ -n "$(git status --porcelain)" ] && { echo "✗ 未コミットの変更がある。commit してから"; exit 1; }
[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] && \
  { echo "✗ origin/main と一致していない。pull --rebase && push してから"; exit 1; }
if [ "$1" = "--preview" ]; then
  firebase hosting:channel:deploy "t-$(whoami)-$(date +%H%M)" --project yah-homes --expires 2d
else
  firebase deploy --only hosting:yah-os --project yah-homes
fi
```

要点は2つ:
- **clean かつ origin/main と一致**していないとデプロイできない → ①の「書きかけ混入」が構造的に消える
- `--preview` で **プレビューチャンネル**（本番と別URL・2日で自動消滅）に出せる →
  各スレッドは本番を触らずに自分のカードを確認できる。並行開発の主役はこれ

functions 側も同じ門番を `yah.homes-v2/deploy-functions.sh` として置く。

### S3. デプロイをGitHub Actionsへ移す（実装半日・効果◎・構造的解決）

main への push をトリガーに CI が hosting＋functions をデプロイする。

```
push（各スレッド） → GitHub main → Actions が tsc → deploy
```

- デプロイ元が**常に「コミット済みのmain」**になり、手元の状態は一切関係なくなる
- 複数スレッドの push は CI 側で**直列化**される（同時デプロイの競合が消える）
- 手元からのデプロイは廃止（deploy.sh は --preview 専用に降格）
- 必要なもの: リポジトリの Secrets に FIREBASE_SERVICE_ACCOUNT（Workload Identity 推奨）。
  今日の firebase / gcloud 認証切れ問題も同時に消える（CIは切れない）

### S4. api.ts の分割 — 唯一の高頻度衝突点を解体する（実装2時間・効果○）

いま全エンドポイントが api.ts の1つの switch に入っており、**2スレッドがエンドポイントを
足すと必ず同じファイルで衝突する**。カードごとのルートファイルに分ける:

```
functions/src/agency/routes/
  props.route.ts      … properties / saveProperty / saveLifespan / renewalPlan …
  finance.route.ts    … loans / fixedCosts / cvr …
  contracts.route.ts  … contracts / saveContract / contractPdf
  jobs.route.ts       … advance / propJobs / pauseAi …
api.ts … 認証と振り分けだけ（各routeをimportして合成。触るのは新route追加の1行のみ）
```

これで「カードA担当スレッド」と「カードB担当スレッド」はサーバ側でも別ファイルになる。

---

## 3. スレッド運用の型（S1〜S2導入後）

```
スレッドを立てる時:  「担当カード＝◯◯.html（＋対応route）。共有部は触らない」と最初に宣言
作業中:            編集 → ./deploy.sh --preview で確認（本番に触れない）
仕上げ:            git pull --rebase → commit → push → ./deploy.sh（本番）
共有部を変えたい時:  そのタスク専用のスレッドを1本立てる（他スレッドを止めてから）
```

| 触るもの | 並行可否 |
|---|---|
| 各カードのHTML（1カード=1ファイル） | **◎ 自由に並行** |
| 対応するroute（S4後） | **◎ 自由に並行** |
| Firestoreのデータ投入 | **◎ 元から安全**（コレクション別・PATCH） |
| index.html（LINKS・ナビ） | △ 小さい変更なら rebase で自動マージされる。連続変更は1スレッドに寄せる |
| os.css / os-core.js / os-embed.js | **✕ 専用スレッド1本のみ**（全ページに効くため） |
| firebase.json / functions の共通部 | ✕ 同上 |

---

## 4. やらないこと

- **ブランチ＋PRフロー**: 一人運用では儀式が重い。直main＋rebase＋門番スクリプトで足りる。
  外部の編集者が増えたら再検討
- **カードごとのリポジトリ分割**: 共有資産（os.css等）が壊れる。P5の共通化と矛盾する
- **Firestoreのロック機構**: 不要。書き込みは元から衝突しない構造

---

## 5. 導入順とコスト

| 段階 | 内容 | 工数 | これだけで防げる事故 |
|---|---|---|---|
| **S1** | CLAUDE.md（yah-os / yah.homes-v2 に規律を明文化） | 30分 | 規律漏れ全般 |
| **S2** | deploy.sh 門番＋preview channel | 1時間 | **書きかけ混入デプロイ（最重要）** |
| S3 | GitHub Actions デプロイ | 半日 | 同時デプロイ競合・認証切れ |
| S4 | api.ts 分割 | 2時間 | サーバ側の編集衝突 |

**推奨: S1＋S2 を先に入れて並行運用を開始し、スレッド数が増えて窮屈になったら S3・S4。**

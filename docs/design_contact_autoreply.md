# 計画書: 問い合わせフォーム自動返信メール（オートリプライ）

日付: 2026-07-13 / ステータス: 実装済み（2026-08-18 状態行を実態に同期）

## 目的

フォーム送信者に「受け付けました・2〜3営業日以内に担当から連絡します」という確認メールを英語で自動送信し、問い合わせの不安（届いたのか？）を解消する。

## 現状

`functions/src/index.ts` の `contact` 関数は、Firestore保存 → **管理者向け通知メールのみ**送信。送信者本人には何も届かない。

## 変更内容（contact関数のみ・1ファイル）

管理者通知の直後に、送信者宛の2通目を送る:

- **From**: `"yah.homes" <contact@mail.yah.homes>`（SMTP_USER）
- **To**: フォームに入力されたメールアドレス
- **Reply-To**: `contact@mail.yah.homes`（返信がそのまま問い合わせ窓口に届く）
- **件名**: `Thank you for contacting yah.homes`
- **本文**（英語・全言語共通）:

```
Dear {name},

Thank you for reaching out to yah.homes.
We have received your inquiry, and a member of our team will get back to you within 2–3 business days.

For your reference, here is a copy of your message:

---
{message}
---

If you have any urgent questions, simply reply to this email.

Warm regards,
yah.homes
Whole-house rentals in Fukuoka, Japan
https://yah.homes
Operated by Bonfire Inc.
```

## 設計判断

1. **英語のみ**（ユーザー指示）。サイトは4言語だが、自動返信は英語1本で開始。多言語化は必要になったら `lang` フィールドで分岐可能な構造にしておく。
2. **非致命設計を維持**: 自動返信の失敗は管理者通知・Firestore保存に影響させない（try/catchを分離）。
3. **バックスキャッター対策**: ハニーポット通過後のみ送信（現状の仕組みを流用）・件名にユーザー入力を含めない（差し込みは本文の名前とメッセージ引用のみ）。
4. 追加のシークレット・インフラ変更なし。既存SMTP（contact@mail.yah.homes）をそのまま使用。

## 手順

1. `functions/src/index.ts` に自動返信ブロックを追加
2. `firebase deploy --only functions:contact`
3. テスト送信 → 送信者側メール受信・管理者通知・Firestore保存の3点確認

## 影響範囲

フロントエンド変更なし。SEO/GEO影響なし。

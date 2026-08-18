// 言語設定 — en(ルート) / ja / ko / zh / th。旧サイトのURL構造を踏襲し、
// en は接頭辞なし（`/`）、ja/ko/zh/th は接頭辞あり（`/ja/` `/ko/` `/zh/` `/th/`）。

import type { Lang } from "./translations";

export const LOCALES = ["en", "ja", "ko", "zh", "th"] as const;
export type Locale = Lang; // = "en" | "ja" | "ko" | "zh" | "th"
export const DEFAULT_LOCALE: Locale = "en";

// hreflang 属性値。zh は繁体字なので zh-TW。x-default は en を指す。
export const HREFLANG: Record<Locale, string> = {
  en: "en",
  ja: "ja",
  ko: "ko",
  zh: "zh-TW",
  th: "th",
};

// ロケール → URL接頭辞（en は空文字＝ルート）
export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

// getStaticPaths の [...locale] param 値。en は undefined（＝ルート）、他はロケール文字列。
export function localeParam(locale: Locale): string | undefined {
  return locale === DEFAULT_LOCALE ? undefined : locale;
}

// ページの論理パス（"/" or "/about" 等）を、指定ロケールの実パスに変換。
// 末尾スラッシュを常に付与し、canonical と sitemap（Astroのdirectory出力=末尾/）を一致させる。
// 例: ("ko", "/about") -> "/ko/about/" ／ ("en", "/") -> "/" ／ ("ko", "/") -> "/ko/"
export function localizedPath(locale: Locale, path: string): string {
  const prefix = localePrefix(locale); // "" or "/ko"
  const body = path === "/" ? "" : path;
  let full = `${prefix}${body}`;
  if (!full.endsWith("/")) full += "/";
  return full === "" ? "/" : full;
}

/** 言語の表示ラベル（管理画面・言語ピッカー共通。4ファイルに散っていた辞書を集約） */
export const LANG_LABELS: Record<Locale, string> = {
  ja: "日本語", en: "English", ko: "한국어", zh: "繁體中文", th: "ไทย",
};
export const LANGS_WITH_LABEL = (Object.entries(LANG_LABELS) as [Locale, string][])
  .map(([code, label]) => ({ code, label }));

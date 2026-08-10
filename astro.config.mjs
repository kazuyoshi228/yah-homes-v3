// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// 本番ドメイン。canonical / sitemap / hreflang の絶対URL生成に使う。
const SITE = "https://yah.homes";

// 言語は en(ルート) / ko / zh / th。en は接頭辞なし（旧URL構造を踏襲）。
export default defineConfig({
  site: SITE,
  // 末尾スラッシュを常に付与。directory出力（/ko/index.html→/ko/）と
  // canonical/hreflang/sitemap をすべて末尾スラッシュで統一する。
  trailingSlash: "always",
  // inlineStylesheets: CSSをHTMLに埋め込み、レンダリングブロックの往復を排除（PSI: FCP改善）
  build: { format: "directory", inlineStylesheets: "always" },
  // ルーティングは案A（src/pages/[...locale]/ の動的ルート＋getStaticPaths）で
  // 翻訳データ駆動で全言語を静的生成する。Astro組み込みi18nの物理フォルダ方式は使わない。
  integrations: [
    react(),
    sitemap({
      // 管理画面（/admin/*）・thankyou・入室案内（/how-to/* = 宿泊者専用）はインデックス対象外。
      filter: (page) =>
        !page.includes("/admin") && !page.includes("/thankyou") &&
        !page.includes("/partners") && !page.includes("/how-to"),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});

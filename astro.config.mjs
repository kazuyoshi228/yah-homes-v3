// @ts-check
import { defineConfig } from "astro/config";
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
    sitemap({
      // noindex のページは sitemap にも載せない。載せると Google に「登録して」と言いながら
      // ページ側で「登録するな」と言う矛盾になり、GSCの「登録されていないページ」を無意味に
      // 膨らませて、本当に直すべき問題がその中に埋もれる（2026-09-03 実測: 21件が該当）。
      //
      //   admin      管理画面
      //   thankyou   薄いページ
      //   partners   サイト内リンクなしの限定公開
      //   how-to     入室案内（宿泊者専用）
      //   inquiry    問い合わせ状況
      //   book       予約エンジン（/book・/book/checkout・/book/complete）※2026-09-03 追加
      //   account    マイページ ※2026-09-03 追加
      //   operators  運営メニュー ※2026-09-03 追加
      //
      // パス先頭で判定する（page.includes だと /guides/how-to-book のような
      // 記事スラッグまで巻き込むため）。言語接頭辞 /ja/ /zh/ 等を許容する。
      filter: (page) =>
        !/^\/(?:[a-z]{2}\/)?(?:admin|thankyou|partners|how-to|inquiry|book|account|operators)(?:\/|$)/
          .test(new URL(page).pathname),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});

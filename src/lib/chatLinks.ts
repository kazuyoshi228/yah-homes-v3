/* チャット導線URLとQR画像パスの単一ソース（src側）。
   実体の生成は scripts/gen-qr.mjs、メール側は functions/src/mail-template.ts の
   chatUrlFor（別デプロイ単位のため各1定義・値の一致は check-consistency が守る）。 */
export const CHAT_BASE = "https://chat.yah.homes";
export const chatUrlFor = (prop: string) => `${CHAT_BASE}/${prop}`;
export const qrPaths = (prop: string) => ({
  screen: `/qr/chat-${prop}.png`,
  print: `/qr/print/chat-${prop}-print.png`,
  cardSvg: `/qr/print/chat-${prop}-card-a6.svg`,
  cardPng: `/qr/print/chat-${prop}-card-a6.png`,
});

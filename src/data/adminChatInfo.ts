/* 管理画面の施設一覧（/admin/properties 系のページ構成）。
   チャット用情報の「内容」はここには置かない — 正本は Firestore
   property_facts/{prop}.chatInfo（/admin/properties/{prop}/#chat で Owner が編集）。
   2026-08-18 に静的定義から移行した（静的だと更新のたびにデプロイが必要で、
   その待ち時間に編集内容が失われる事故が起きやすいため）。 */

export const CHAT_PROPS = [
  { key: "kiyokawa", label: "清川" },
  { key: "takasago", label: "高砂" },
  { key: "ropponmatsu", label: "六本松" },
  { key: "otemonA", label: "大手門A" },
  { key: "otemonB", label: "大手門B" },
] as const;
export type ChatPropKey = (typeof CHAT_PROPS)[number]["key"];

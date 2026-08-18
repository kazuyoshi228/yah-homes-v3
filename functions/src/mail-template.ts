/**
 * メール送信の共通テンプレート（index.ts / beds24.ts で共用）
 * 全ての送信メールを同じ枠に載せる。table＋インラインCSSのみ（外部CSS/JS/画像なし）。
 * variant: "brand"=通常（黒ヘッダー） / "alert"=要対応（赤い帯を足す）
 */
export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export const SITE_URL = "https://yah.homes";
export const BRAND_FOOTER = "yah.homes【Operated by AIRSTAR】";
/** 言語別の My Page / 予約ページURL（en はパス無し）。組み立て式の重複を禁止 */
export const myPageUrl = (lang: string) => `${SITE_URL}/${lang === "en" ? "" : `${lang}/`}account/`;
export const bookPageUrl = (lang: string) => `${SITE_URL}/${lang === "en" ? "" : `${lang}/`}book/`;
export const ADMIN_BOOKINGS_URL = `${SITE_URL}/admin/bookings/`;

/* ─── メールの共通テンプレート ───
   全ての送信メールを同じ枠に載せる。table＋インラインCSSのみ（外部CSS/JS/画像なし）。
   variant: "brand"=通常（黒ヘッダー） / "alert"=要対応（赤い帯を足す） */
const CHAT_LABELS: Record<string, { t: string; s: string }> = {
  ja: { t: "困ったときはチャットで", s: "ボタンで開くか、QRコードをスキャンしてください（同行者の方もどうぞ）" },
  en: { t: "Need help? Chat with us", s: "Tap the button or scan the QR code — companions welcome too" },
  ko: { t: "도움이 필요하시면 채팅으로", s: "버튼을 누르거나 QR코드를 스캔하세요(동행자분도 이용 가능)" },
  zh: { t: "需要協助？線上聊天", s: "點按按鈕或掃描QR碼（同行者也可使用）" },
  th: { t: "ต้องการความช่วยเหลือ? แชทกับเรา", s: "กดปุ่มหรือสแกน QR โค้ด (ผู้ร่วมเดินทางใช้ได้เช่นกัน)" },
};
/** 施設別チャットURL。チャット未対応の棟は空（差し込み記号 {{chatUrl}} と chatBlock で共用） */
export function chatUrlFor(propRaw: string): string {
  const prop = propRaw === "test" ? "kiyokawa" : propRaw;
  return prop === "kiyokawa" || prop === "takasago" ? `https://chat.yah.homes/${prop}` : "";
}
export function chatBlock(chat?: { prop: string; lang: string }): string {
  if (!chat) return "";
  const url = chatUrlFor(chat.prop);
  if (!url) return "";
  const prop = chat.prop === "test" ? "kiyokawa" : chat.prop;
  const L = CHAT_LABELS[chat.lang] ?? CHAT_LABELS.en;
  return `<tr><td style="padding:18px 24px;border-top:1px solid #f0f0f0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;">
        <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111111;">${esc(L.t)}</p>
        <p style="margin:0 0 10px;font-size:12px;color:#666666;line-height:1.7;">${esc(L.s)}</p>
        <a href="${url}" style="display:inline-block;padding:10px 20px;background:#1a56db;border-radius:999px;font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;">Chat</a>
      </td>
      <td width="112" style="vertical-align:middle;text-align:right;">
        <img src="${SITE_URL}/qr/chat-${prop}.png" width="96" height="96" alt="QR" style="border:1px solid #e8e8e8;border-radius:6px;" />
      </td>
    </tr></table>
  </td></tr>`;
}

export function mailHtml(o: {
  heading: string;
  badge?: string;
  lead?: string;
  rows?: Array<[string, string]>;
  /** 一目で読ませる主要数値。2〜3個までにする（4個以上は横に潰れて逆に読めない）。
      tone: good=緑 / warn=橙 / bad=赤 / 既定=黒。判定の色分けに使う。 */
  stats?: Array<{ label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }>;
  blocks?: Array<{ title: string; body: string }>;
  cta?: { label: string; href: string };
  /** 黒地に大きく出す暗証番号（前日のチェックイン案内用） */
  codeCard?: { label: string; code: string };
  note?: string;
  /** フッター（署名）。お客様向けの6通は /admin/templates の footer キーから渡す。
      未指定時の既定は社内向け通知など、テンプレート管理の対象外のメール用 */
  footer?: string;
  /** チャット導線（施設別・2026-08-18）。指定するとフッター直前にQR付きブロックを出す。
      QRを載せる理由: 予約者はグループの幹事1人で、同行者はメールを受け取れない。
      幹事の画面から同行者がスキャンすることで、チャット導線がグループ全員に行き渡る。 */
  chat?: { prop: string; lang: string };
  variant?: "brand" | "alert";
}): string {
  const alert = o.variant === "alert";
  const row = ([k, v]: [string, string]) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888888;vertical-align:top;white-space:nowrap;">${esc(k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#111111;text-align:right;font-weight:500;word-break:break-word;">${v}</td></tr>`;
  /* 主要数値のタイル。横並びは幅が足りず数字が潰れるため、1件=1行の縦積みにする（2026-08-16 発注者指示）。
     左に見出し＋補足、右に大きな数値。Outlook/Gmail 双方で崩れないよう table で組む（flex/grid は使えない） */
  const TONE = { good: "#1a7f37", warn: "#b26a00", bad: "#c0392b" } as const;
  const statsHtml = (st: NonNullable<typeof o.stats>) =>
    st
      .map(
        (s) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:8px;margin:0 0 8px;">
      <tr>
        <td style="padding:14px 18px;vertical-align:middle;">
          <div style="font-size:12px;color:#666666;font-weight:600;letter-spacing:.04em;">${esc(s.label)}</div>
          ${s.sub ? `<div style="font-size:11px;color:#999999;margin-top:3px;line-height:1.5;">${esc(s.sub)}</div>` : ""}
        </td>
        <td style="padding:14px 18px;vertical-align:middle;text-align:right;white-space:nowrap;">
          <span style="font-size:28px;line-height:1.1;font-weight:700;color:${s.tone ? TONE[s.tone] : "#111111"};">${esc(s.value)}</span>
        </td>
      </tr></table>`,
      )
      .join("");
  const block = (b: { title: string; body: string }) =>
    `<div style="border-top:1px solid #f0f0f0;padding-top:14px;margin-top:14px;">
       <div style="font-size:13px;font-weight:600;color:#111111;margin-bottom:5px;">${esc(b.title)}</div>
       <div style="font-size:13px;color:#666666;line-height:1.8;white-space:pre-wrap;">${b.body}</div>
     </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.heading || o.badge?.replace("|", " ") || "yah.homes")}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',Helvetica,Arial,sans-serif;">
  <tr><td style="background:#111111;padding:18px 24px;">
    <table role="presentation" width="100%"><tr>
      <td style="font-size:16px;font-weight:600;color:#ffffff;letter-spacing:.02em;">yah.homes</td>
      ${o.badge ? `<td style="text-align:right;font-size:11px;color:#bbbbbb;line-height:1.6;">${esc(o.badge.split("|")[0] ?? "")}<br><span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:.06em;">${esc(o.badge.split("|")[1] ?? o.badge)}</span></td>` : ""}
    </tr></table>
  </td></tr>
  ${alert ? `<tr><td style="background:#c0392b;height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>` : ""}
  <tr><td style="padding:26px 24px 24px;">
    ${o.heading ? `<div style="font-size:19px;font-weight:600;color:#111111;line-height:1.5;margin-bottom:${o.lead ? "8px" : "16px"};">${esc(o.heading)}</div>` : ""}
    ${o.lead ? `<div style="font-size:13px;color:#666666;line-height:1.9;margin-bottom:18px;">${esc(o.lead)}</div>` : ""}
    ${o.stats?.length ? `<div style="margin-bottom:16px;">${statsHtml(o.stats)}</div>` : ""}
    ${o.rows?.length ? `<table role="presentation" width="100%" style="border:1px solid #e8e8e8;border-radius:6px;"><tr><td style="padding:14px 18px;">
      <table role="presentation" width="100%">${o.rows.map(row).join("")}</table></td></tr></table>` : ""}
    ${o.codeCard ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr><td align="center" style="background:#111111;border-radius:8px;padding:20px 24px;">
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#999999;margin-bottom:6px;">${esc(o.codeCard.label)}</div>
      <div style="font-size:34px;font-weight:600;letter-spacing:.3em;color:#ffffff;padding-left:.3em;">${esc(o.codeCard.code)}</div>
    </td></tr></table>` : ""}
    ${(o.blocks ?? []).map(block).join("")}
    ${o.cta ? `<table role="presentation" width="100%" style="margin-top:20px;"><tr><td align="center" style="border-radius:6px;background:#111111;">
      <a href="${esc(o.cta.href)}" style="display:block;padding:14px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(o.cta.label)}</a>
    </td></tr></table>` : ""}
    ${o.note ? `<div style="font-size:12px;color:#999999;line-height:1.8;margin-top:16px;">${esc(o.note)}</div>` : ""}
  </td></tr>
  ${chatBlock(o.chat)}
  <tr><td style="padding:16px 24px 22px;border-top:1px solid #f0f0f0;font-size:12px;color:#aaaaaa;">${esc(o.footer ?? "yah.homes【Operated by AIRSTAR】")}</td></tr>
</table></td></tr></table></body></html>`;
}

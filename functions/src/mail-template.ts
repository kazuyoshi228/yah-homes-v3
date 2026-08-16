/**
 * メール送信の共通テンプレート（index.ts / beds24.ts で共用）
 * 全ての送信メールを同じ枠に載せる。table＋インラインCSSのみ（外部CSS/JS/画像なし）。
 * variant: "brand"=通常（黒ヘッダー） / "alert"=要対応（赤い帯を足す）
 */
export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export const SITE_URL = "https://yah.homes";

/* ─── メールの共通テンプレート ───
   全ての送信メールを同じ枠に載せる。table＋インラインCSSのみ（外部CSS/JS/画像なし）。
   variant: "brand"=通常（黒ヘッダー） / "alert"=要対応（赤い帯を足す） */
export function mailHtml(o: {
  heading: string;
  badge?: string;
  lead?: string;
  rows?: Array<[string, string]>;
  blocks?: Array<{ title: string; body: string }>;
  cta?: { label: string; href: string };
  /** 黒地に大きく出す暗証番号（前日のチェックイン案内用） */
  codeCard?: { label: string; code: string };
  note?: string;
  variant?: "brand" | "alert";
}): string {
  const alert = o.variant === "alert";
  const row = ([k, v]: [string, string]) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888888;vertical-align:top;white-space:nowrap;">${esc(k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#111111;text-align:right;font-weight:500;word-break:break-word;">${v}</td></tr>`;
  const block = (b: { title: string; body: string }) =>
    `<div style="border-top:1px solid #f0f0f0;padding-top:14px;margin-top:14px;">
       <div style="font-size:13px;font-weight:600;color:#111111;margin-bottom:5px;">${esc(b.title)}</div>
       <div style="font-size:13px;color:#666666;line-height:1.8;white-space:pre-wrap;">${b.body}</div>
     </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.heading)}</title></head>
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
    <div style="font-size:19px;font-weight:600;color:#111111;line-height:1.5;margin-bottom:${o.lead ? "8px" : "16px"};">${esc(o.heading)}</div>
    ${o.lead ? `<div style="font-size:13px;color:#666666;line-height:1.9;margin-bottom:18px;">${esc(o.lead)}</div>` : ""}
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
  <tr><td style="padding:16px 24px 22px;border-top:1px solid #f0f0f0;font-size:12px;color:#aaaaaa;">yah.homes ／ ボンファイア株式会社</td></tr>
</table></td></tr></table></body></html>`;
}

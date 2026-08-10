/**
 * ガイド配管（design_guides_pipeline.md・方式B）
 *
 * 本番ビルド:    magazine の公開フィード /feeds/homes.json を取得
 *               （status=published & distribution に homes を含む記事のみ）
 * プレビュー:    GUIDES_PREVIEW=1 で magazine リポジトリのローカル MD（draft含む）を読む
 *               → 全ページ noindex・dev チャンネル専用
 *
 * 言語マッピング: magazine "zh-TW" → yah.homes "zh"。翻訳が存在する言語のみページ生成。
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { Locale } from "../i18n/config";

export interface GuideFaq {
  q: string;
  a: string;
}
export interface GuideTranslation {
  title: string;
  excerpt: string;
  body: string; // Markdown
  directAnswer: string;
  metaTitle: string;
  metaDescription: string;
  faq?: GuideFaq[];
}
export interface Guide {
  slug: string;
  layer: string | null;
  hesitation: string | null;
  handoff: string[];
  primaryQuery: string | null;
  confirmedDate: string | null;
  publishedAt: number | null;
  updatedAt: number;
  thumbnailUrl: string | null;
  /** 著者スナップショット（magazine CMSで選択・feed経由で自動反映） */
  author: { id: string; name: string; title: string; photoUrl: string | null } | null;
  languages: Locale[];
  translations: Partial<Record<Locale, GuideTranslation>>;
  /** true = 未公開ドラフト（プレビュービルドのみ登場・noindex） */
  draft: boolean;
}

const FEED_URL = "https://magazine.yah.mobi/feeds/homes.json";
export const GUIDES_PREVIEW = process.env.GUIDES_PREVIEW === "1";

/* フィードが取れないときは既定でビルドを落とす。
   以前は警告だけ出して「ガイド0本」で成功扱いにしていたため、
   フィードが一時的に落ちた回のビルドをデプロイした結果、
   本番から記事64ページが消え、一覧からのリンクが全部404になった（2026-08 実測）。
   記事を持たないビルドを成果物にしないことが唯一の防波堤なので、
   空を許すのは GUIDES_ALLOW_EMPTY=1 を明示したときだけにする。 */
const ALLOW_EMPTY = process.env.GUIDES_ALLOW_EMPTY === "1";

// magazine の Lang → yah.homes の Locale
const LANG_MAP: Record<string, Locale> = { ja: "ja", en: "en", ko: "ko", "zh-TW": "zh", th: "th" };

function mapLangs(langs: string[], translations: Record<string, GuideTranslation>): Pick<Guide, "languages" | "translations"> {
  const out: Partial<Record<Locale, GuideTranslation>> = {};
  const locales: Locale[] = [];
  for (const l of langs) {
    const mapped = LANG_MAP[l];
    if (!mapped || !translations[l]) continue;
    out[mapped] = translations[l];
    locales.push(mapped);
  }
  return { languages: locales, translations: out };
}

// ─── 本番: フィード取得 ─────────────────────────────────────────────────────────
async function fetchFeed(): Promise<Guide[]> {
  let res: Response;
  try {
    // CDNキャッシュ（300秒）で公開直後の記事が落ちるのを防ぐ（クエリでキャッシュキーを分ける）
    res = await fetch(`${FEED_URL}?ts=${Date.now()}`);
  } catch (e) {
    if (!ALLOW_EMPTY) throw new Error(`[guides] feed unreachable: ${e}`);
    console.warn(`[guides] feed unreachable (${e}) — building without guides`);
    return [];
  }
  if (!res.ok) {
    if (!ALLOW_EMPTY) throw new Error(`[guides] feed HTTP ${res.status}`);
    console.warn(`[guides] feed HTTP ${res.status} — building without guides`);
    return [];
  }
  let raw: Array<Record<string, unknown>>;
  try {
    raw = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(raw)) throw new Error("feed is not an array");
  } catch (e) {
    // フィード未デプロイ時はSPAのHTMLが返る（rewrite未設定）→ JSONにならない
    if (!ALLOW_EMPTY) throw new Error(`[guides] feed not valid JSON: ${e}`);
    console.warn(`[guides] feed not valid JSON (${e}) — building without guides`);
    return [];
  }
  // feed の日付は number(millis) / Firestore Timestamp {_seconds,_nanoseconds}
  // / ISO文字列 / null が混在しうる。millis に正規化する。
  const toMillis = (v: unknown): number | null => {
    if (v == null) return null;
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const t = Date.parse(v);
      return Number.isNaN(t) ? null : t;
    }
    if (typeof v === "object") {
      const s = (v as { _seconds?: number; seconds?: number })._seconds ??
        (v as { seconds?: number }).seconds;
      if (typeof s === "number") return s * 1000;
    }
    return null;
  };
  return raw.map((a) => {
    const { languages, translations } = mapLangs(
      (a.languages as string[]) ?? [],
      (a.translations as Record<string, GuideTranslation>) ?? {},
    );
    return {
      slug: String(a.slug),
      layer: (a.layer as string) ?? null,
      hesitation: (a.hesitation as string) ?? null,
      handoff: (a.handoff as string[]) ?? [],
      primaryQuery: (a.primaryQuery as string) ?? null,
      confirmedDate: (a.confirmedDate as string) ?? null,
      publishedAt: toMillis(a.publishedAt),
      updatedAt: toMillis(a.updatedAt) ?? Date.now(),
      thumbnailUrl: (a.thumbnailUrl as string) ?? null,
      author: (a.author as Guide["author"]) ?? null,
      languages,
      translations,
      draft: false,
    };
  });
}

// ─── プレビュー: magazine リポジトリのローカル MD を読む ─────────────────────────
// front-matter は import-md.mjs と同じ lean 形式（key: value / [配列] / faq: - "q||a"）
const LOCAL_DIR = process.env.GUIDES_LOCAL_DIR ?? path.resolve(process.cwd(), "../magazine.yah.mobi_v0.3/content/guides");

function parseArray(v: string): string[] {
  const inner = v.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  const quoted = inner.match(/"([^"]*)"/g);
  if (quoted) return quoted.map((s) => s.slice(1, -1));
  return inner.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseFrontMatter(src: string): { fm: Record<string, unknown>; body: string } {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: src };
  const fm: Record<string, unknown> = {};
  const faq: GuideFaq[] = [];
  let inFaq = false;
  for (const line of m[1].split("\n")) {
    if (/^faq:\s*$/.test(line)) {
      inFaq = true;
      continue;
    }
    if (inFaq && /^\s+-\s+"/.test(line)) {
      const item = line.replace(/^\s+-\s+"/, "").replace(/"\s*$/, "");
      const [q, a] = item.split("||");
      if (q && a) faq.push({ q: q.trim(), a: a.trim() });
      continue;
    }
    inFaq = false;
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_]*):\s?(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    fm[key] = value.startsWith("[") ? parseArray(value) : value.trim();
  }
  if (faq.length) fm.faq = faq;
  return { fm, body: m[2] };
}

function loadLocalDrafts(): Guide[] {
  if (!existsSync(LOCAL_DIR)) {
    console.warn(`[guides] preview: local dir not found: ${LOCAL_DIR}`);
    return [];
  }
  const bySlug = new Map<string, Guide>();
  for (const langDir of readdirSync(LOCAL_DIR)) {
    const dir = path.join(LOCAL_DIR, langDir);
    if (!statSync(dir).isDirectory()) continue;
    const locale = LANG_MAP[langDir];
    if (!locale) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const { fm, body } = parseFrontMatter(readFileSync(path.join(dir, file), "utf-8"));
      const slug = String(fm.slug ?? file.replace(/\.md$/, ""));
      const t: GuideTranslation = {
        title: String(fm.title ?? slug),
        excerpt: String(fm.excerpt ?? ""),
        body,
        directAnswer: String(fm.directAnswer ?? ""),
        metaTitle: String(fm.metaTitle ?? fm.title ?? slug),
        metaDescription: String(fm.metaDescription ?? fm.excerpt ?? ""),
        faq: (fm.faq as GuideFaq[]) ?? [],
      };
      const existing = bySlug.get(slug);
      if (existing) {
        existing.languages.push(locale);
        existing.translations[locale] = t;
      } else {
        bySlug.set(slug, {
          slug,
          layer: (fm.layer as string) ?? null,
          hesitation: (fm.hesitation as string) ?? null,
          handoff: (fm.handoff as string[]) ?? [],
          primaryQuery: (fm.primaryQuery as string) ?? null,
          confirmedDate: (fm.confirmedDate as string) ?? null,
          publishedAt: null,
          updatedAt: Date.now(),
          thumbnailUrl: (fm.thumbnailUrl as string) ?? null,
          // 下書きプレビュー用: front-matter の author 欄（本番は feed のスナップショット）
          author: fm.authorName
            ? { id: "", name: fm.authorName as string, title: (fm.authorTitle as string) ?? "", photoUrl: (fm.authorPhotoUrl as string) ?? null }
            : null,
          languages: [locale],
          translations: { [locale]: t },
          draft: String(fm.status ?? "draft") !== "published",
        });
      }
    }
  }
  return [...bySlug.values()];
}

// ─── 公開 API ──────────────────────────────────────────────────────────────────
let cache: Guide[] | null = null;
export async function getGuides(): Promise<Guide[]> {
  if (cache) return cache;
  cache = GUIDES_PREVIEW ? loadLocalDrafts() : await fetchFeed();
  return cache;
}

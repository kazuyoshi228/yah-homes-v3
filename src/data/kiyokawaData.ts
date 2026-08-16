// kiyokawa の言語別データ集約点。実体は src/data/kiyokawa/ 配下（計画書 §7-2）。
import type { Lang } from "./kiyokawa/_schema";
import type { KiyokawaTranslations } from "./kiyokawa/_schema";
import { en } from "./kiyokawa/en";
import { ja } from "./kiyokawa/ja";
import { ko } from "./kiyokawa/ko";
import { zh } from "./kiyokawa/zh";
import { th } from "./kiyokawa/th";

export type { KiyokawaTranslations };
export const kiyokawaData: Record<Lang, KiyokawaTranslations> = { en, ja, ko, zh, th };

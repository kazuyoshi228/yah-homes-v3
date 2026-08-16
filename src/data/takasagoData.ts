// takasago の言語別データ集約点。実体は src/data/takasago/ 配下（計画書 §7-2）。
import type { Lang } from "./takasago/_schema";
import type { TakasagoTranslations } from "./takasago/_schema";
import { en } from "./takasago/en";
import { ja } from "./takasago/ja";
import { ko } from "./takasago/ko";
import { zh } from "./takasago/zh";
import { th } from "./takasago/th";

export type { TakasagoTranslations };
export const takasagoData: Record<Lang, TakasagoTranslations> = { en, ja, ko, zh, th };

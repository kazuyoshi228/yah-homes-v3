/* 施設の表示名と予約UIの共有定数（複数ページでの再定義を禁止） */
export const propDisplayName = (key: string): string =>
  key === "test" ? "yah.homes test1（検証用）" : `yah.homes ${key}`;
/** 到着予定時刻の選択肢（checkout と My Page で共通） */
export const ARRIVAL_TIMES = ["15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"];

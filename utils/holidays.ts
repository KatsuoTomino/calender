/**
 * 日本の祝日を計算するユーティリティ
 */

export interface Holiday {
  date: Date;
  name: string;
}

/**
 * 春分の日を計算（2099年まで対応）
 */
function getVernalEquinox(year: number): number {
  if (year <= 1947) return 21;
  if (year <= 1979) return 20 + Math.floor((year - 1980) / 4);
  if (year <= 2099) return 20 + Math.floor((year - 2000) / 4);
  if (year <= 2150) return 20 + Math.floor((year - 2000) / 4) - 1;
  return 20;
}

/**
 * 秋分の日を計算（2099年まで対応）
 */
function getAutumnalEquinox(year: number): number {
  if (year <= 1947) return 23;
  if (year <= 1979) return 23 + Math.floor((year - 1980) / 4);
  if (year <= 2099) return 23 + Math.floor((year - 2000) / 4);
  if (year <= 2150) return 23 + Math.floor((year - 2000) / 4) - 1;
  return 23;
}

/**
 * 指定された年の日本の祝日を取得
 */
export function getJapaneseHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [];

  // 固定祝日
  holidays.push(
    { date: new Date(year, 0, 1), name: "元日" },
    { date: new Date(year, 1, 11), name: "建国記念の日" },
    { date: new Date(year, 3, 29), name: "昭和の日" },
    { date: new Date(year, 4, 3), name: "憲法記念日" },
    { date: new Date(year, 4, 4), name: "みどりの日" },
    { date: new Date(year, 4, 5), name: "こどもの日" },
    { date: new Date(year, 7, 11), name: "山の日" },
    { date: new Date(year, 10, 3), name: "文化の日" },
    { date: new Date(year, 10, 23), name: "勤労感謝の日" }
  );

  // 海の日（2020年以降は7月第3月曜日、それ以前は7月20日）
  if (year >= 2020) {
    const julyFirst = new Date(year, 6, 1);
    const firstMonday = julyFirst.getDay() === 0 ? 1 : 8 - julyFirst.getDay();
    holidays.push({ date: new Date(year, 6, firstMonday + 14), name: "海の日" });
  } else {
    holidays.push({ date: new Date(year, 6, 20), name: "海の日" });
  }

  // スポーツの日（2020年以降は10月第2月曜日、それ以前は10月10日）
  if (year >= 2020) {
    const octoberFirst = new Date(year, 9, 1);
    const firstMonday = octoberFirst.getDay() === 0 ? 1 : 8 - octoberFirst.getDay();
    holidays.push({ date: new Date(year, 9, firstMonday + 7), name: "スポーツの日" });
  } else {
    holidays.push({ date: new Date(year, 9, 10), name: "スポーツの日" });
  }

  // 敬老の日（9月第3月曜日）
  const septemberFirst = new Date(year, 8, 1);
  const firstMonday = septemberFirst.getDay() === 0 ? 1 : 8 - septemberFirst.getDay();
  holidays.push({ date: new Date(year, 8, firstMonday + 14), name: "敬老の日" });

  // 春分の日
  holidays.push({ date: new Date(year, 2, getVernalEquinox(year)), name: "春分の日" });

  // 秋分の日
  holidays.push({ date: new Date(year, 8, getAutumnalEquinox(year)), name: "秋分の日" });

  // 天皇誕生日（2020年以降は2月23日、それ以前は12月23日）
  if (year >= 2020) {
    holidays.push({ date: new Date(year, 1, 23), name: "天皇誕生日" });
  } else {
    holidays.push({ date: new Date(year, 11, 23), name: "天皇誕生日" });
  }

  // 振替休日を計算
  const substituteHolidays: Holiday[] = [];
  holidays.forEach((holiday) => {
    const dayOfWeek = holiday.date.getDay();
    if (dayOfWeek === 0) {
      // 日曜日の場合は翌月曜日が振替休日
      const nextMonday = new Date(holiday.date);
      nextMonday.setDate(nextMonday.getDate() + 1);
      substituteHolidays.push({ date: nextMonday, name: "振替休日" });
    }
  });

  // 振替休日を追加
  holidays.push(...substituteHolidays);

  // 日付順にソート
  holidays.sort((a, b) => a.date.getTime() - b.date.getTime());

  return holidays;
}

/**
 * 指定された日付が祝日かどうかを判定し、祝日名を返す
 */
export function getHolidayName(date: Date): string | null {
  const year = date.getFullYear();
  const holidays = getJapaneseHolidays(year);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  for (const holiday of holidays) {
    const holidayStr = `${holiday.date.getFullYear()}-${String(holiday.date.getMonth() + 1).padStart(2, "0")}-${String(holiday.date.getDate()).padStart(2, "0")}`;
    if (holidayStr === dateStr) {
      return holiday.name;
    }
  }

  return null;
}

/**
 * 指定された日付が土日かどうかを判定
 */
export function isWeekend(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

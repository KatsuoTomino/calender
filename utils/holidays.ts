/**
 * 日本の祝日・休日
 * 根拠: 国民の祝日に関する法律（昭和23年法律第178号）
 * 春分・秋分の近似: 国立天文台の計算に使われる通式
 * https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
 */

export interface Holiday {
  date: Date;
  name: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** month は 0 始まり。n は 1 始まり（第1月曜日 = 1） */
function getNthMonday(year: number, month: number, n: number): Date {
  const first = new Date(year, month, 1);
  const firstMonday = 1 + ((8 - first.getDay()) % 7);
  return new Date(year, month, firstMonday + (n - 1) * 7);
}

/**
 * 春分の日（1980–2099 は通式、内閣府発表の2026/2027と一致）
 */
function getVernalEquinox(year: number): number {
  if (year <= 1979) {
    return Math.floor(
      20.8357 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
    );
  }
  if (year <= 2099) {
    return Math.floor(
      20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
    );
  }
  return Math.floor(
    21.851 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
  );
}

/**
 * 秋分の日
 */
function getAutumnalEquinox(year: number): number {
  if (year <= 1979) {
    return Math.floor(
      23.2588 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
    );
  }
  if (year <= 2099) {
    return Math.floor(
      23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
    );
  }
  return Math.floor(
    24.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
  );
}

/**
 * 指定された年の日本の祝日・休日を取得
 */
export function getJapaneseHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [
    { date: new Date(year, 0, 1), name: "元日" },
    { date: getNthMonday(year, 0, 2), name: "成人の日" },
    { date: new Date(year, 1, 11), name: "建国記念の日" },
    { date: new Date(year, 3, 29), name: "昭和の日" },
    { date: new Date(year, 4, 3), name: "憲法記念日" },
    { date: new Date(year, 4, 4), name: "みどりの日" },
    { date: new Date(year, 4, 5), name: "こどもの日" },
    { date: new Date(year, 7, 11), name: "山の日" },
    { date: getNthMonday(year, 8, 3), name: "敬老の日" },
    { date: new Date(year, 2, getVernalEquinox(year)), name: "春分の日" },
    { date: new Date(year, 8, getAutumnalEquinox(year)), name: "秋分の日" },
    { date: new Date(year, 10, 3), name: "文化の日" },
    { date: new Date(year, 10, 23), name: "勤労感謝の日" },
  ];

  // 海の日・スポーツの日（東京五輪特例）
  if (year === 2020) {
    holidays.push(
      { date: new Date(year, 6, 23), name: "海の日" },
      { date: new Date(year, 6, 24), name: "スポーツの日" }
    );
    const yama = holidays.find((h) => h.name === "山の日");
    if (yama) yama.date = new Date(year, 7, 10);
  } else if (year === 2021) {
    holidays.push(
      { date: new Date(year, 6, 22), name: "海の日" },
      { date: new Date(year, 6, 23), name: "スポーツの日" }
    );
    const yama = holidays.find((h) => h.name === "山の日");
    if (yama) yama.date = new Date(year, 7, 8);
  } else if (year >= 2020) {
    holidays.push(
      { date: getNthMonday(year, 6, 3), name: "海の日" },
      { date: getNthMonday(year, 9, 2), name: "スポーツの日" }
    );
  } else {
    holidays.push(
      { date: new Date(year, 6, 20), name: "海の日" },
      { date: new Date(year, 9, 10), name: "スポーツの日" }
    );
  }

  if (year >= 2020) {
    holidays.push({ date: new Date(year, 1, 23), name: "天皇誕生日" });
  } else {
    holidays.push({ date: new Date(year, 11, 23), name: "天皇誕生日" });
  }

  const holidayKeys = new Set(holidays.map((h) => toDateStr(h.date)));

  // 法第3条第2項: 祝日が日曜なら、その後の最も近い祝日でない日が振替休日
  const extras: Holiday[] = [];
  for (const holiday of holidays) {
    if (holiday.date.getDay() !== 0) continue;
    const next = new Date(holiday.date);
    do {
      next.setDate(next.getDate() + 1);
    } while (holidayKeys.has(toDateStr(next)));
    extras.push({ date: new Date(next), name: "振替休日" });
    holidayKeys.add(toDateStr(next));
  }

  // 法第3条第3項: 前後が国民の祝日の日は国民の休日
  const originalKeys = new Set(holidays.map((h) => toDateStr(h.date)));
  for (const holiday of holidays) {
    const mid = new Date(holiday.date);
    mid.setDate(mid.getDate() + 1);
    const after = new Date(mid);
    after.setDate(after.getDate() + 1);
    const midKey = toDateStr(mid);
    if (
      originalKeys.has(toDateStr(after)) &&
      !holidayKeys.has(midKey) &&
      mid.getDay() !== 0 &&
      mid.getDay() !== 6
    ) {
      extras.push({ date: new Date(mid), name: "国民の休日" });
      holidayKeys.add(midKey);
    }
  }

  holidays.push(...extras);
  holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
  return holidays;
}

export function getHolidayName(date: Date): string | null {
  const holidays = getJapaneseHolidays(date.getFullYear());
  const dateStr = toDateStr(date);
  const hit = holidays.find((holiday) => toDateStr(holiday.date) === dateStr);
  return hit?.name ?? null;
}

export function isWeekend(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

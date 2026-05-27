const LEGACY_MONTHLY_TASK_DATE_STR = /^\d{4}-\d{2}$/;

export function isMonthlyTaskDateStr(dateStr: string): boolean {
  return dateStr === "monthly" || LEGACY_MONTHLY_TASK_DATE_STR.test(dateStr);
}

export function isCalendarDateInMonth(
  dateStr: string,
  year: number,
  month: number
): boolean {
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}-`;
  return dateStr.length === 10 && dateStr.startsWith(monthPrefix);
}

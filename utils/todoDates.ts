const DATE_STR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getMonthDateRange(year: number, month: number): { startDateStr: string; endDateStr: string } {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid year or month");
  }

  const startDateStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startDateStr, endDateStr };
}

export function isDateStrInRange(dateStr: string, startDateStr: string, endDateStr: string): boolean {
  return (
    DATE_STR_PATTERN.test(dateStr) &&
    DATE_STR_PATTERN.test(startDateStr) &&
    DATE_STR_PATTERN.test(endDateStr) &&
    dateStr >= startDateStr &&
    dateStr <= endDateStr
  );
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMonthDateRange(
  year: number,
  month: number
): { startDateStr: string; endDateStr: string } {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  return {
    startDateStr: formatLocalDate(startDate),
    endDateStr: formatLocalDate(endDate),
  };
}

export function isDateStrInMonth(
  dateStr: string,
  year: number,
  month: number
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }

  const { startDateStr, endDateStr } = getMonthDateRange(year, month);
  return dateStr >= startDateStr && dateStr <= endDateStr;
}

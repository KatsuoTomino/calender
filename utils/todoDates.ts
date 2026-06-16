export function getMonthDateRange(year: number, month: number): { startDateStr: string; endDateStr: string } {
  const monthString = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();

  return {
    startDateStr: `${year}-${monthString}-01`,
    endDateStr: `${year}-${monthString}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isTodoInMonth(dateStr: string, year: number, month: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }

  const { startDateStr, endDateStr } = getMonthDateRange(year, month);
  return dateStr >= startDateStr && dateStr <= endDateStr;
}

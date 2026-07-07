export function getMonthDateRange(year: number, month: number): { start: string; end: string } {
  const monthStr = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();

  return {
    start: `${year}-${monthStr}-01`,
    end: `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isDateStrInMonth(dateStr: string, year: number, month: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }

  const { start, end } = getMonthDateRange(year, month);
  return dateStr >= start && dateStr <= end;
}


export function getMonthDateBounds(year: number, month: number): { start: string; end: string } {
  const monthPart = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${monthPart}-01`,
    end: `${year}-${monthPart}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isTodoDateInMonth(dateStr: string, year: number, month: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const { start, end } = getMonthDateBounds(year, month);
  return dateStr >= start && dateStr <= end;
}

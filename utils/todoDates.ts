export function formatDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getMonthDateRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: formatDateString(year, month, 1),
    end: formatDateString(year, month, lastDay),
  };
}

export function isDateStrInMonth(dateStr: string, year: number, month: number): boolean {
  const { start, end } = getMonthDateRange(year, month);
  return dateStr >= start && dateStr <= end;
}

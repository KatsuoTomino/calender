export function getMonthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-`;
}

export function isTodoInMonth(
  dateStr: string,
  year: number,
  month: number
): boolean {
  return dateStr.startsWith(getMonthPrefix(year, month));
}

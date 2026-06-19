export function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function isDateStrInMonth(dateStr: string, year: number, month: number): boolean {
  return dateStr.startsWith(`${monthPrefix(year, month)}-`);
}

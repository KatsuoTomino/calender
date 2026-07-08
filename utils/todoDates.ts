export function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-`;
}

export function isTodoInMonth(dateStr: string, year: number, month: number): boolean {
  return dateStr.startsWith(monthPrefix(year, month));
}

export function uniqueTodoIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
}

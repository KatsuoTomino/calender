export function isDateStrInMonth(dateStr: string, year: number, month: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}-`;
  return dateStr.startsWith(monthPrefix);
}

const DATE_STR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getMonthDateBounds(year: number, month: number): {
  startDateStr: string;
  endDateStr: string;
} {
  const paddedMonth = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();

  return {
    startDateStr: `${year}-${paddedMonth}-01`,
    endDateStr: `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isTodoDateInMonth(
  dateStr: string,
  year: number,
  month: number
): boolean {
  if (!DATE_STR_PATTERN.test(dateStr)) return false;

  const { startDateStr, endDateStr } = getMonthDateBounds(year, month);
  return dateStr >= startDateStr && dateStr <= endDateStr;
}

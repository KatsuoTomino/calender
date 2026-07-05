export function getMonthDateRange(year: number, month: number): {
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

export function isDateStrInMonth(dateStr: string, year: number, month: number): boolean {
  const { startDateStr, endDateStr } = getMonthDateRange(year, month);
  return dateStr >= startDateStr && dateStr <= endDateStr;
}

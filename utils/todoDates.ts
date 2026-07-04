export function getMonthDateBounds(year: number, month: number): {
  startDateStr: string;
  endDateStr: string;
  monthPrefix: string;
} {
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDateStr: `${monthPrefix}-01`,
    endDateStr: `${monthPrefix}-${String(lastDay).padStart(2, "0")}`,
    monthPrefix,
  };
}

export function isDateInMonthString(dateStr: string, year: number, month: number): boolean {
  const { startDateStr, endDateStr } = getMonthDateBounds(year, month);
  return dateStr >= startDateStr && dateStr <= endDateStr;
}

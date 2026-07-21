type TodoWithDateStr = {
  dateStr: string;
};

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthDateRange(
  year: number,
  month: number
): { startDateStr: string; endDateStr: string } {
  return {
    startDateStr: `${year}-${String(month).padStart(2, "0")}-01`,
    endDateStr: formatLocalDate(new Date(year, month, 0)),
  };
}

export function isTodoInMonth(
  todo: TodoWithDateStr,
  year: number,
  month: number
): boolean {
  const { startDateStr, endDateStr } = monthDateRange(year, month);
  return todo.dateStr >= startDateStr && todo.dateStr <= endDateStr;
}

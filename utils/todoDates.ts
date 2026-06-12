export interface DateStrLike {
  dateStr: string;
}

export function getMonthDateRange(year: number, month: number) {
  const monthText = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();

  return {
    startDateStr: `${year}-${monthText}-01`,
    endDateStr: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isDateStrInMonth(dateStr: string, year: number, month: number): boolean {
  const { startDateStr, endDateStr } = getMonthDateRange(year, month);
  return dateStr >= startDateStr && dateStr <= endDateStr;
}

export function getTodosForMonth<T extends DateStrLike>(
  todos: T[],
  year: number,
  month: number
): T[] {
  return todos.filter((todo) => isDateStrInMonth(todo.dateStr, year, month));
}

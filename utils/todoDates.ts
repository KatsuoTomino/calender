import type { TodoItem } from "../types.ts";

export function getMonthDateBounds(
  year: number,
  month: number
): { startDateStr: string; endDateStr: string } {
  const monthText = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();

  return {
    startDateStr: `${year}-${monthText}-01`,
    endDateStr: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isDateStrInMonth(
  dateStr: string,
  year: number,
  month: number
): boolean {
  const { startDateStr, endDateStr } = getMonthDateBounds(year, month);
  return dateStr >= startDateStr && dateStr <= endDateStr;
}

export function getTodosForMonth(
  todos: TodoItem[],
  year: number,
  month: number
): TodoItem[] {
  return todos.filter((todo) => isDateStrInMonth(todo.dateStr, year, month));
}

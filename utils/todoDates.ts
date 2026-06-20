import type { TodoItem } from "../types";

export function getMonthDateRange(year: number, month: number): {
  startDateStr: string;
  endDateStr: string;
} {
  const startDateStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startDateStr, endDateStr };
}

export function isTodoInMonth(dateStr: string, year: number, month: number): boolean {
  const { startDateStr, endDateStr } = getMonthDateRange(year, month);
  return dateStr >= startDateStr && dateStr <= endDateStr;
}

export function filterTodosInMonth<T extends Pick<TodoItem, "dateStr">>(
  todos: T[],
  year: number,
  month: number
): T[] {
  return todos.filter((todo) => isTodoInMonth(todo.dateStr, year, month));
}

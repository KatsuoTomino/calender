import type { TodoItem } from "../types";

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

export function isTodoInMonth(todo: TodoItem, year: number, month: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todo.dateStr)) {
    return false;
  }

  const { startDateStr, endDateStr } = getMonthDateBounds(year, month);
  return todo.dateStr >= startDateStr && todo.dateStr <= endDateStr;
}

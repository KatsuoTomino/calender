import type { TodoItem } from "../types";

export function getMonthDateBounds(year: number, month: number): { startDateStr: string; endDateStr: string } {
  const monthText = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();

  return {
    startDateStr: `${year}-${monthText}-01`,
    endDateStr: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isTodoInMonth(todo: Pick<TodoItem, "dateStr">, year: number, month: number): boolean {
  const { startDateStr, endDateStr } = getMonthDateBounds(year, month);
  return todo.dateStr >= startDateStr && todo.dateStr <= endDateStr;
}

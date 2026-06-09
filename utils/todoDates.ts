import { TodoItem } from "../types";

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getMonthDateBounds(
  year: number,
  month: number
): { startDateStr: string; endDateStr: string } {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  return {
    startDateStr: formatLocalDate(startDate),
    endDateStr: formatLocalDate(endDate),
  };
}

export function isTodoInMonth(todo: Pick<TodoItem, "dateStr">, year: number, month: number): boolean {
  const { startDateStr, endDateStr } = getMonthDateBounds(year, month);
  return todo.dateStr >= startDateStr && todo.dateStr <= endDateStr;
}

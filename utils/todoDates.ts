import type { TodoItem } from "../types";

export function formatMonthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-`;
}

export function isTodoInMonth(todo: Pick<TodoItem, "dateStr">, year: number, month: number): boolean {
  return todo.dateStr.startsWith(formatMonthPrefix(year, month));
}

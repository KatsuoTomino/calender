import type { TodoItem } from "../types";

export function formatMonthNumber(month: number): string {
  return String(month).padStart(2, "0");
}

export function isTodoInMonth(todo: Pick<TodoItem, "dateStr">, year: number, month: number): boolean {
  const monthPrefix = `${year}-${formatMonthNumber(month)}-`;
  return /^\d{4}-\d{2}-\d{2}$/.test(todo.dateStr) && todo.dateStr.startsWith(monthPrefix);
}

export function getTodoImageUrls(todo: Pick<TodoItem, "imageUrls">): string[] {
  return todo.imageUrls || [];
}

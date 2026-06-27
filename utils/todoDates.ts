import type { TodoItem } from "../types";

export function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function isTodoInMonth(todo: Pick<TodoItem, "dateStr">, year: number, month: number): boolean {
  return todo.dateStr.startsWith(`${monthPrefix(year, month)}-`);
}

export function filterTodosForMonth<T extends Pick<TodoItem, "dateStr">>(
  todos: T[],
  year: number,
  month: number
): T[] {
  return todos.filter((todo) => isTodoInMonth(todo, year, month));
}

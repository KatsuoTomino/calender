import type { TodoItem } from "../types";

export function getMonthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-`;
}

export function isTodoInMonth(todo: TodoItem, year: number, month: number): boolean {
  return todo.dateStr.startsWith(getMonthPrefix(year, month));
}

export function getTodosInMonth(todos: TodoItem[], year: number, month: number): TodoItem[] {
  return todos.filter((todo) => isTodoInMonth(todo, year, month));
}

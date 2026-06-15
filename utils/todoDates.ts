import { TodoItem } from "../types";

const DATE_STR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getMonthDateBounds(year: number, month: number): { start: string; end: string } {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid year or month");
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function isTodoInMonth(todo: Pick<TodoItem, "dateStr">, year: number, month: number): boolean {
  if (!DATE_STR_PATTERN.test(todo.dateStr)) return false;

  const { start, end } = getMonthDateBounds(year, month);
  return todo.dateStr >= start && todo.dateStr <= end;
}

export function collectTodoImageKeys(todos: Pick<TodoItem, "imageUrls">[]): string[] {
  return todos.flatMap((todo) => todo.imageUrls || []);
}

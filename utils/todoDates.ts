import type { TodoItem } from "../types";

export function getMonthDateRange(year: number, month: number): { start: string; end: string } {
  const paddedMonth = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();

  return {
    start: `${year}-${paddedMonth}-01`,
    end: `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isTodoInMonth(todo: Pick<TodoItem, "dateStr">, year: number, month: number): boolean {
  const { start, end } = getMonthDateRange(year, month);
  return todo.dateStr >= start && todo.dateStr <= end;
}

export function getTodoIdsForMonth(todos: TodoItem[], year: number, month: number): string[] {
  return todos.filter((todo) => isTodoInMonth(todo, year, month)).map((todo) => todo.id);
}

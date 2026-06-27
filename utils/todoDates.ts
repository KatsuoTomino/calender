export function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function isTodoInMonth(todo: { dateStr: string }, year: number, month: number): boolean {
  return todo.dateStr.startsWith(`${monthPrefix(year, month)}-`);
}

export function filterTodosForMonth<T extends { dateStr: string }>(
  todos: readonly T[],
  year: number,
  month: number
): T[] {
  return todos.filter((todo) => isTodoInMonth(todo, year, month));
}

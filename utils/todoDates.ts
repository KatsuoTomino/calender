import type { TodoItem } from "../types";

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatMonthDay(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getMonthBounds(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: formatMonthDay(year, month, 1),
    end: formatMonthDay(year, month, lastDay),
  };
}

export function isCalendarDateStr(dateStr: string): boolean {
  return CALENDAR_DATE_RE.test(dateStr);
}

export function isTodoInMonth(todo: Pick<TodoItem, "dateStr">, year: number, month: number): boolean {
  if (!isCalendarDateStr(todo.dateStr)) {
    return false;
  }

  const { start, end } = getMonthBounds(year, month);
  return todo.dateStr >= start && todo.dateStr <= end;
}

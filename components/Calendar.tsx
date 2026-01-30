import React, { useMemo } from "react";
import { WEEKDAYS } from "../constants";
import { DayData, TodoItem } from "../types";
import { getHolidayName, isWeekend } from "../utils/holidays";

interface CalendarProps {
  currentDate: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onMonthChange: (offset: number) => void;
  onDeleteMonthTodos: () => void;
  onOpenMonthTasks?: () => void;
  todos: TodoItem[];
}

const Calendar: React.FC<CalendarProps> = ({
  currentDate,
  selectedDate,
  onSelectDate,
  onMonthChange,
  onDeleteMonthTodos,
  onOpenMonthTasks,
  todos,
}) => {
  // Generate days for the grid
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startingDayIndex = firstDayOfMonth.getDay(); // 0 (Sun) to 6 (Sat)
    const daysInMonth = lastDayOfMonth.getDate();

    const days: DayData[] = [];

    // Helper to format date as YYYY-MM-DD in local timezone
    const formatLocalDate = (date: Date): string => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    // Helper to get todos for a date string
    const getTodosForDate = (dStr: string) => {
      return todos
        .filter((t) => t.dateStr === dStr)
        .sort((a, b) => {
          if (a.completed === b.completed) return 0;
          return a.completed ? 1 : -1;
        });
    };

    // Previous month padding
    for (let i = 0; i < startingDayIndex; i++) {
      const d = new Date(year, month, -startingDayIndex + 1 + i);
      const dStr = formatLocalDate(d);
      const holidayName = getHolidayName(d);
      days.push({
        date: d,
        isCurrentMonth: false,
        isToday: false,
        dateStr: dStr,
        todos: getTodosForDate(dStr),
        isHoliday: !!holidayName,
        holidayName,
        isWeekend: isWeekend(d),
      });
    }

    // Current month days
    const today = new Date();
    const todayStr = formatLocalDate(today);
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const dStr = formatLocalDate(d);
      const holidayName = getHolidayName(d);
      days.push({
        date: d,
        isCurrentMonth: true,
        isToday: dStr === todayStr,
        dateStr: dStr,
        todos: getTodosForDate(dStr),
        isHoliday: !!holidayName,
        holidayName,
        isWeekend: isWeekend(d),
      });
    }

    // Next month padding (to fill 6 rows * 7 cols = 42)
    const remainingSlots = 42 - days.length;
    for (let i = 1; i <= remainingSlots; i++) {
      const d = new Date(year, month + 1, i);
      const dStr = formatLocalDate(d);
      const holidayName = getHolidayName(d);
      days.push({
        date: d,
        isCurrentMonth: false,
        isToday: false,
        dateStr: dStr,
        todos: getTodosForDate(dStr),
        isHoliday: !!holidayName,
        holidayName,
        isWeekend: isWeekend(d),
      });
    }

    return days;
  }, [currentDate, todos]);

  const isSelected = (d: Date) =>
    d.getDate() === selectedDate.getDate() &&
    d.getMonth() === selectedDate.getMonth() &&
    d.getFullYear() === selectedDate.getFullYear();

  return (
    <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm p-2 sm:p-4 min-h-[600px] md:h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 sm:mb-4 px-1 sm:px-2 shrink-0">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-baseline gap-1 sm:gap-2">
          {currentDate.getFullYear()}年
          <span className="text-primary text-2xl sm:text-3xl">
            {currentDate.getMonth() + 1}月
          </span>
          {onOpenMonthTasks && (
            <button
              onClick={onOpenMonthTasks}
              className="ml-2 px-2 py-1 sm:px-3 sm:py-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors font-bold text-lg sm:text-xl"
              title="月のタスク管理"
            >
              $
            </button>
          )}
        </h2>
        <div className="flex gap-1 sm:gap-2 items-center">
          <button
            onClick={onDeleteMonthTodos}
            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-0.5 sm:gap-1"
            title="この月のTodoを全て削除"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            月の削除
          </button>
          <div className="w-px h-6 bg-slate-300"></div>
          <button
            onClick={() => onMonthChange(-1)}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            onClick={() => onMonthChange(1)}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 mb-1 md:mb-2 shrink-0">
        {WEEKDAYS.map((day, idx) => (
          <div
            key={day}
            className={`text-center text-[10px] md:text-xs font-bold ${
              idx === 0
                ? "text-red-400"
                : idx === 6
                ? "text-blue-400"
                : "text-slate-400"
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid - Google Calendar Style */}
      <div className="grid grid-cols-7 grid-rows-6 bg-slate-200 border border-slate-200 gap-px flex-1 overflow-hidden rounded-lg">
        {calendarDays.map((day, idx) => {
          const isDaySelected = isSelected(day.date);

          return (
            <button
              key={`${day.dateStr}-${idx}`}
              onClick={() => onSelectDate(day.date)}
              className={`
                relative flex flex-col items-start justify-start p-0.5 md:p-1 text-left transition-colors
                ${
                  !day.isCurrentMonth
                    ? "bg-slate-50 text-slate-400"
                    : day.isHoliday
                    ? "bg-red-50 text-red-700"
                    : day.isWeekend
                    ? "bg-blue-50 text-blue-700"
                    : "bg-white text-slate-700"
                }
                ${isDaySelected ? "bg-pink-50 ring-2 ring-pink-300" : "hover:bg-slate-50"}
              `}
              title={day.holidayName || undefined}
            >
              {/* Date Number */}
              <div className="flex items-center gap-1 mb-0.5 md:mb-1">
                <span
                  className={`
                    text-[10px] md:text-xs font-medium w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full
                    ${
                      day.isToday
                        ? "bg-primary text-white shadow-md"
                        : isDaySelected
                        ? "text-primary font-bold"
                        : ""
                    }
                  `}
                >
                  {day.date.getDate()}
                </span>
                {day.holidayName && (
                  <span className="text-[8px] md:text-[9px] font-medium text-red-600 truncate max-w-[60px] md:max-w-[80px]">
                    {day.holidayName}
                  </span>
                )}
              </div>

              {/* Todo Bars */}
              <div className="w-full flex flex-col gap-0.5 overflow-hidden">
                {/* モバイル(縦・横): 1件のみ表示、デスクトップ: 2件表示 */}
                {day.todos.slice(0, 1).map((todo) => (
                  <div
                    key={todo.id}
                    className={`
                      md:hidden w-full px-1 py-0.5 rounded text-[8px] truncate font-medium leading-tight
                      ${
                        todo.completed
                          ? "bg-slate-100 text-slate-400 line-through decoration-slate-400"
                          : "bg-pink-100 text-pink-700 border-l-[1px] border-primary"
                      }
                    `}
                    title={todo.text}
                  >
                    {todo.text}
                  </div>
                ))}
                {day.todos.slice(0, 2).map((todo) => (
                  <div
                    key={todo.id}
                    className={`
                      hidden md:block w-full px-1.5 py-0.5 rounded text-[10px] truncate font-medium leading-tight
                      ${
                        todo.completed
                          ? "bg-slate-100 text-slate-400 line-through decoration-slate-400"
                          : "bg-pink-100 text-pink-700 border-l-2 border-primary"
                      }
                    `}
                    title={todo.text}
                  >
                    {todo.text}
                  </div>
                ))}

                {/* Overflow Indicator - モバイル(縦・横) */}
                {day.todos.length > 1 && (
                  <div className="md:hidden text-[8px] text-slate-400 px-1 font-medium">
                    +{day.todos.length - 1}
                  </div>
                )}

                {/* Overflow Indicator - デスクトップ */}
                {day.todos.length > 2 && (
                  <div className="hidden md:block text-[10px] text-slate-400 px-1 font-medium">
                    +{day.todos.length - 2} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Calendar;

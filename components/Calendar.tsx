import React, { useMemo, useState, useRef, useEffect } from "react";
import { WEEKDAYS } from "../constants";
import { DayData, TodoItem, DateColor } from "../types";
import { getHolidayName, isWeekend } from "../utils/holidays";

interface CalendarProps {
  currentDate: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onMonthChange: (offset: number) => void;
  onDateChange?: (year: number, month: number) => void;
  onDeleteMonthTodos: () => void;
  todos: TodoItem[];
  dateColors?: DateColor[];
}

const Calendar: React.FC<CalendarProps> = ({
  currentDate,
  selectedDate,
  onSelectDate,
  onMonthChange,
  onDateChange,
  onDeleteMonthTodos,
  todos,
  dateColors = [],
}) => {
  const [showYearMonthPicker, setShowYearMonthPicker] = useState(false);
  const [tempSelectedYear, setTempSelectedYear] = useState<number | null>(null);
  const [tempSelectedMonth, setTempSelectedMonth] = useState<number | null>(null);
  const yearScrollRef = useRef<HTMLDivElement>(null);
  const monthScrollRef = useRef<HTMLDivElement>(null);
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

  // モーダルを開くときに一時選択をリセット
  const handleOpenPicker = () => {
    setTempSelectedYear(currentDate.getFullYear());
    setTempSelectedMonth(currentDate.getMonth() + 1);
    setShowYearMonthPicker(true);
  };

  // モーダルが開いた時に現在の年月を中央にスクロール
  useEffect(() => {
    if (showYearMonthPicker) {
      // 年を中央にスクロール
      setTimeout(() => {
        if (yearScrollRef.current) {
          const currentYear = currentDate.getFullYear();
          const yearIndex = years.indexOf(currentYear);
          if (yearIndex !== -1) {
            const yearButton = yearScrollRef.current.children[yearIndex] as HTMLElement;
            if (yearButton) {
              const containerHeight = yearScrollRef.current.clientHeight;
              const buttonHeight = yearButton.offsetHeight;
              const scrollPosition = yearButton.offsetTop - (containerHeight / 2) + (buttonHeight / 2);
              yearScrollRef.current.scrollTop = scrollPosition;
            }
          }
        }
      }, 10);

      // 月を中央にスクロール
      setTimeout(() => {
        if (monthScrollRef.current) {
          const currentMonth = currentDate.getMonth() + 1;
          const monthIndex = currentMonth - 1;
          if (monthIndex >= 0 && monthIndex < months.length) {
            const monthButton = monthScrollRef.current.children[monthIndex] as HTMLElement;
            if (monthButton) {
              const containerHeight = monthScrollRef.current.clientHeight;
              const buttonHeight = monthButton.offsetHeight;
              const scrollPosition = monthButton.offsetTop - (containerHeight / 2) + (buttonHeight / 2);
              monthScrollRef.current.scrollTop = scrollPosition;
            }
          }
        }
      }, 10);
    }
  }, [showYearMonthPicker]);

  // 年を一時選択
  const handleYearClick = (year: number) => {
    setTempSelectedYear(year);
  };

  // 月を一時選択
  const handleMonthClick = (month: number) => {
    setTempSelectedMonth(month);
  };

  // 現在の年月に戻る
  const handleGoToToday = () => {
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    setTempSelectedYear(todayYear);
    setTempSelectedMonth(todayMonth);
    
    if (onDateChange) {
      onDateChange(todayYear, today.getMonth());
    } else {
      // フォールバック: 現在の日付に移動
      const newDate = new Date();
      newDate.setFullYear(todayYear);
      newDate.setMonth(today.getMonth());
      onMonthChange(0); // 強制的に更新
    }
    setShowYearMonthPicker(false);
  };

  // 確定ボタンで年月を確定
  const handleConfirm = () => {
    if (tempSelectedYear !== null && tempSelectedMonth !== null) {
      if (onDateChange) {
        onDateChange(tempSelectedYear, tempSelectedMonth - 1);
      } else {
        // フォールバック: 現在の日付から新しい年月に移動
        const newDate = new Date(currentDate);
        newDate.setFullYear(tempSelectedYear);
        newDate.setMonth(tempSelectedMonth - 1);
        onMonthChange(0); // 強制的に更新
      }
      setShowYearMonthPicker(false);
    }
  };

  // キャンセル
  const handleCancel = () => {
    setTempSelectedYear(null);
    setTempSelectedMonth(null);
    setShowYearMonthPicker(false);
  };

  // 年のリストを生成（現在の年±10年）
  const currentYear = currentDate.getFullYear();
  const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm p-2 sm:p-4 min-h-[600px] md:h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 sm:mb-4 px-1 sm:px-2 shrink-0">
        <div className="relative">
          <button
            onClick={handleOpenPicker}
            className="text-xl sm:text-2xl font-bold text-slate-800 flex items-baseline gap-1 sm:gap-2 hover:text-primary transition-colors cursor-pointer"
            title="年月を選択"
          >
            {currentDate.getFullYear()}年
            <span className="text-primary text-2xl sm:text-3xl">
              {currentDate.getMonth() + 1}月
            </span>
          </button>

          {/* 年月選択モーダル */}
          {showYearMonthPicker && (
            <>
              {/* オーバーレイ */}
              <div
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
                onClick={handleCancel}
              />
              {/* モーダル */}
              <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 p-4 min-w-[200px] sm:min-w-[240px] max-w-[90vw]">
                <div className="flex gap-4 mb-4">
                  {/* 年選択 */}
                  <div className="flex-1">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-700 mb-2 text-center">年</h3>
                    <div 
                      ref={yearScrollRef}
                      className="h-[240px] overflow-y-auto border border-slate-200 rounded-lg"
                    >
                      {years.map((year) => (
                        <button
                          key={year}
                          onClick={() => handleYearClick(year)}
                          className={`w-full px-3 py-2 text-sm font-medium transition-colors border-b border-slate-100 last:border-b-0 ${
                            year === (tempSelectedYear ?? currentDate.getFullYear())
                              ? "bg-primary text-white"
                              : "bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100"
                          }`}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 月選択 */}
                  <div className="flex-1">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-700 mb-2 text-center">月</h3>
                    <div 
                      ref={monthScrollRef}
                      className="h-[240px] overflow-y-auto border border-slate-200 rounded-lg"
                    >
                      {months.map((month) => (
                        <button
                          key={month}
                          onClick={() => handleMonthClick(month)}
                          className={`w-full px-3 py-2 text-sm font-medium transition-colors border-b border-slate-100 last:border-b-0 ${
                            month === (tempSelectedMonth ?? currentDate.getMonth() + 1)
                              ? "bg-primary text-white"
                              : "bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100"
                          }`}
                        >
                          {month}月
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* 現在・確定・キャンセルボタン */}
                <div className="flex gap-2 pt-3 border-t border-slate-200">
                  <button
                    onClick={handleGoToToday}
                    className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                    title="今日の年月に戻る"
                  >
                    現在
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={tempSelectedYear === null || tempSelectedMonth === null}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-pink-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    確定
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
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
          const dateColor = dateColors.find((dc) => dc.dateStr === day.dateStr);

          const colorBgClass = dateColor
            ? dateColor.color === "red"
              ? "bg-red-100"
              : dateColor.color === "yellow"
              ? "bg-yellow-100"
              : dateColor.color === "blue"
              ? "bg-blue-100"
              : dateColor.color === "green"
              ? "bg-green-100"
              : dateColor.color === "purple"
              ? "bg-purple-100"
              : ""
            : "";

          const baseBgClass = colorBgClass
            ? colorBgClass
            : !day.isCurrentMonth
            ? "bg-slate-50"
            : day.isHoliday
            ? "bg-red-50"
            : day.isWeekend
            ? "bg-blue-50"
            : "bg-white";

          const textClass = !day.isCurrentMonth
            ? "text-slate-400"
            : day.isHoliday
            ? "text-red-700"
            : day.isWeekend
            ? "text-blue-700"
            : "text-slate-700";

          return (
            <button
              key={`${day.dateStr}-${idx}`}
              onClick={() => onSelectDate(day.date)}
              className={`
                relative flex flex-col items-start justify-start p-0.5 md:p-1 text-left transition-colors
                ${baseBgClass} ${textClass}
                ${isDaySelected ? "ring-2 ring-pink-300" : "hover:bg-slate-50"}
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
                {!day.holidayName && dateColor?.label && (
                  <span className="text-[8px] md:text-[9px] font-medium text-slate-500 truncate max-w-[60px] md:max-w-[80px]">
                    {dateColor.label}
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

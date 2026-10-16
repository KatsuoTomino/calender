/**
 * Calendar month cursor pinned to the 1st.
 *
 * Date#setMonth keeps the current day-of-month. When that day does not exist
 * in the target month, the Date overflows into the following month
 * (Jan 31 + 1 month → Mar 3, Oct 31 → September stays in October).
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/setMonth
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/Date
 */

/** First local day of the month `offset` months away from `date`. */
export function shiftCalendarMonth(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

/** First local day of `monthIndex` (0-based) in `year`. */
export function calendarMonthDate(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex, 1);
}

export interface User {
  id: string;
  name: string;
  role: 'husband' | 'wife' | 'partner';
  avatarColor: string;
  avatarImageUrl?: string; // R2に保存されたアバター画像のキー
}

export type TodoType = 'daily' | 'important' | 'shopping';

export interface TodoItem {
  id: string;
  dateStr: string; // YYYY-MM-DD または 'important' | 'shopping' | 'monthly'
  text: string;
  completed: boolean;
  createdBy: string; // User ID
  imageUrls?: string[]; // R2に保存された画像のキー配列（オプション）
  /** Google Calendar event id (kept even when Gカレ is unchecked) */
  googleEventId?: string | null;
  /** Gカレ checkbox — true means already exported / skip next export */
  googleChecked?: boolean;
}

export interface DayData {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  dateStr: string;
  todos: TodoItem[];
  isHoliday?: boolean;
  holidayName?: string | null;
  isWeekend?: boolean;
}

export type DateColorType = 'red' | 'yellow' | 'blue' | 'green' | 'purple' | null;

export interface DateColor {
  id: string;
  dateStr: string;
  color: DateColorType;
  label?: string | null;
  createdBy: string;
}

export enum GeminiAction {
  SUGGEST_TASKS = 'SUGGEST_TASKS',
  ENCOURAGE = 'ENCOURAGE'
}
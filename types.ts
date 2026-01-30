export interface User {
  id: string;
  name: string;
  role: 'husband' | 'wife' | 'partner';
  avatarColor: string;
}

export type TodoType = 'daily' | 'important' | 'shopping';

export interface TodoItem {
  id: string;
  dateStr: string; // YYYY-MM-DD または 'important' | 'shopping'
  text: string;
  completed: boolean;
  createdBy: string; // User ID
  imageUrls?: string[]; // R2に保存された画像のキー配列（オプション）
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

export enum GeminiAction {
  SUGGEST_TASKS = 'SUGGEST_TASKS',
  ENCOURAGE = 'ENCOURAGE'
}
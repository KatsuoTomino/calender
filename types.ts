export interface User {
  id: string;
  name: string;
  role: 'husband' | 'wife' | 'partner';
  avatarColor: string;
}

export interface TodoItem {
  id: string;
  dateStr: string; // YYYY-MM-DD
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
}

export enum GeminiAction {
  SUGGEST_TASKS = 'SUGGEST_TASKS',
  ENCOURAGE = 'ENCOURAGE'
}
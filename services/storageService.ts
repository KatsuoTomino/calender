import { TodoItem, User } from '../types';
import { STORAGE_KEYS } from '../constants';

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export const getStoredUser = (): User | null => {
  return safeParse<User | null>(localStorage.getItem(STORAGE_KEYS.USER), null);
};

export const saveUser = (user: User): void => {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
};

export const getStoredTodos = (): TodoItem[] => {
  return safeParse<TodoItem[]>(localStorage.getItem(STORAGE_KEYS.TODOS), []);
};

export const saveTodos = (todos: TodoItem[]): void => {
  localStorage.setItem(STORAGE_KEYS.TODOS, JSON.stringify(todos));
};

export const generateId = (): string => {
  return crypto.randomUUID();
};

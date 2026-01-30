import { TodoItem, User } from '../types';
import { STORAGE_KEYS } from '../constants';

export const getStoredUser = (): User | null => {
  const stored = localStorage.getItem(STORAGE_KEYS.USER);
  return stored ? JSON.parse(stored) : null;
};

export const saveUser = (user: User): void => {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
};

export const getStoredTodos = (): TodoItem[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.TODOS);
  return stored ? JSON.parse(stored) : [];
};

export const saveTodos = (todos: TodoItem[]): void => {
  localStorage.setItem(STORAGE_KEYS.TODOS, JSON.stringify(todos));
};

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};
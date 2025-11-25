import React, { useState, useRef, useEffect } from "react";
import { TodoItem, User } from "../types";
import { generateId } from "../services/storageService";
import {
  generateSubtasks,
  generateEncouragement,
} from "../services/geminiService";
import Button from "./Button";

interface TodoListProps {
  date: Date;
  todos: TodoItem[];
  onAddTodo: (todo: TodoItem) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  currentUser: User;
  onClose: () => void;
}

const TodoList: React.FC<TodoListProps> = ({
  date,
  todos,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  currentUser,
  onClose,
}) => {
  const [newTodoText, setNewTodoText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [encouragement, setEncouragement] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Helper to format date as YYYY-MM-DD in local timezone
  const formatLocalDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    setEncouragement(null);
  }, [date]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;

    const newItem: TodoItem = {
      id: generateId(),
      dateStr: formatLocalDate(date),
      text: newTodoText,
      completed: false,
      createdBy: currentUser.id,
    };

    onAddTodo(newItem);
    setNewTodoText("");
  };

  const handleGeminiSuggest = async () => {
    if (!newTodoText.trim()) return;
    setIsThinking(true);

    // First add the main task
    const mainTask: TodoItem = {
      id: generateId(),
      dateStr: formatLocalDate(date),
      text: newTodoText,
      completed: false,
      createdBy: currentUser.id,
    };
    onAddTodo(mainTask);

    // Then get suggestions
    const suggestions = await generateSubtasks(newTodoText);

    suggestions.forEach((text) => {
      onAddTodo({
        id: generateId(),
        dateStr: formatLocalDate(date),
        text: `  ↳ ${text}`, // Indent visually
        completed: false,
        createdBy: currentUser.id,
      });
    });

    setNewTodoText("");
    setIsThinking(false);
  };

  const handleCheck = async (id: string) => {
    onToggleTodo(id);
    const completedCount = todos.filter((t) => t.completed).length + 1;
    // 1 in 5 chance to get praise, or if it's the 5th completed task
    if (completedCount > 0 && completedCount % 3 === 0) {
      const msg = await generateEncouragement(completedCount, currentUser.name);
      setEncouragement(msg);
      setTimeout(() => setEncouragement(null), 5000);
    }
  };

  const sortedTodos = [...todos].sort((a, b) => {
    if (a.completed === b.completed) return 0;
    return a.completed ? 1 : -1;
  });

  return (
    <div className="h-full flex flex-col bg-white md:rounded-3xl md:shadow-sm overflow-hidden border-l md:border-none border-slate-100">
      {/* Header */}
      <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-gradient-to-r from-white to-pink-50/30">
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            {date.getMonth() + 1}月{date.getDate()}日の予定
          </h3>
          <p className="text-xs text-slate-400">
            {todos.filter((t) => !t.completed).length} tasks remaining
          </p>
        </div>
        <button onClick={onClose} className="md:hidden p-2 text-slate-400">
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        {sortedTodos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-60">
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            <p>予定はありません</p>
          </div>
        ) : (
          sortedTodos.map((todo) => (
            <div
              key={todo.id}
              className={`group flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
                todo.completed
                  ? "bg-slate-50 border-slate-100 opacity-60"
                  : "bg-white border-slate-100 shadow-sm hover:border-pink-200"
              }`}
            >
              <button
                onClick={() => handleCheck(todo.id)}
                className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  todo.completed
                    ? "bg-secondary border-secondary"
                    : "border-slate-300 hover:border-secondary"
                }`}
              >
                {todo.completed && (
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
              <span
                className={`flex-1 text-sm ${
                  todo.completed
                    ? "line-through text-slate-400"
                    : "text-slate-700"
                }`}
              >
                {todo.text}
              </span>
              <button
                onClick={() => onDeleteTodo(todo.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-red-300 hover:text-red-500 transition-opacity"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Encouragement Toast */}
      {encouragement && (
        <div className="absolute top-20 right-4 left-4 md:left-auto md:w-72 bg-secondary text-white p-3 rounded-xl shadow-xl animate-bounce text-center text-sm z-50">
          ✨ {encouragement}
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-100">
        <form onSubmit={handleAdd} className="relative">
          <input
            ref={inputRef}
            type="text"
            className="w-full pl-4 pr-24 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-pink-100 text-sm"
            placeholder="新しいタスク..."
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
          />
          <div className="absolute right-1 top-1 bottom-1 flex gap-1">
            {newTodoText && (
              <button
                type="button"
                onClick={handleGeminiSuggest}
                disabled={isThinking}
                className="bg-purple-100 text-purple-600 hover:bg-purple-200 px-3 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                title="AI Suggest Subtasks"
              >
                {isThinking ? (
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  <>
                    <span>AI</span>
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </>
                )}
              </button>
            )}
            <button
              type="submit"
              disabled={!newTodoText.trim()}
              className="bg-primary text-white px-4 rounded-lg font-bold text-lg hover:bg-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
        </form>
        <p className="text-[10px] text-slate-400 mt-2 text-center">
          AIボタンを押すと、タスクを細分化して提案します
        </p>
      </div>
    </div>
  );
};

export default TodoList;

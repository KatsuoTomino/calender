import React, { useState, useRef, useEffect } from "react";
import { Habit, User } from "../types";

interface HabitsListProps {
  habits: Habit[];
  currentUser: User;
  onAddHabit: (text: string) => void;
  onUpdateHabit: (id: string, text: string) => void;
  onDeleteHabit: (id: string) => void;
  onClose: () => void;
}

const linkifyText = (text: string): React.ReactNode[] => {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = urlPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const url = match[0];
    parts.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

const HabitsList: React.FC<HabitsListProps> = ({
  habits,
  onAddHabit,
  onUpdateHabit,
  onDeleteHabit,
  onClose,
}) => {
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newText.trim();
    if (!trimmed) return;
    onAddHabit(trimmed);
    setNewText("");
  };

  const startEdit = (habit: Habit) => {
    setEditingId(habit.id);
    setEditingText(habit.text);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const trimmed = editingText.trim();
    if (trimmed) {
      onUpdateHabit(editingId, trimmed);
    }
    setEditingId(null);
    setEditingText("");
  };

  return (
    <div className="h-full flex flex-col bg-white md:rounded-3xl shadow-sm overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-50 bg-gradient-to-r from-white to-emerald-50/40 shrink-0">
        <div className="flex justify-between items-center gap-2">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-slate-800">
              毎日やるタスク
            </h3>
            <p className="text-xs text-slate-400">
              追加した日から、日ごとの詳細に表示されます（{habits.length}件）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            aria-label="閉じる"
          >
            <svg
              className="w-5 h-5"
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
      </div>

      <div className="p-4 bg-white border-b border-slate-100 shrink-0">
        <form onSubmit={handleAdd} className="relative">
          <input
            ref={inputRef}
            type="text"
            className="w-full pl-4 pr-14 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-emerald-100 text-sm"
            placeholder="例: ストレッチ https://..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            className="absolute right-1 top-1 bottom-1 bg-emerald-500 text-white px-4 rounded-lg font-bold text-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            +
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        {habits.length === 0 ? (
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <p>毎日やるタスクはまだありません</p>
          </div>
        ) : (
          habits.map((habit) => (
            <div
              key={habit.id}
              className="group flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-white shadow-sm hover:border-emerald-200 transition-all"
            >
              <div className="flex-1 min-w-0">
                {editingId === habit.id ? (
                  <input
                    ref={editRef}
                    type="text"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setEditingText("");
                      }
                    }}
                    className="w-full px-2 py-1 text-sm border border-emerald-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(habit)}
                    className="text-sm text-slate-700 text-left w-full"
                    title="タップして編集"
                  >
                    {linkifyText(habit.text)}
                  </button>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  {habit.startDate} から表示
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDeleteHabit(habit.id)}
                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-red-300 hover:text-red-500 transition-opacity shrink-0"
                aria-label="削除"
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
    </div>
  );
};

export default HabitsList;

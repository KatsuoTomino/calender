import React, { useState, useEffect, useRef } from "react";
import { User, TodoItem, DateColor, DateColorType } from "./types";
import { saveUser, getStoredUser } from "./services/storageService";
import {
  fetchTodos,
  addTodo,
  toggleTodo,
  deleteTodo,
  deleteMonthTodos,
  subscribeTodoChanges,
  updateTodoImages,
} from "./services/todoService";
import {
  getCurrentUser,
  onAuthStateChange,
  signOut,
  toAppUser,
} from "./services/authService";
import { deleteImageFromR2, uploadAvatarToR2, getImageUrl, getAvatarFromR2 } from "./services/r2Service";
import { fetchDateColors, setDateColor, setDateLabel, subscribeDateColorChanges } from "./services/dateColorService";
import { logger } from "./services/logger";
import {
  consumeGoogleOAuthRedirect,
  migrateLocalGoogleMarksToDatabase,
  resumePendingGoogleExport,
} from "./services/googleCalendarService";
import Login from "./components/Login";
import Calendar from "./components/Calendar";
import TodoList from "./components/TodoList";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date()); // For Month navigation
  const [selectedDate, setSelectedDate] = useState(new Date()); // For Todo selection
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [showTodoPanel, setShowTodoPanel] = useState(false); // For mobile toggle
  const [showImportantPanel, setShowImportantPanel] = useState(false); // 重要なことパネル
  const [showShoppingPanel, setShowShoppingPanel] = useState(false); // 買い物リストパネル
  const [showMonthTasksPanel, setShowMonthTasksPanel] = useState(false); // 月のタスクパネル（お金）
  const [showMonthSchedulePanel, setShowMonthSchedulePanel] = useState(false); // 表示月の日付タスク一覧
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null); // アバター画像の表示用URL
  const [dateColors, setDateColors] = useState<DateColor[]>([]);
  const [googleFlash, setGoogleFlash] = useState<string | null>(null);
  const googleResumeRef = useRef(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // 認証状態の監視
  useEffect(() => {
    // 現在のユーザーを確認
    checkCurrentUser();

    // 認証状態の変更を監視
    const { data: authListener } = onAuthStateChange(async (authUser) => {
      if (authUser) {
        // 既存のユーザー情報を読み込む（アバター画像を含む）
        const storedUser = getStoredUser();
        const appUser = toAppUser(authUser, storedUser);
        setUser(appUser);
        saveUser(appUser);
        
        try {
          const avatarUrl = await getAvatarFromR2(appUser.id);
          if (avatarUrl) {
            setAvatarImageUrl(avatarUrl);
          } else if (appUser.avatarImageUrl) {
            const fallbackUrl = await getImageUrl(appUser.avatarImageUrl);
            setAvatarImageUrl(fallbackUrl);
          } else {
            setAvatarImageUrl(null);
          }
        } catch (error) {
          logger.error("アバター画像の読み込みエラー:", error);
          setAvatarImageUrl(null);
        }
      } else {
        localStorage.removeItem("kizuna_user");
        setUser(null);
        setTodos([]);
        setAvatarImageUrl(null);
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // ユーザーがログインしている場合、Todoを読み込む
  useEffect(() => {
    if (user) {
      loadTodos();

      const loadAvatarImage = async () => {
        if (!user?.id) {
          setAvatarImageUrl(null);
          return;
        }
        try {
          const url = await getAvatarFromR2(user.id);
          if (url) {
            setAvatarImageUrl(url);
          } else if (user.avatarImageUrl) {
            const fallbackUrl = await getImageUrl(user.avatarImageUrl);
            setAvatarImageUrl(fallbackUrl);
          } else {
            setAvatarImageUrl(null);
          }
        } catch (error) {
          logger.error("アバター画像の読み込みエラー:", error);
          setAvatarImageUrl(null);
        }
      };
      loadAvatarImage();

      // date colorsを読み込む
      loadDateColors();

      // リアルタイム更新を購読
      const todoChannel = subscribeTodoChanges((updatedTodos) => {
        setTodos(updatedTodos);
      });
      const dateColorChannel = subscribeDateColorChanges((updatedColors) => {
        setDateColors(updatedColors);
      });

      return () => {
        todoChannel.unsubscribe();
        dateColorChannel.unsubscribe();
      };
    }
  }, [user]);

  // Mobile Google OAuth returns here with #access_token=...
  useEffect(() => {
    if (!user || googleResumeRef.current) return;
    googleResumeRef.current = true;

    const redirected = consumeGoogleOAuthRedirect();
    if (redirected.error && redirected.error !== "interaction_required") {
      setGoogleFlash(
        redirected.error === "redirect_uri_mismatch"
          ? "Google Cloud の「承認済みのリダイレクト URI」にこのサイトのURLを追加してください"
          : "Google認証がキャンセルされたか、失敗しました"
      );
      return;
    }
    if (!redirected.ok) return;

    void (async () => {
      try {
        const result = await resumePendingGoogleExport();
        await loadTodos();
        if (result) {
          if (result.created > 0) {
            setGoogleFlash(`Gカレに ${result.created}件追加しました`);
          } else if (result.failed > 0) {
            setGoogleFlash(result.errors[0] || "Gカレへの追加に失敗しました");
          } else {
            setGoogleFlash("Gカレへ追加済みです");
          }
        } else {
          setGoogleFlash("Google連携できました。もう一度 Gカレ を押してください");
        }
      } catch (error) {
        logger.error("Google OAuth resume error:", error);
        setGoogleFlash(
          error instanceof Error
            ? error.message
            : "Google連携の再開に失敗しました"
        );
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!googleFlash) return;
    const timer = window.setTimeout(() => setGoogleFlash(null), 5000);
    return () => window.clearTimeout(timer);
  }, [googleFlash]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!user) {
      alert("ログインが必要です");
      return;
    }

    const file = files[0];

    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("画像のサイズは10MB以下にしてください");
      return;
    }

    try {
      const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      for (const ext of extensions) {
        try { await deleteImageFromR2(`users/${user.id}/avatar.${ext}`); } catch { /* ignore */ }
      }
      if (user.avatarImageUrl) {
        try { await deleteImageFromR2(user.avatarImageUrl); } catch { /* ignore */ }
      }

      const uploadedKey = await uploadAvatarToR2(file, user.id);
      if (!uploadedKey) {
        alert("画像のアップロードに失敗しました。R2の設定を確認してください。");
        return;
      }

      const updatedUser: User = { ...user, avatarImageUrl: uploadedKey };
      setUser(updatedUser);
      saveUser(updatedUser);

      const displayUrl = await getAvatarFromR2(user.id);
      if (displayUrl) {
        setAvatarImageUrl(displayUrl);
        alert("アバター画像を更新しました");
      } else {
        const fallbackUrl = await getImageUrl(uploadedKey);
        if (fallbackUrl) {
          setAvatarImageUrl(fallbackUrl);
          alert("アバター画像を更新しました");
        } else {
          alert("アバター画像をアップロードしましたが、表示に問題がある可能性があります。ページをリロードしてください。");
        }
      }
    } catch (error) {
      logger.error("アバター画像アップロードエラー:", error);
      alert(`画像のアップロードに失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`);
    }

    if (avatarFileInputRef.current) {
      avatarFileInputRef.current.value = "";
    }
  };

  const checkCurrentUser = async () => {
    const authUser = await getCurrentUser();
    if (authUser) {
      // 既存のユーザー情報を読み込む（アバター画像を含む）
      const storedUser = getStoredUser();
      const appUser = toAppUser(authUser, storedUser);
      setUser(appUser);
      saveUser(appUser);
    }
  };

  const loadTodos = async () => {
    const data = await fetchTodos();
    await migrateLocalGoogleMarksToDatabase(data);
    const refreshed = await fetchTodos();
    setTodos(refreshed);
  };

  const loadDateColors = async () => {
    const colors = await fetchDateColors();
    setDateColors(colors);
  };

  const handleSetDateColor = async (dateStr: string, color: DateColorType) => {
    if (!user) return;

    // 楽観的更新
    setDateColors((prev) => {
      const existing = prev.find((dc) => dc.dateStr === dateStr);
      if (color === null) {
        // React state arrays should be updated immutably:
        // https://react.dev/learn/updating-arrays-in-state
        if (existing?.label) {
          return prev.map((dc) =>
            dc.dateStr === dateStr ? { ...dc, color: null } : dc
          );
        }
        return prev.filter((dc) => dc.dateStr !== dateStr);
      }
      if (existing) {
        return prev.map((dc) =>
          dc.dateStr === dateStr ? { ...dc, color } : dc
        );
      }
      return [...prev, { id: crypto.randomUUID(), dateStr, color, createdBy: user.id }];
    });

    const success = await setDateColor(dateStr, color, user.id);
    if (!success) {
      await loadDateColors();
    }
  };

  const handleSetDateLabel = async (dateStr: string, label: string | null) => {
    if (!user) return;

    setDateColors((prev) => {
      const existing = prev.find((dc) => dc.dateStr === dateStr);
      const trimmed = label?.trim() || null;
      if (existing) {
        if (!trimmed && !existing.color) {
          return prev.filter((dc) => dc.dateStr !== dateStr);
        }
        return prev.map((dc) =>
          dc.dateStr === dateStr ? { ...dc, label: trimmed } : dc
        );
      }
      if (!trimmed) return prev;
      return [...prev, { id: crypto.randomUUID(), dateStr, color: null, label: trimmed, createdBy: user.id }];
    });

    const success = await setDateLabel(dateStr, label, user.id);
    if (!success) {
      await loadDateColors();
    }
  };

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    saveUser(newUser);
  };

  const handleLogout = async () => {
    setUser(null);
    setTodos([]);
    setAvatarImageUrl(null);
    localStorage.removeItem("kizuna_user");
    try {
      await Promise.race([
        signOut(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
      ]);
    } catch (error) {
      logger.error("ログアウトエラー:", error);
    }
  };

  const handleMonthChange = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const handleDateChange = (year: number, month: number) => {
    const newDate = new Date(currentDate);
    newDate.setFullYear(year);
    newDate.setMonth(month);
    setCurrentDate(newDate);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    // If month is different, update calendar view
    if (date.getMonth() !== currentDate.getMonth()) {
      setCurrentDate(date);
    }
    setShowTodoPanel(true);
  };

  const handleAddTodo = async (todo: TodoItem) => {
    // 楽観的更新（すぐにUIに反映）
    setTodos((prev) => [...prev, todo]);

    // Supabaseに追加
    const success = await addTodo(todo);
    if (!success) {
      // 失敗したら元に戻す
      setTodos((prev) => prev.filter((t) => t.id !== todo.id));
      alert("Todoの追加に失敗しました");
    }
  };

  const handleToggleTodo = async (id: string) => {
    // 現在の状態を取得
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    // 楽観的更新
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );

    // Supabaseで更新
    const success = await toggleTodo(id, !todo.completed);
    if (!success) {
      // 失敗したら元に戻す
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed: todo.completed } : t))
      );
      alert("Todoの更新に失敗しました");
    }
  };

  const handleDeleteTodo = async (id: string) => {
    // 楽観的更新
    const deletedTodo = todos.find((t) => t.id === id);
    setTodos((prev) => prev.filter((t) => t.id !== id));

    // Supabaseで削除
    const success = await deleteTodo(id);
    if (!success && deletedTodo) {
      // 失敗したら元に戻す
      setTodos((prev) => [...prev, deletedTodo]);
      alert("Todoの削除に失敗しました");
    }
  };

  const handleGoogleMarkChange = (
    id: string,
    mark: { googleEventId?: string | null; googleChecked: boolean }
  ) => {
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              googleChecked: mark.googleChecked,
              googleEventId:
                mark.googleEventId === undefined
                  ? t.googleEventId
                  : mark.googleEventId,
            }
          : t
      )
    );
  };

  const handleUpdateTodoImages = async (id: string, imageUrls: string[] | null) => {
    // 楽観的更新
    const originalTodo = todos.find((t) => t.id === id);
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, imageUrls: imageUrls || undefined } : t))
    );

    // Supabaseで更新
    const success = await updateTodoImages(id, imageUrls);
    if (!success && originalTodo) {
      // 失敗したら元に戻す
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? originalTodo : t))
      );
      alert("画像の更新に失敗しました");
    }
  };

  const handleDeleteMonthTodos = async () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    const monthTodos = todos.filter((todo) => {
      const todoDate = new Date(todo.dateStr);
      return (
        todoDate.getFullYear() === year &&
        todoDate.getMonth() === currentDate.getMonth()
      );
    });

    if (monthTodos.length === 0) {
      alert(`${year}年${month}月のTodoはありません`);
      return;
    }

    // 画像が含まれるTodoの数を確認
    const todosWithImages = monthTodos.filter(
      (todo) => todo.imageUrls && todo.imageUrls.length > 0
    );
    const totalImages = monthTodos.reduce(
      (sum, todo) => sum + (todo.imageUrls?.length || 0),
      0
    );

    const confirmMessage =
      totalImages > 0
        ? `${year}年${month}月のTodo（${monthTodos.length}件、画像${totalImages}枚）を全て削除しますか？\n\nこの操作は取り消せません。`
        : `${year}年${month}月のTodo（${monthTodos.length}件）を全て削除しますか？\n\nこの操作は取り消せません。`;

    if (!confirm(confirmMessage)) {
      return;
    }

    // 楽観的更新
    setTodos((prev) =>
      prev.filter((t) => !monthTodos.find((mt) => mt.id === t.id))
    );

    if (totalImages > 0) {
      for (const todo of todosWithImages) {
        if (todo.imageUrls) {
          for (const imageKey of todo.imageUrls) {
            try { await deleteImageFromR2(imageKey); } catch { /* ignore */ }
          }
        }
      }
    }

    const success = await deleteMonthTodos(year, month);
    if (!success) {
      setTodos((prev) => [...prev, ...monthTodos]);
      alert("月のTodo削除に失敗しました");
    }
  };

  // Filter todos for selected date (use local timezone)
  const formatLocalDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const selectedDateStr = formatLocalDate(selectedDate);
  const dayTodos = todos.filter((t) => t.dateStr === selectedDateStr);
  const importantTodos = todos.filter((t) => t.dateStr === 'important');
  const shoppingTodos = todos.filter((t) => t.dateStr === 'shopping');
  const monthTodos = todos.filter((t) => t.dateStr === 'monthly');
  const calendarMonthTodos = todos.filter((todo) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(todo.dateStr)) return false;
    const [y, m] = todo.dateStr.split("-").map(Number);
    return (
      y === currentDate.getFullYear() && m === currentDate.getMonth() + 1
    );
  });

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col overflow-hidden relative">
      {googleFlash && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] px-4 py-3 rounded-lg shadow-lg bg-slate-800 text-white text-sm">
          {googleFlash}
        </div>
      )}
      {/* App Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 flex justify-between items-center z-20 shrink-0 gap-2 overflow-hidden">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <input
            type="file"
            accept="image/*"
            ref={avatarFileInputRef}
            onChange={handleAvatarUpload}
            className="hidden"
          />
          <button
            onClick={() => avatarFileInputRef.current?.click()}
            className="relative w-8 h-8 rounded-full shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
            title="アバター画像を変更"
          >
            {avatarImageUrl ? (
              <img
                src={avatarImageUrl}
                alt={user.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className={`w-full h-full ${user.avatarColor} flex items-center justify-center text-white font-bold text-xs`}
              >
                {user.name.charAt(0)}
              </div>
            )}
          </button>
          <div className="flex gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setShowImportantPanel(true)}
              className="relative px-2 py-1 sm:px-3 sm:py-1.5 text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm flex items-center justify-center shrink-0 min-w-[32px] sm:min-w-[36px]"
              title="重要なこと"
            >
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {importantTodos.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-white/90 text-red-600 px-1 sm:px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold min-w-[16px] text-center">
                  {importantTodos.filter(t => !t.completed).length}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowMonthTasksPanel(true)}
              className="relative px-2 py-1 sm:px-3 sm:py-1.5 text-white bg-yellow-500 hover:bg-yellow-600 rounded-lg transition-colors shadow-sm flex items-center justify-center shrink-0 min-w-[32px] sm:min-w-[36px]"
              title="月のタスク管理"
            >
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
              </svg>
              {monthTodos.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-white/90 text-yellow-600 px-1 sm:px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold min-w-[16px] text-center">
                  {monthTodos.filter(t => !t.completed).length}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowShoppingPanel(true)}
              className="relative px-2 py-1 sm:px-3 sm:py-1.5 text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors shadow-sm flex items-center justify-center shrink-0 min-w-[32px] sm:min-w-[36px]"
              title="買い物リスト"
            >
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              {shoppingTodos.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-white/90 text-blue-600 px-1 sm:px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold min-w-[16px] text-center">
                  {shoppingTodos.filter(t => !t.completed).length}
                </span>
              )}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleLogout();
          }}
          className="relative z-30 text-xs text-slate-400 hover:text-slate-600 underline ml-4 shrink-0"
        >
          ログアウト
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col md:flex-row overflow-auto relative p-2 gap-4 md:max-w-7xl md:mx-auto w-full">
        {/* Calendar Section */}
        <div className="flex-1 w-full md:h-full md:min-h-0">
            <Calendar
            currentDate={currentDate}
            selectedDate={selectedDate}
            onSelectDate={handleDateSelect}
            onMonthChange={handleMonthChange}
            onDateChange={handleDateChange}
            onDeleteMonthTodos={handleDeleteMonthTodos}
            onOpenMonthSchedule={() => setShowMonthSchedulePanel(true)}
            todos={todos}
            dateColors={dateColors}
            onSetDateLabel={handleSetDateLabel}
          />
        </div>

        {/* Todo Section - Desktop (Side by Side) */}
        <div className="hidden md:block w-80 lg:w-96 h-full shrink-0">
            <TodoList
              date={selectedDate}
              todos={dayTodos}
              onAddTodo={handleAddTodo}
              onToggleTodo={handleToggleTodo}
              onDeleteTodo={handleDeleteTodo}
              onUpdateTodoImages={handleUpdateTodoImages}
              onGoogleMarkChange={handleGoogleMarkChange}
              currentUser={user}
              onClose={() => setShowTodoPanel(false)}
              dateColors={dateColors}
              onSetDateColor={handleSetDateColor}
              onSetDateLabel={handleSetDateLabel}
            />
        </div>

        {/* Todo Section - Mobile (Slide Over / Modal) */}
        <div
          className={`
            md:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-200
            ${
              showTodoPanel
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }
          `}
          onClick={() => setShowTodoPanel(false)}
        >
          <div
            className={`
              absolute right-0 top-0 bottom-0 w-4/5 max-w-sm bg-white shadow-2xl 
              transform transition-transform duration-200 ease-out will-change-transform
              ${showTodoPanel ? "translate-x-0" : "translate-x-full"}
            `}
            onClick={(e) => e.stopPropagation()}
          >
            <TodoList
              date={selectedDate}
              todos={dayTodos}
              onAddTodo={handleAddTodo}
              onToggleTodo={handleToggleTodo}
              onDeleteTodo={handleDeleteTodo}
              onUpdateTodoImages={handleUpdateTodoImages}
              onGoogleMarkChange={handleGoogleMarkChange}
              currentUser={user}
              onClose={() => setShowTodoPanel(false)}
              dateColors={dateColors}
              onSetDateColor={handleSetDateColor}
              onSetDateLabel={handleSetDateLabel}
            />
          </div>
        </div>

        {/* 重要なことパネル - Desktop */}
        {showImportantPanel && (
          <div 
            className="hidden md:block fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowImportantPanel(false)}
          >
            <div 
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <TodoList
                dateStr="important"
                title="重要なこと"
                todos={importantTodos}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
                onUpdateTodoImages={handleUpdateTodoImages}
              onGoogleMarkChange={handleGoogleMarkChange}
                currentUser={user}
                onClose={() => setShowImportantPanel(false)}
              />
            </div>
          </div>
        )}

        {/* 重要なことパネル - Mobile */}
        {showImportantPanel && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm">
            <div className="absolute inset-0 bg-white shadow-2xl flex flex-col overflow-hidden">
              <TodoList
                dateStr="important"
                title="重要なこと"
                todos={importantTodos}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
                onUpdateTodoImages={handleUpdateTodoImages}
              onGoogleMarkChange={handleGoogleMarkChange}
                currentUser={user}
                onClose={() => setShowImportantPanel(false)}
              />
            </div>
          </div>
        )}

        {/* 買い物リストパネル - Desktop */}
        {showShoppingPanel && (
          <div 
            className="hidden md:block fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowShoppingPanel(false)}
          >
            <div 
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <TodoList
                dateStr="shopping"
                title="買い物リスト"
                todos={shoppingTodos}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
                onUpdateTodoImages={handleUpdateTodoImages}
              onGoogleMarkChange={handleGoogleMarkChange}
                currentUser={user}
                onClose={() => setShowShoppingPanel(false)}
              />
            </div>
          </div>
        )}

        {/* 買い物リストパネル - Mobile */}
        {showShoppingPanel && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm">
            <div className="absolute inset-0 bg-white shadow-2xl flex flex-col overflow-hidden">
              <TodoList
                dateStr="shopping"
                title="買い物リスト"
                todos={shoppingTodos}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
                onUpdateTodoImages={handleUpdateTodoImages}
              onGoogleMarkChange={handleGoogleMarkChange}
                currentUser={user}
                onClose={() => setShowShoppingPanel(false)}
              />
            </div>
          </div>
        )}

        {/* 月のタスクパネル - Desktop */}
        {showMonthTasksPanel && (
          <div 
            className="hidden md:block fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowMonthTasksPanel(false)}
          >
            <div 
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <TodoList
                dateStr="monthly"
                title="お金の管理"
                todos={monthTodos}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
                onUpdateTodoImages={handleUpdateTodoImages}
              onGoogleMarkChange={handleGoogleMarkChange}
                currentUser={user}
                onClose={() => setShowMonthTasksPanel(false)}
              />
            </div>
          </div>
        )}

        {/* 月のタスクパネル - Mobile */}
        {showMonthTasksPanel && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm">
            <div className="absolute inset-0 bg-white shadow-2xl flex flex-col overflow-hidden">
              <TodoList
                dateStr="monthly"
                title="お金の管理"
                todos={monthTodos}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
                onUpdateTodoImages={handleUpdateTodoImages}
              onGoogleMarkChange={handleGoogleMarkChange}
                currentUser={user}
                onClose={() => setShowMonthTasksPanel(false)}
              />
            </div>
          </div>
        )}

        {/* 表示月の日付タスク一覧 - Desktop */}
        {showMonthSchedulePanel && (
          <div
            className="hidden md:block fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowMonthSchedulePanel(false)}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <TodoList
                title={`${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月の予定`}
                todos={calendarMonthTodos}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
                onUpdateTodoImages={handleUpdateTodoImages}
              onGoogleMarkChange={handleGoogleMarkChange}
                currentUser={user}
                onClose={() => setShowMonthSchedulePanel(false)}
                dateColors={dateColors}
                showGoogleExport
                googleImportMonth={{
                  year: currentDate.getFullYear(),
                  month: currentDate.getMonth() + 1,
                }}
                hideAddForm
                showTodoDates
              />
            </div>
          </div>
        )}

        {/* 表示月の日付タスク一覧 - Mobile */}
        {showMonthSchedulePanel && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm">
            <div className="absolute inset-0 bg-white shadow-2xl flex flex-col overflow-hidden">
              <TodoList
                title={`${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月の予定`}
                todos={calendarMonthTodos}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
                onUpdateTodoImages={handleUpdateTodoImages}
              onGoogleMarkChange={handleGoogleMarkChange}
                currentUser={user}
                onClose={() => setShowMonthSchedulePanel(false)}
                dateColors={dateColors}
                showGoogleExport
                googleImportMonth={{
                  year: currentDate.getFullYear(),
                  month: currentDate.getMonth() + 1,
                }}
                hideAddForm
                showTodoDates
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

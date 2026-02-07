import React, { useState, useEffect, useRef } from "react";
import { User, TodoItem } from "./types";
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
} from "./services/authService";
import { deleteImageFromR2, uploadAvatarToR2, getImageUrl } from "./services/r2Service";
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
  const [showMonthTasksPanel, setShowMonthTasksPanel] = useState(false); // 月のタスクパネル
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null); // アバター画像の表示用URL
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
        const appUser: User = {
          id: authUser.id,
          name: authUser.user_metadata?.name || "ユーザー",
          role: storedUser?.role || "partner",
          avatarColor: storedUser?.avatarColor || "bg-purple-500",
          avatarImageUrl: storedUser?.avatarImageUrl,
        };
        setUser(appUser);
        saveUser(appUser);
      } else {
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

      // アバター画像を読み込む
      const loadAvatarImage = async () => {
        if (!user.avatarImageUrl) {
          setAvatarImageUrl(null);
          return;
        }

        try {
          const url = await getImageUrl(user.avatarImageUrl);
          setAvatarImageUrl(url);
        } catch (error) {
          console.error("アバター画像の読み込みエラー:", error);
          setAvatarImageUrl(null);
        }
      };
      loadAvatarImage();

      // リアルタイム更新を購読
      const channel = subscribeTodoChanges((updatedTodos) => {
        setTodos(updatedTodos);
      });

      return () => {
        channel.unsubscribe();
      };
    }
  }, [user]);

  // アバター画像をアップロード
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("📸 アバター画像アップロード開始");
    const files = e.target.files;
    
    if (!files || files.length === 0) {
      console.log("⚠️ ファイルが選択されていません");
      return;
    }
    
    if (!user) {
      console.error("❌ ユーザーがログインしていません");
      alert("ログインが必要です");
      return;
    }

    const file = files[0];
    console.log("📁 選択されたファイル:", file.name, "サイズ:", file.size, "タイプ:", file.type);
    
    // 画像ファイルかチェック
    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください");
      return;
    }
    
    // ファイルサイズチェック（5MB制限）
    if (file.size > 5 * 1024 * 1024) {
      alert("画像のサイズは5MB以下にしてください");
      return;
    }

    try {
      console.log("🔄 古いアバター画像を削除中...");
      // 古いアバター画像を削除
      if (user.avatarImageUrl) {
        await deleteImageFromR2(user.avatarImageUrl);
      }

      console.log("📤 R2にアップロード中...");
      // R2にアップロード
      const uploadedKey = await uploadAvatarToR2(file, user.id);
      if (!uploadedKey) {
        console.error("❌ アップロードに失敗しました");
        alert("画像のアップロードに失敗しました。R2の設定を確認してください。");
        return;
      }

      console.log("✅ アップロード成功:", uploadedKey);

      // ユーザー情報を更新
      const updatedUser: User = {
        ...user,
        avatarImageUrl: uploadedKey,
      };
      setUser(updatedUser);
      saveUser(updatedUser);
      console.log("💾 ユーザー情報を保存しました");

      // 表示用URLを取得
      console.log("🖼️ 表示用URLを取得中...");
      const displayUrl = await getImageUrl(uploadedKey);
      if (displayUrl) {
        setAvatarImageUrl(displayUrl);
        console.log("✅ アバター画像を更新しました");
        alert("アバター画像を更新しました");
      } else {
        console.warn("⚠️ 表示用URLの取得に失敗しましたが、アップロードは成功しています");
        alert("アバター画像をアップロードしましたが、表示に問題がある可能性があります");
      }
    } catch (error) {
      console.error("❌ アバター画像アップロードエラー:", error);
      alert(`画像のアップロードに失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`);
    }

    // ファイル入力のリセット
    if (avatarFileInputRef.current) {
      avatarFileInputRef.current.value = "";
    }
  };

  const checkCurrentUser = async () => {
    const authUser = await getCurrentUser();
    if (authUser) {
      // 既存のユーザー情報を読み込む（アバター画像を含む）
      const storedUser = getStoredUser();
      const appUser: User = {
        id: authUser.id,
        name: authUser.user_metadata?.name || "ユーザー",
        role: storedUser?.role || "partner",
        avatarColor: storedUser?.avatarColor || "bg-purple-500",
        avatarImageUrl: storedUser?.avatarImageUrl,
      };
      setUser(appUser);
      saveUser(appUser);
    }
  };

  const loadTodos = async () => {
    const todos = await fetchTodos();
    setTodos(todos);
  };

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    saveUser(newUser);
  };

  const handleLogout = async () => {
    await signOut();
    localStorage.removeItem("kizuna_user");
    setUser(null);
    setTodos([]);
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

    // R2から画像を削除
    if (totalImages > 0) {
      console.log(`🗑️ 月の削除に伴い、${totalImages}枚の画像をR2から削除中...`);
      for (const todo of todosWithImages) {
        if (todo.imageUrls && todo.imageUrls.length > 0) {
          for (const imageKey of todo.imageUrls) {
            try {
              const deleted = await deleteImageFromR2(imageKey);
              if (deleted) {
                console.log("✅ R2からの画像削除成功:", imageKey);
              } else {
                console.warn("⚠️ R2からの画像削除に失敗:", imageKey);
              }
            } catch (error) {
              console.error("❌ R2からの画像削除エラー:", error);
            }
          }
        }
      }
    }

    // Supabaseで一括削除
    const success = await deleteMonthTodos(year, month);
    if (!success) {
      // 失敗したら元に戻す
      setTodos((prev) => [...prev, ...monthTodos]);
      alert("月のTodo削除に失敗しました");
    } else {
      console.log("✅ 月のTodo削除完了");
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

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col overflow-hidden relative">
      {/* App Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 flex justify-between items-center z-20 shrink-0">
        <div className="flex items-center gap-3 flex-1">
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
          onClick={handleLogout}
          className="text-xs text-slate-400 hover:text-slate-600 underline ml-4 shrink-0"
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
            todos={todos}
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
              currentUser={user}
              onClose={() => setShowTodoPanel(false)}
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
              currentUser={user}
              onClose={() => setShowTodoPanel(false)}
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
                title="月のタスク"
                todos={monthTodos}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
                onUpdateTodoImages={handleUpdateTodoImages}
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
                title="月のタスク"
                todos={monthTodos}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
                onUpdateTodoImages={handleUpdateTodoImages}
                currentUser={user}
                onClose={() => setShowMonthTasksPanel(false)}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

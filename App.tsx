import React, { useState, useEffect } from "react";
import { User, TodoItem } from "./types";
import { saveUser } from "./services/storageService";
import {
  fetchTodos,
  addTodo,
  toggleTodo,
  deleteTodo,
  deleteMonthTodos,
  subscribeTodoChanges,
} from "./services/todoService";
import {
  getCurrentUser,
  onAuthStateChange,
  signOut,
} from "./services/authService";
import Login from "./components/Login";
import Calendar from "./components/Calendar";
import TodoList from "./components/TodoList";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date()); // For Month navigation
  const [selectedDate, setSelectedDate] = useState(new Date()); // For Todo selection
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [showTodoPanel, setShowTodoPanel] = useState(false); // For mobile toggle

  // 認証状態の監視
  useEffect(() => {
    // 現在のユーザーを確認
    checkCurrentUser();

    // 認証状態の変更を監視
    const { data: authListener } = onAuthStateChange(async (authUser) => {
      if (authUser) {
        const appUser: User = {
          id: authUser.id,
          name: authUser.user_metadata?.name || "ユーザー",
          role: "partner",
          avatarColor: "bg-purple-500",
        };
        setUser(appUser);
        saveUser(appUser);
      } else {
        setUser(null);
        setTodos([]);
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

      // リアルタイム更新を購読
      const channel = subscribeTodoChanges((updatedTodos) => {
        setTodos(updatedTodos);
      });

      return () => {
        channel.unsubscribe();
      };
    }
  }, [user]);

  const checkCurrentUser = async () => {
    const authUser = await getCurrentUser();
    if (authUser) {
      const appUser: User = {
        id: authUser.id,
        name: authUser.user_metadata?.name || "ユーザー",
        role: "partner",
        avatarColor: "bg-purple-500",
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

    if (
      !confirm(
        `${year}年${month}月のTodo（${monthTodos.length}件）を全て削除しますか？\n\nこの操作は取り消せません。`
      )
    ) {
      return;
    }

    // 楽観的更新
    setTodos((prev) =>
      prev.filter((t) => !monthTodos.find((mt) => mt.id === t.id))
    );

    // Supabaseで一括削除
    const success = await deleteMonthTodos(year, month);
    if (!success) {
      // 失敗したら元に戻す
      setTodos((prev) => [...prev, ...monthTodos]);
      alert("月のTodo削除に失敗しました");
    }
  };

  // Filter todos for selected date
  const selectedDateStr = selectedDate.toISOString().split("T")[0];
  const dayTodos = todos.filter((t) => t.dateStr === selectedDateStr);

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col overflow-hidden relative">
      {/* App Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 flex justify-between items-center z-20 h-16 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full ${user.avatarColor} flex items-center justify-center text-white font-bold text-xs`}
          >
            {user.name.charAt(0)}
          </div>
          <div>
            <h1 className="font-bold text-slate-700 text-sm sm:text-base">
              Kizuna Calendar
            </h1>
            <p className="text-[10px] text-slate-500">
              Welcome back, {user.name}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          ログアウト
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative p-2 sm:p-4 gap-4 max-w-7xl mx-auto w-full">
        {/* Calendar Section */}
        <div className="flex-1 h-full transition-all duration-300 ease-in-out">
          <Calendar
            currentDate={currentDate}
            selectedDate={selectedDate}
            onSelectDate={handleDateSelect}
            onMonthChange={handleMonthChange}
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
            currentUser={user}
            onClose={() => setShowTodoPanel(false)}
          />
        </div>

        {/* Todo Section - Mobile (Slide Over / Modal) */}
        <div
          className={`
            md:hidden absolute inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300
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
              absolute right-0 top-0 bottom-0 w-4/5 max-w-sm bg-white shadow-2xl transform transition-transform duration-300
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
              currentUser={user}
              onClose={() => setShowTodoPanel(false)}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;

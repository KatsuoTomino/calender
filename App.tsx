import React, { useState, useEffect } from 'react';
import { User, TodoItem } from './types';
import { getStoredUser, saveUser, getStoredTodos, saveTodos } from './services/storageService';
import Login from './components/Login';
import Calendar from './components/Calendar';
import TodoList from './components/TodoList';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date()); // For Month navigation
  const [selectedDate, setSelectedDate] = useState(new Date()); // For Todo selection
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [showTodoPanel, setShowTodoPanel] = useState(false); // For mobile toggle

  // Initial Load
  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser) setUser(storedUser);
    const storedTodos = getStoredTodos();
    setTodos(storedTodos);
  }, []);

  // Persistence
  useEffect(() => {
    if (todos.length > 0) saveTodos(todos);
  }, [todos]);

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    saveUser(newUser);
  };

  const handleLogout = () => {
      localStorage.removeItem('kizuna_user');
      setUser(null);
  }

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

  const handleAddTodo = (todo: TodoItem) => {
    setTodos(prev => [...prev, todo]);
  };

  const handleToggleTodo = (id: string) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const handleDeleteTodo = (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
  };

  // Filter todos for selected date
  const selectedDateStr = selectedDate.toISOString().split('T')[0];
  const dayTodos = todos.filter(t => t.dateStr === selectedDateStr);

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col overflow-hidden relative">
      {/* App Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 flex justify-between items-center z-20 h-16 shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full ${user.avatarColor} flex items-center justify-center text-white font-bold text-xs`}>
            {user.name.charAt(0)}
          </div>
          <div>
            <h1 className="font-bold text-slate-700 text-sm sm:text-base">Kizuna Calendar</h1>
            <p className="text-[10px] text-slate-500">Welcome back, {user.name}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-slate-600 underline">
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
            ${showTodoPanel ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
          `}
          onClick={() => setShowTodoPanel(false)}
        >
          <div 
            className={`
              absolute right-0 top-0 bottom-0 w-4/5 max-w-sm bg-white shadow-2xl transform transition-transform duration-300
              ${showTodoPanel ? 'translate-x-0' : 'translate-x-full'}
            `}
            onClick={e => e.stopPropagation()}
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
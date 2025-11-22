import React, { useState } from 'react';
import { User } from '../types';
import Button from './Button';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!userId.trim() || !password.trim()) {
        setError('IDとパスワードを入力してください');
        return;
    }

    // Note: In a real application, you would verify credentials against a backend here.
    // For this demo, we create a deterministic user based on the input ID.
    
    // Generate a consistent color based on userId hash
    const colors = ['bg-pink-500', 'bg-blue-500', 'bg-teal-500', 'bg-purple-500', 'bg-indigo-500', 'bg-orange-500'];
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const color = colors[hash % colors.length];

    // Create user object
    const user: User = {
      id: userId,
      name: userId, // Use ID as the display name
      role: 'partner', // Default role since we removed the selector
      avatarColor: color,
    };
    
    onLogin(user);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-pink-50 to-teal-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-100 text-primary text-3xl mb-4">
            🗓️
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Kizuna Calendar</h1>
          <p className="text-slate-500 mt-2 text-sm">IDとパスワードでログイン</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">ユーザーID</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-2 focus:ring-pink-100 outline-none transition-all text-slate-700 placeholder:text-slate-300"
              placeholder="example_user"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-2 focus:ring-pink-100 outline-none transition-all text-slate-700 placeholder:text-slate-300"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg animate-pulse">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full py-3 text-lg shadow-lg shadow-pink-200/50 mt-4">
            ログイン
          </Button>
        </form>
        
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400 leading-relaxed">
            初めての方も、お好きなIDとパスワードを入力すれば<br/>
            自動的に新しいアカウントとして開始できます。
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
import React, { useState } from "react";
import { User } from "../types";
import { signInWithEmail } from "../services/authService";
import Button from "./Button";

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!userId.trim() || !password.trim()) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }

    // Supabase Authで認証
    const { user: authUser, error: authError } = await signInWithEmail(
      userId,
      password
    );

    if (authError || !authUser) {
      setError("メールアドレスまたはパスワードが間違っています");
      return;
    }

    // アプリケーション用のユーザーオブジェクトを作成
    const user: User = {
      id: authUser.id,
      name: authUser.user_metadata?.name || "管理者",
      role: "partner",
      avatarColor: "bg-purple-500",
    };

    onLogin(user);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-pink-50 to-teal-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img
              src="/image/family.png"
              alt="Family"
              className="w-32 h-32 object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Tomy's Calendar</h1>
          <p className="text-slate-500 mt-2 text-sm">
            認証済みユーザー専用ログイン
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-2 focus:ring-pink-100 outline-none transition-all text-slate-700 placeholder:text-slate-300"
              placeholder="admin@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-2 focus:ring-pink-100 outline-none transition-all text-slate-700 placeholder:text-slate-300"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg animate-pulse">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full py-3 text-lg shadow-lg shadow-pink-200/50 mt-4"
          >
            ログイン
          </Button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400 leading-relaxed">
            登録済みのユーザーのみがログインできます
            <br />
            セキュアな認証システムで保護されています
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

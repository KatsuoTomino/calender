import { supabase } from "./supabaseClient";
import { User as SupabaseUser } from "@supabase/supabase-js";

// 管理者でログイン
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ user: SupabaseUser | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error };
    }

    return { user: data.user, error: null };
  } catch (err) {
    return {
      user: null,
      error: err instanceof Error ? err : new Error("不明なエラー"),
    };
  }
}

// 管理者ユーザーを作成（初回のみ実行）
export async function createAdminUser(
  email: string,
  password: string,
  name: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // Supabase Authでユーザーを作成
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role: "admin",
        },
      },
    });

    if (authError) {
      return { success: false, error: authError };
    }

    if (!authData.user) {
      return { success: false, error: new Error("ユーザー作成に失敗") };
    }

    // usersテーブルにも登録（既にauth.usersに作成されている）
    const { error: dbError } = await supabase.from("users").insert({
      id: authData.user.id,
      name,
      role: "partner",
      avatar_color: "bg-purple-500",
    });

    if (dbError && dbError.code !== "23505") {
      // 23505は重複エラー（既に存在する場合は無視）
      console.error("usersテーブルへの追加エラー:", dbError);
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error("不明なエラー"),
    };
  }
}

// ログアウト
export async function signOut(): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.auth.signOut();
    return { error };
  } catch (err) {
    return {
      error: err instanceof Error ? err : new Error("不明なエラー"),
    };
  }
}

// 現在のユーザーを取得
export async function getCurrentUser(): Promise<SupabaseUser | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch (err) {
    console.error("ユーザー取得エラー:", err);
    return null;
  }
}

// 認証状態の変更を監視
export function onAuthStateChange(
  callback: (user: SupabaseUser | null) => void
) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null);
  });
}

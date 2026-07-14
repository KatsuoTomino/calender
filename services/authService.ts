import { supabase } from "./supabaseClient";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { logger } from "./logger";

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
    logger.error("ユーザー取得エラー:", err);
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

import { supabase } from "./supabaseClient";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { User } from "../types";
import { logger } from "./logger";

/** Build the in-app profile. Never reuse another account's stored profile. */
export function toAppUser(
  authUser: SupabaseUser,
  storedUser: User | null
): User {
  const sameUser = storedUser?.id === authUser.id;
  const metaName =
    typeof authUser.user_metadata?.name === "string"
      ? authUser.user_metadata.name.trim()
      : "";
  const emailName = authUser.email?.split("@")[0]?.trim() || "";

  return {
    id: authUser.id,
    name: metaName || (sameUser ? storedUser?.name : "") || emailName || "ユーザー",
    role: (sameUser && storedUser?.role) || "partner",
    avatarColor:
      (sameUser && storedUser?.avatarColor) || "bg-purple-500",
    avatarImageUrl: sameUser ? storedUser?.avatarImageUrl : undefined,
  };
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ user: SupabaseUser | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
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
    const { error } = await supabase.auth.signOut({ scope: "local" });
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

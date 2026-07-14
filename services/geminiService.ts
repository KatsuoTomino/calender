import { supabase } from "./supabaseClient";

async function getAuthHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token || ""}`,
  };
}

/**
 * タスク名からサブタスクを生成
 */
export const generateSubtasks = async (
  taskName: string
): Promise<string[]> => {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/gemini/subtasks", {
      method: "POST",
      headers,
      body: JSON.stringify({ taskName }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    return data.subtasks || [];
  } catch (error) {
    console.error("Gemini subtasks error:", error);
    return [];
  }
};

/**
 * 完了タスク数に応じた応援メッセージを生成
 */
export const generateEncouragement = async (
  completedCount: number,
  partnerName: string
): Promise<string> => {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/gemini/encouragement", {
      method: "POST",
      headers,
      body: JSON.stringify({ completedCount, partnerName }),
    });

    if (!res.ok) return "お疲れ様！";

    const data = await res.json();
    return data.message || "お疲れ様でした！";
  } catch (error) {
    console.error("Gemini encouragement error:", error);
    return "今日も頑張ったね！";
  }
};

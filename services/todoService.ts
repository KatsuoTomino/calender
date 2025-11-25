import { supabase } from "./supabaseClient";
import { TodoItem } from "../types";

// TodoをSupabaseから取得
export async function fetchTodos(): Promise<TodoItem[]> {
  try {
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Todoの取得エラー:", error);
      return [];
    }

    // データベースのカラム名をアプリの型に変換
    return (data || []).map((todo) => ({
      id: todo.id,
      dateStr: todo.date_str,
      text: todo.text,
      completed: todo.completed,
      createdBy: todo.created_by,
    }));
  } catch (err) {
    console.error("予期しないエラー:", err);
    return [];
  }
}

// Todoを追加
export async function addTodo(todo: TodoItem): Promise<boolean> {
  try {
    const insertData = {
      id: todo.id,
      date_str: todo.dateStr,
      text: todo.text,
      completed: todo.completed,
      created_by: todo.createdBy,
    };

    const { error } = await supabase.from("todos").insert(insertData).select();

    if (error) {
      console.error("Todoの追加エラー:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return false;
  }
}

// Todoの完了状態を切り替え
export async function toggleTodo(
  id: string,
  completed: boolean
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("todos")
      .update({
        completed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Todoの更新エラー:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return false;
  }
}

// Todoを削除
export async function deleteTodo(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("todos").delete().eq("id", id);

    if (error) {
      console.error("Todoの削除エラー:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return false;
  }
}

// 月のTodoを一括削除
export async function deleteMonthTodos(
  year: number,
  month: number
): Promise<boolean> {
  try {
    // 月の最初の日と最後の日を計算
    const startDate = new Date(year, month - 1, 1); // month は 1-12
    const endDate = new Date(year, month, 0); // 月の最後の日

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    console.log(
      `🗑️ ${year}年${month}月のTodoを削除中... (${startDateStr} ~ ${endDateStr})`
    );

    const { error } = await supabase
      .from("todos")
      .delete()
      .gte("date_str", startDateStr)
      .lte("date_str", endDateStr);

    if (error) {
      console.error("❌ 月のTodo削除エラー:", error);
      return false;
    }

    console.log("✅ 月のTodo削除成功");
    return true;
  } catch (err) {
    console.error("❌ 予期しないエラー:", err);
    return false;
  }
}

// リアルタイム更新を購読
export function subscribeTodoChanges(callback: (todos: TodoItem[]) => void) {
  const channel = supabase
    .channel("todos-changes")
    .on(
      "postgres_changes",
      {
        event: "*", // INSERT, UPDATE, DELETE全て
        schema: "public",
        table: "todos",
      },
      async () => {
        // 変更があったら全てのTodoを再取得
        const todos = await fetchTodos();
        callback(todos);
      }
    )
    .subscribe();

  return channel;
}

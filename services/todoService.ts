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
    return (data || []).map((todo) => {
      // image_urlを配列に変換（既存の文字列データとの互換性を保つ）
      let imageUrls: string[] | undefined = undefined;
      if (todo.image_url) {
        if (typeof todo.image_url === "string") {
          // 既存の文字列データの場合は配列に変換
          try {
            // JSON文字列の可能性をチェック
            const parsed = JSON.parse(todo.image_url);
            imageUrls = Array.isArray(parsed) ? parsed : [todo.image_url];
          } catch {
            // JSONでない場合は単一の文字列として扱う
            imageUrls = [todo.image_url];
          }
        } else if (Array.isArray(todo.image_url)) {
          imageUrls = todo.image_url;
        }
      }

      return {
        id: todo.id,
        dateStr: todo.date_str,
        text: todo.text,
        completed: todo.completed,
        createdBy: todo.created_by,
        imageUrls,
      };
    });
  } catch (err) {
    console.error("予期しないエラー:", err);
    return [];
  }
}

// Todoを追加
export async function addTodo(todo: TodoItem): Promise<boolean> {
  try {
    const insertData: any = {
      id: todo.id,
      date_str: todo.dateStr,
      text: todo.text,
      completed: todo.completed,
      created_by: todo.createdBy,
    };

    // imageUrlsがある場合は追加（JSON配列として保存）
    if (todo.imageUrls && todo.imageUrls.length > 0) {
      insertData.image_url = JSON.stringify(todo.imageUrls);
    }

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

// Todoの画像を更新（配列全体を更新）
export async function updateTodoImages(
  id: string,
  imageUrls: string[] | null
): Promise<boolean> {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (imageUrls === null || imageUrls.length === 0) {
      // 画像を全て削除
      updateData.image_url = null;
    } else {
      // 画像配列をJSON文字列として保存
      updateData.image_url = JSON.stringify(imageUrls);
    }

    const { data, error } = await supabase
      .from("todos")
      .update(updateData)
      .eq("id", id)
      .select("id");

    if (error) {
      console.error("Todo画像の更新エラー:", error);
      return false;
    }

    return (data || []).length === 1;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return false;
  }
}

// Todoを削除
export async function deleteTodo(id: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("todos")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) {
      console.error("Todoの削除エラー:", error);
      return false;
    }

    return (data || []).length === 1;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return false;
  }
}

// 月のTodoを一括削除
export async function deleteMonthTodos(todoIds: string[]): Promise<boolean> {
  try {
    if (todoIds.length === 0) {
      return true;
    }

    console.log(`🗑️ ${todoIds.length}件のTodoを削除中...`);

    const { data, error } = await supabase
      .from("todos")
      .delete()
      .in("id", todoIds)
      .select("id");

    if (error) {
      console.error("❌ 月のTodo削除エラー:", error);
      return false;
    }

    const deletedCount = (data || []).length;
    if (deletedCount !== todoIds.length) {
      console.error(`❌ 月のTodo削除件数が不一致です: expected=${todoIds.length}, actual=${deletedCount}`);
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

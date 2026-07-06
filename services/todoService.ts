import { supabase } from "./supabaseClient";
import { TodoItem } from "../types";

function mapTodoRow(todo: any): TodoItem {
  let imageUrls: string[] | undefined;

  if (todo.image_url) {
    if (typeof todo.image_url === "string") {
      try {
        const parsed = JSON.parse(todo.image_url);
        imageUrls = Array.isArray(parsed) ? parsed : [todo.image_url];
      } catch {
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
}

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

    return (data || []).map(mapTodoRow);
  } catch (err) {
    console.error("予期しないエラー:", err);
    return [];
  }
}

export async function addTodo(todo: TodoItem): Promise<boolean> {
  try {
    const insertData: any = {
      id: todo.id,
      date_str: todo.dateStr,
      text: todo.text,
      completed: todo.completed,
      created_by: todo.createdBy,
    };

    if (todo.imageUrls && todo.imageUrls.length > 0) {
      insertData.image_url = JSON.stringify(todo.imageUrls);
    }

    const { data, error } = await supabase
      .from("todos")
      .insert(insertData)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Todoの追加エラー:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return false;
  }
}

export async function toggleTodo(
  id: string,
  completed: boolean
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("todos")
      .update({
        completed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Todoの更新エラー:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return false;
  }
}

export async function updateTodoImages(
  id: string,
  imageUrls: string[] | null
): Promise<boolean> {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString(),
      image_url:
        imageUrls === null || imageUrls.length === 0
          ? null
          : JSON.stringify(imageUrls),
    };

    const { data, error } = await supabase
      .from("todos")
      .update(updateData)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Todo画像の更新エラー:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return false;
  }
}

export async function deleteTodo(id: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("todos")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Todoの削除エラー:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return false;
  }
}

export async function deleteMonthTodos(
  todoIds: string[]
): Promise<string[] | null> {
  if (todoIds.length === 0) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("todos")
      .delete()
      .in("id", todoIds)
      .select("id");

    if (error) {
      console.error("月のTodo削除エラー:", error);
      return null;
    }

    const deletedIds = (data || []).map((todo) => todo.id as string);

    if (deletedIds.length !== todoIds.length) {
      console.error("一部のTodoを削除できませんでした:", {
        requested: todoIds.length,
        deleted: deletedIds.length,
      });
      return null;
    }

    return deletedIds;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return null;
  }
}

export function subscribeTodoChanges(callback: (todos: TodoItem[]) => void) {
  const channel = supabase
    .channel("todos-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "todos",
      },
      async () => {
        const todos = await fetchTodos();
        callback(todos);
      }
    )
    .subscribe();

  return channel;
}

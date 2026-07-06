import { supabase } from "./supabaseClient";
import { DateColor, DateColorType } from "../types";

export async function fetchDateColors(): Promise<DateColor[]> {
  try {
    const { data, error } = await supabase.from("date_colors").select("*");

    if (error) {
      console.error("DateColorの取得エラー:", error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      dateStr: row.date_str,
      color: row.color as DateColorType,
      label: row.label || null,
      createdBy: row.created_by,
    }));
  } catch (err) {
    console.error("予期しないエラー:", err);
    return [];
  }
}

export async function setDateColor(
  dateStr: string,
  color: DateColorType,
  createdBy: string
): Promise<boolean> {
  try {
    if (color === null) {
      const { data, error: lookupError } = await supabase
        .from("date_colors")
        .select("label")
        .eq("date_str", dateStr)
        .maybeSingle();

      if (lookupError) {
        console.error("DateColor参照エラー:", lookupError);
        return false;
      }

      if (!data) {
        return true;
      }

      if (data.label) {
        const { error } = await supabase
          .from("date_colors")
          .update({ color: null, updated_at: new Date().toISOString() })
          .eq("date_str", dateStr);
        if (error) {
          console.error("DateColor更新エラー:", error);
          return false;
        }
        return true;
      }

      const { error } = await supabase
        .from("date_colors")
        .delete()
        .eq("date_str", dateStr);

      if (error) {
        console.error("DateColor削除エラー:", error);
        return false;
      }
      return true;
    }

    const { error } = await supabase.from("date_colors").upsert(
      {
        date_str: dateStr,
        color,
        created_by: createdBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date_str" }
    );

    if (error) {
      console.error("DateColor更新エラー:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return false;
  }
}

export async function setDateLabel(
  dateStr: string,
  label: string | null,
  createdBy: string
): Promise<boolean> {
  try {
    const trimmed = label?.trim() || null;

    if (!trimmed) {
      const { data, error: lookupError } = await supabase
        .from("date_colors")
        .select("color")
        .eq("date_str", dateStr)
        .maybeSingle();

      if (lookupError) {
        console.error("DateLabel参照エラー:", lookupError);
        return false;
      }

      if (!data) {
        return true;
      }

      if (data.color) {
        const { error } = await supabase
          .from("date_colors")
          .update({ label: null, updated_at: new Date().toISOString() })
          .eq("date_str", dateStr);
        if (error) {
          console.error("DateLabel更新エラー:", error);
          return false;
        }
        return true;
      }

      const { error } = await supabase
        .from("date_colors")
        .delete()
        .eq("date_str", dateStr);
      if (error) {
        console.error("DateLabel削除エラー:", error);
        return false;
      }
      return true;
    }

    const { error } = await supabase.from("date_colors").upsert(
      {
        date_str: dateStr,
        label: trimmed,
        created_by: createdBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date_str" }
    );

    if (error) {
      console.error("DateLabel更新エラー:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("予期しないエラー:", err);
    return false;
  }
}

export function subscribeDateColorChanges(
  callback: (dateColors: DateColor[]) => void
) {
  const channel = supabase
    .channel("date-colors-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "date_colors",
      },
      async () => {
        const dateColors = await fetchDateColors();
        callback(dateColors);
      }
    )
    .subscribe();

  return channel;
}

import { supabase } from "./supabaseClient";
import { DateColor, DateColorType } from "../types";

async function updateOrInsertDateColor(
  dateStr: string,
  values: { color?: DateColorType; label?: string | null },
  createdBy: string
): Promise<boolean> {
  const updatedAt = new Date().toISOString();
  const updateValues = { ...values, updated_at: updatedAt };

  // Supabaseはフィルタ後に`.select()`をつなぐと更新行を返す。
  // 参照: https://supabase.com/docs/reference/javascript/update
  const { data, error } = await supabase
    .from("date_colors")
    .update(updateValues)
    .eq("date_str", dateStr)
    .select("id");

  if (error) {
    console.error("DateColor更新エラー:", error);
    return false;
  }

  if ((data || []).length > 0) {
    return true;
  }

  const { error: insertError } = await supabase.from("date_colors").insert({
    date_str: dateStr,
    color: null,
    label: null,
    created_by: createdBy,
    updated_at: updatedAt,
    ...values,
  });

  if (!insertError) {
    return true;
  }

  if (insertError.code === "23505") {
    const { error: retryError } = await supabase
      .from("date_colors")
      .update(updateValues)
      .eq("date_str", dateStr);

    if (retryError) {
      console.error("DateColor競合後の更新エラー:", retryError);
      return false;
    }
    return true;
  }

  console.error("DateColor追加エラー:", insertError);
  return false;
}

export async function fetchDateColors(): Promise<DateColor[]> {
  try {
    const { data, error } = await supabase
      .from("date_colors")
      .select("*");

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
      // 古い読み取り結果で同時追加されたラベルを消さないよう、削除は条件付きにする。
      const { error: updateError } = await supabase
        .from("date_colors")
        .update({ color: null, updated_at: new Date().toISOString() })
        .eq("date_str", dateStr);

      if (updateError) {
        console.error("DateColor更新エラー:", updateError);
        return false;
      }

      const { error: deleteError } = await supabase
        .from("date_colors")
        .delete()
        .eq("date_str", dateStr)
        .is("color", null)
        .is("label", null);

      if (deleteError) {
        console.error("DateColor削除エラー:", deleteError);
        return false;
      }
      return true;
    }

    return updateOrInsertDateColor(dateStr, { color }, createdBy);
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
    if (!label || label.trim() === "") {
      // 古い読み取り結果で同時追加された背景色を消さないよう、削除は条件付きにする。
      const { error: updateError } = await supabase
        .from("date_colors")
        .update({ label: null, updated_at: new Date().toISOString() })
        .eq("date_str", dateStr);

      if (updateError) {
        console.error("DateLabel更新エラー:", updateError);
        return false;
      }

      const { error: deleteError } = await supabase
        .from("date_colors")
        .delete()
        .eq("date_str", dateStr)
        .is("color", null)
        .is("label", null);

      if (deleteError) {
        console.error("DateLabel削除エラー:", deleteError);
        return false;
      }
      return true;
    }

    return updateOrInsertDateColor(dateStr, { label: label.trim() }, createdBy);
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

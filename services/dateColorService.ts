import { supabase } from "./supabaseClient";
import { DateColor, DateColorType } from "../types";
import { logger } from "./logger";
import { clearDateColorField } from "./dateColorMutations";

export async function fetchDateColors(): Promise<DateColor[]> {
  try {
    const { data, error } = await supabase
      .from("date_colors")
      .select("*");

    if (error) {
      logger.error("DateColorの取得エラー:", error);
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
    logger.error("予期しないエラー:", err);
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
      // Supabase は update/delete に複数フィルターを連結できる:
      // https://supabase.com/docs/reference/javascript/using-filters
      const result = await clearDateColorField(
        () =>
          supabase
            .from("date_colors")
            .update({ color: null, updated_at: new Date().toISOString() })
            .eq("date_str", dateStr),
        () =>
          supabase
            .from("date_colors")
            .delete()
            .eq("date_str", dateStr)
            .is("color", null)
            .is("label", null)
      );

      if (!result.success) {
        logger.error(
          result.failedStep === "update"
            ? "DateColor更新エラー:"
            : "DateColor空レコード削除エラー:",
          result.error
        );
        return false;
      }
      return true;
    }

    const { error } = await supabase
      .from("date_colors")
      .upsert(
        {
          date_str: dateStr,
          color,
          created_by: createdBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "date_str" }
      );

    if (error) {
      logger.error("DateColor更新エラー:", error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error("予期しないエラー:", err);
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
      const result = await clearDateColorField(
        () =>
          supabase
            .from("date_colors")
            .update({ label: null, updated_at: new Date().toISOString() })
            .eq("date_str", dateStr),
        () =>
          supabase
            .from("date_colors")
            .delete()
            .eq("date_str", dateStr)
            .is("color", null)
            .is("label", null)
      );

      if (!result.success) {
        logger.error(
          result.failedStep === "update"
            ? "DateLabel更新エラー:"
            : "DateLabel空レコード削除エラー:",
          result.error
        );
        return false;
      }
      return true;
    }

    const { error } = await supabase
      .from("date_colors")
      .upsert(
        {
          date_str: dateStr,
          label: label.trim(),
          created_by: createdBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "date_str" }
      );

    if (error) {
      logger.error("DateLabel更新エラー:", error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error("予期しないエラー:", err);
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

import { supabase } from "./supabaseClient";
import { Habit, HabitCompletion } from "../types";
import { logger } from "./logger";
import {
  createLatestWriteQueue,
  type LatestWriteResult,
} from "../utils/latestWriteQueue";

function mapHabit(row: {
  id: string;
  text: string;
  start_date: string;
  created_by: string | null;
  sort_order: number | null;
}): Habit {
  return {
    id: row.id,
    text: row.text,
    startDate: row.start_date,
    createdBy: row.created_by || "",
    sortOrder: row.sort_order ?? 0,
  };
}

function mapCompletion(row: {
  id: string;
  habit_id: string;
  date_str: string;
  completed: boolean;
}): HabitCompletion {
  return {
    id: row.id,
    habitId: row.habit_id,
    dateStr: row.date_str,
    completed: Boolean(row.completed),
  };
}

export async function fetchHabits(): Promise<Habit[]> {
  try {
    const { data, error } = await supabase
      .from("habits")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      logger.error("習慣の取得エラー:", error);
      return [];
    }

    return (data || []).map(mapHabit);
  } catch (err) {
    logger.error("予期しないエラー:", err);
    return [];
  }
}

/** null は取得失敗。空配列は「完了記録が無い」であり、失敗と区別する。 */
export async function tryFetchHabitCompletions(): Promise<HabitCompletion[] | null> {
  try {
    const { data, error } = await supabase.from("habit_completions").select("*");

    if (error) {
      logger.error("習慣完了の取得エラー:", error);
      return null;
    }

    return (data || []).map(mapCompletion);
  } catch (err) {
    logger.error("予期しないエラー:", err);
    return null;
  }
}

export async function fetchHabitCompletions(): Promise<HabitCompletion[]> {
  return (await tryFetchHabitCompletions()) ?? [];
}

export async function addHabit(habit: Habit): Promise<boolean> {
  try {
    const { error } = await supabase.from("habits").insert({
      id: habit.id,
      text: habit.text,
      start_date: habit.startDate,
      created_by: habit.createdBy,
      sort_order: habit.sortOrder,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      logger.error("習慣の追加エラー:", error);
      return false;
    }
    return true;
  } catch (err) {
    logger.error("予期しないエラー:", err);
    return false;
  }
}

export async function updateHabitText(
  id: string,
  text: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("habits")
      .update({ text, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      logger.error("習慣の更新エラー:", error);
      return false;
    }
    return true;
  } catch (err) {
    logger.error("予期しないエラー:", err);
    return false;
  }
}

export async function deleteHabit(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("habits").delete().eq("id", id);

    if (error) {
      logger.error("習慣の削除エラー:", error);
      return false;
    }
    return true;
  } catch (err) {
    logger.error("予期しないエラー:", err);
    return false;
  }
}

/**
 * Check on: upsert completed=true.
 * Check off: delete the row (no completion record = not done).
 * Check and uncheck are different requests, so a fast undo must not let the
 * earlier insert land after the delete and resurrect the check.
 */
async function writeHabitCompletion(
  habitId: string,
  dateStr: string,
  completed: boolean
): Promise<boolean> {
  try {
    if (!completed) {
      const { error } = await supabase
        .from("habit_completions")
        .delete()
        .eq("habit_id", habitId)
        .eq("date_str", dateStr);

      if (error) {
        logger.error("習慣完了の解除エラー:", error);
        return false;
      }
      return true;
    }

    const { error } = await supabase.from("habit_completions").upsert(
      {
        habit_id: habitId,
        date_str: dateStr,
        completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "habit_id,date_str" }
    );

    if (error) {
      logger.error("習慣完了の保存エラー:", error);
      return false;
    }
    return true;
  } catch (err) {
    logger.error("予期しないエラー:", err);
    return false;
  }
}

const enqueueHabitCompletion = createLatestWriteQueue<boolean>(
  async (key, completed) => {
    const splitAt = key.indexOf("\0");
    return writeHabitCompletion(
      key.slice(0, splitAt),
      key.slice(splitAt + 1),
      completed
    );
  }
);

export async function setHabitCompletion(
  habitId: string,
  dateStr: string,
  completed: boolean
): Promise<LatestWriteResult> {
  return enqueueHabitCompletion(`${habitId}\0${dateStr}`, completed);
}

export function subscribeHabitChanges(handlers: {
  onHabits: () => void;
  onCompletions: () => void;
}) {
  const channel = supabase
    .channel("habits-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "habits" },
      () => {
        handlers.onHabits();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "habit_completions" },
      () => {
        handlers.onCompletions();
      }
    )
    .subscribe();

  return channel;
}

/** Habits active on a given date (startDate <= dateStr). */
export function habitsForDate(habits: Habit[], dateStr: string): Habit[] {
  return habits.filter((h) => h.startDate <= dateStr);
}

/** Completion rate 0–100 for a date; null if no habits apply. */
export function habitCompletionPercent(
  habits: Habit[],
  completions: HabitCompletion[],
  dateStr: string
): number | null {
  const active = habitsForDate(habits, dateStr);
  if (active.length === 0) return null;

  const done = active.filter((h) =>
    completions.some(
      (c) => c.habitId === h.id && c.dateStr === dateStr && c.completed
    )
  ).length;

  return Math.round((done / active.length) * 100);
}

import type { DateColor, DateColorType } from "../types";

type IdFactory = () => string;

export type ClearDateColorAction = "abort" | "delete-row" | "clear-color";
export type ClearDateLabelAction = "abort" | "delete-row" | "clear-label";

export function getDateColorClearAction(
  lookup: { label?: string | null } | null,
  error: unknown
): ClearDateColorAction {
  if (error) return "abort";
  return lookup?.label ? "clear-color" : "delete-row";
}

export function getDateLabelClearAction(
  lookup: { color?: DateColorType } | null,
  error: unknown
): ClearDateLabelAction {
  if (error) return "abort";
  return lookup?.color ? "clear-label" : "delete-row";
}

export function applyDateColorChange(
  dateColors: readonly DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string,
  createId: IdFactory = () => crypto.randomUUID()
): DateColor[] {
  const existing = dateColors.find((dc) => dc.dateStr === dateStr);

  if (color === null) {
    if (!existing) return [...dateColors];
    if (existing.label) {
      return dateColors.map((dc) =>
        dc.dateStr === dateStr ? { ...dc, color: null } : dc
      );
    }
    return dateColors.filter((dc) => dc.dateStr !== dateStr);
  }

  if (existing) {
    return dateColors.map((dc) =>
      dc.dateStr === dateStr ? { ...dc, color } : dc
    );
  }

  return [...dateColors, { id: createId(), dateStr, color, createdBy }];
}

export function applyDateLabelChange(
  dateColors: readonly DateColor[],
  dateStr: string,
  label: string | null,
  createdBy: string,
  createId: IdFactory = () => crypto.randomUUID()
): DateColor[] {
  const existing = dateColors.find((dc) => dc.dateStr === dateStr);
  const trimmed = label?.trim() || null;

  if (existing) {
    if (!trimmed && !existing.color) {
      return dateColors.filter((dc) => dc.dateStr !== dateStr);
    }
    return dateColors.map((dc) =>
      dc.dateStr === dateStr ? { ...dc, label: trimmed } : dc
    );
  }

  if (!trimmed) return [...dateColors];

  return [
    ...dateColors,
    { id: createId(), dateStr, color: null, label: trimmed, createdBy },
  ];
}

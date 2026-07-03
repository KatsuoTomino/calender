import type { DateColor, DateColorType } from "../types.ts";

export function applyDateColorChange(
  dateColors: DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string,
  id = crypto.randomUUID()
): DateColor[] {
  const existing = dateColors.find((dateColor) => dateColor.dateStr === dateStr);

  if (color === null) {
    if (!existing) return dateColors;
    if (existing.label) {
      return dateColors.map((dateColor) =>
        dateColor.dateStr === dateStr ? { ...dateColor, color: null } : dateColor
      );
    }
    return dateColors.filter((dateColor) => dateColor.dateStr !== dateStr);
  }

  if (existing) {
    return dateColors.map((dateColor) =>
      dateColor.dateStr === dateStr ? { ...dateColor, color } : dateColor
    );
  }

  return [...dateColors, { id, dateStr, color, createdBy }];
}

export function applyDateLabelChange(
  dateColors: DateColor[],
  dateStr: string,
  label: string | null,
  createdBy: string,
  id = crypto.randomUUID()
): DateColor[] {
  const trimmed = label?.trim() || null;
  const existing = dateColors.find((dateColor) => dateColor.dateStr === dateStr);

  if (!existing) {
    return trimmed ? [...dateColors, { id, dateStr, color: null, label: trimmed, createdBy }] : dateColors;
  }

  if (!trimmed && !existing.color) {
    return dateColors.filter((dateColor) => dateColor.dateStr !== dateStr);
  }

  return dateColors.map((dateColor) =>
    dateColor.dateStr === dateStr ? { ...dateColor, label: trimmed } : dateColor
  );
}

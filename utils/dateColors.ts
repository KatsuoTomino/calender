import { DateColor, DateColorType } from "../types";

export function applyDateColorChange(
  dateColors: DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string,
  createId: () => string
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

  return [
    ...dateColors,
    { id: createId(), dateStr, color, createdBy },
  ];
}

export function applyDateLabelChange(
  dateColors: DateColor[],
  dateStr: string,
  label: string | null,
  createdBy: string,
  createId: () => string
): DateColor[] {
  const existing = dateColors.find((dateColor) => dateColor.dateStr === dateStr);
  const trimmed = label?.trim() || null;

  if (existing) {
    if (!trimmed && !existing.color) {
      return dateColors.filter((dateColor) => dateColor.dateStr !== dateStr);
    }

    return dateColors.map((dateColor) =>
      dateColor.dateStr === dateStr ? { ...dateColor, label: trimmed } : dateColor
    );
  }

  if (!trimmed) return dateColors;

  return [
    ...dateColors,
    { id: createId(), dateStr, color: null, label: trimmed, createdBy },
  ];
}

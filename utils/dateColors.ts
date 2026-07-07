import type { DateColor, DateColorType } from "../types";

export function applyDateColorChange(
  dateColors: DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string,
  idFactory: () => string = () => crypto.randomUUID()
): DateColor[] {
  const existing = dateColors.find((dateColor) => dateColor.dateStr === dateStr);

  if (existing) {
    if (color === null && !existing.label) {
      return dateColors.filter((dateColor) => dateColor.dateStr !== dateStr);
    }

    return dateColors.map((dateColor) =>
      dateColor.dateStr === dateStr ? { ...dateColor, color } : dateColor
    );
  }

  if (color === null) {
    return dateColors;
  }

  return [...dateColors, { id: idFactory(), dateStr, color, createdBy }];
}

export function applyDateLabelChange(
  dateColors: DateColor[],
  dateStr: string,
  label: string | null,
  createdBy: string,
  idFactory: () => string = () => crypto.randomUUID()
): DateColor[] {
  const trimmed = label?.trim() || null;
  const existing = dateColors.find((dateColor) => dateColor.dateStr === dateStr);

  if (existing) {
    if (!trimmed && !existing.color) {
      return dateColors.filter((dateColor) => dateColor.dateStr !== dateStr);
    }

    return dateColors.map((dateColor) =>
      dateColor.dateStr === dateStr ? { ...dateColor, label: trimmed } : dateColor
    );
  }

  if (!trimmed) {
    return dateColors;
  }

  return [...dateColors, { id: idFactory(), dateStr, color: null, label: trimmed, createdBy }];
}


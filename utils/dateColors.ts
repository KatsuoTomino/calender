import type { DateColor, DateColorType } from "../types";

export function applyDateColorChange(
  previous: DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string,
  createId: () => string = () => crypto.randomUUID()
): DateColor[] {
  const existing = previous.find((dateColor) => dateColor.dateStr === dateStr);

  if (color === null) {
    if (!existing) return previous;
    if (existing.label) {
      return previous.map((dateColor) =>
        dateColor.dateStr === dateStr ? { ...dateColor, color: null } : dateColor
      );
    }
    return previous.filter((dateColor) => dateColor.dateStr !== dateStr);
  }

  if (existing) {
    return previous.map((dateColor) =>
      dateColor.dateStr === dateStr ? { ...dateColor, color } : dateColor
    );
  }

  return [...previous, { id: createId(), dateStr, color, label: null, createdBy }];
}

export function applyDateLabelChange(
  previous: DateColor[],
  dateStr: string,
  label: string | null,
  createdBy: string,
  createId: () => string = () => crypto.randomUUID()
): DateColor[] {
  const trimmed = label?.trim() || null;
  const existing = previous.find((dateColor) => dateColor.dateStr === dateStr);

  if (existing) {
    if (!trimmed && !existing.color) {
      return previous.filter((dateColor) => dateColor.dateStr !== dateStr);
    }
    return previous.map((dateColor) =>
      dateColor.dateStr === dateStr ? { ...dateColor, label: trimmed } : dateColor
    );
  }

  if (!trimmed) return previous;
  return [...previous, { id: createId(), dateStr, color: null, label: trimmed, createdBy }];
}

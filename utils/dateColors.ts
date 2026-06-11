import type { DateColor, DateColorType } from "../types";

export function applyDateColorUpdate(
  colors: DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string,
  createId: () => string
): DateColor[] {
  const existing = colors.find((dc) => dc.dateStr === dateStr);

  if (color === null) {
    if (existing?.label) {
      return colors.map((dc) => (dc.dateStr === dateStr ? { ...dc, color: null } : dc));
    }
    return colors.filter((dc) => dc.dateStr !== dateStr);
  }

  if (existing) {
    return colors.map((dc) => (dc.dateStr === dateStr ? { ...dc, color } : dc));
  }

  return [...colors, { id: createId(), dateStr, color, createdBy }];
}

export function applyDateLabelUpdate(
  colors: DateColor[],
  dateStr: string,
  label: string | null,
  createdBy: string,
  createId: () => string
): DateColor[] {
  const existing = colors.find((dc) => dc.dateStr === dateStr);
  const trimmed = label?.trim() || null;

  if (existing) {
    if (!trimmed && !existing.color) {
      return colors.filter((dc) => dc.dateStr !== dateStr);
    }
    return colors.map((dc) => (dc.dateStr === dateStr ? { ...dc, label: trimmed } : dc));
  }

  if (!trimmed) return colors;

  return [...colors, { id: createId(), dateStr, color: null, label: trimmed, createdBy }];
}

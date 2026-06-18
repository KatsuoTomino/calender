import type { DateColor, DateColorType } from "../types";

export function applyDateColorChange(
  previous: DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string,
  idFactory: () => string = crypto.randomUUID
): DateColor[] {
  const existing = previous.find((dc) => dc.dateStr === dateStr);
  if (color === null) {
    if (!existing) return previous;
    if (existing.label) {
      return previous.map((dc) => (dc.dateStr === dateStr ? { ...dc, color: null } : dc));
    }
    return previous.filter((dc) => dc.dateStr !== dateStr);
  }

  if (existing) {
    return previous.map((dc) => (dc.dateStr === dateStr ? { ...dc, color } : dc));
  }

  return [...previous, { id: idFactory(), dateStr, color, createdBy }];
}

export function applyDateLabelChange(
  previous: DateColor[],
  dateStr: string,
  label: string | null,
  createdBy: string,
  idFactory: () => string = crypto.randomUUID
): DateColor[] {
  const trimmed = label?.trim() || null;
  const existing = previous.find((dc) => dc.dateStr === dateStr);

  if (existing) {
    if (!trimmed && !existing.color) {
      return previous.filter((dc) => dc.dateStr !== dateStr);
    }
    return previous.map((dc) => (dc.dateStr === dateStr ? { ...dc, label: trimmed } : dc));
  }

  if (!trimmed) return previous;
  return [...previous, { id: idFactory(), dateStr, color: null, label: trimmed, createdBy }];
}

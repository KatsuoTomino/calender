import type { DateColor, DateColorType } from "../types";

type CreateId = () => string;

// React docs: arrays in state should be treated as immutable.
// https://react.dev/learn/updating-arrays-in-state
export function applyDateColorUpdate(
  dateColors: DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string,
  createId: CreateId = () => crypto.randomUUID()
): DateColor[] {
  const existing = dateColors.find((dc) => dc.dateStr === dateStr);

  if (color === null) {
    if (existing?.label) {
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

  return [
    ...dateColors,
    { id: createId(), dateStr, color, createdBy },
  ];
}

export function applyDateLabelUpdate(
  dateColors: DateColor[],
  dateStr: string,
  label: string | null,
  createdBy: string,
  createId: CreateId = () => crypto.randomUUID()
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

  if (!trimmed) return dateColors;

  return [
    ...dateColors,
    { id: createId(), dateStr, color: null, label: trimmed, createdBy },
  ];
}

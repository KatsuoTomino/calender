import type { DateColor, DateColorType } from "../types.ts";

export function applyDateColorUpdate(
  dateColors: DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string,
  idFactory: () => string = () => crypto.randomUUID()
): DateColor[] {
  const existing = dateColors.find((dc) => dc.dateStr === dateStr);

  if (color === null) {
    if (!existing) return dateColors;
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

  return [...dateColors, { id: idFactory(), dateStr, color, createdBy }];
}

export function applyDateLabelUpdate(
  dateColors: DateColor[],
  dateStr: string,
  label: string | null,
  createdBy: string,
  idFactory: () => string = () => crypto.randomUUID()
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
    { id: idFactory(), dateStr, color: null, label: trimmed, createdBy },
  ];
}

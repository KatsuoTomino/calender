import type { DateColor, DateColorType } from "../types";

function defaultIdFactory(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function applyDateColorChange(
  prev: DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string,
  idFactory: () => string = defaultIdFactory
): DateColor[] {
  const existing = prev.find((dc) => dc.dateStr === dateStr);

  if (color === null) {
    if (existing?.label) {
      return prev.map((dc) =>
        dc.dateStr === dateStr ? { ...dc, color: null } : dc
      );
    }
    return prev.filter((dc) => dc.dateStr !== dateStr);
  }

  if (existing) {
    return prev.map((dc) =>
      dc.dateStr === dateStr ? { ...dc, color } : dc
    );
  }

  return [...prev, { id: idFactory(), dateStr, color, createdBy }];
}

export function applyDateLabelChange(
  prev: DateColor[],
  dateStr: string,
  label: string | null,
  createdBy: string,
  idFactory: () => string = defaultIdFactory
): DateColor[] {
  const existing = prev.find((dc) => dc.dateStr === dateStr);
  const trimmed = label?.trim() || null;

  if (existing) {
    if (!trimmed && !existing.color) {
      return prev.filter((dc) => dc.dateStr !== dateStr);
    }
    return prev.map((dc) =>
      dc.dateStr === dateStr ? { ...dc, label: trimmed } : dc
    );
  }

  if (!trimmed) return prev;
  return [...prev, { id: idFactory(), dateStr, color: null, label: trimmed, createdBy }];
}

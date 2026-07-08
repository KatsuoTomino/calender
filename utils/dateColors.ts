import { DateColor, DateColorType } from "../types";

type IdFactory = () => string;

function defaultIdFactory(): string {
  return globalThis.crypto?.randomUUID?.() ?? `date-color-${Date.now()}`;
}

export function applyDateColorUpdate(
  dateColors: DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string,
  createId: IdFactory = defaultIdFactory
): DateColor[] {
  const existing = dateColors.find((dc) => dc.dateStr === dateStr);

  if (existing) {
    if (color === null && !existing.label) {
      return dateColors.filter((dc) => dc.dateStr !== dateStr);
    }

    return dateColors.map((dc) =>
      dc.dateStr === dateStr ? { ...dc, color } : dc
    );
  }

  if (color === null) {
    return dateColors;
  }

  return [
    ...dateColors,
    {
      id: createId(),
      dateStr,
      color,
      label: null,
      createdBy,
    },
  ];
}

export function applyDateLabelUpdate(
  dateColors: DateColor[],
  dateStr: string,
  label: string | null,
  createdBy: string,
  createId: IdFactory = defaultIdFactory
): DateColor[] {
  const trimmed = label?.trim() || null;
  const existing = dateColors.find((dc) => dc.dateStr === dateStr);

  if (existing) {
    if (!trimmed && !existing.color) {
      return dateColors.filter((dc) => dc.dateStr !== dateStr);
    }

    return dateColors.map((dc) =>
      dc.dateStr === dateStr ? { ...dc, label: trimmed } : dc
    );
  }

  if (!trimmed) {
    return dateColors;
  }

  return [
    ...dateColors,
    {
      id: createId(),
      dateStr,
      color: null,
      label: trimmed,
      createdBy,
    },
  ];
}

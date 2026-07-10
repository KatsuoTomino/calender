type DateColorType = "red" | "yellow" | "blue" | "green" | "purple" | null;

type DateColor = {
  id: string;
  dateStr: string;
  color: DateColorType;
  label?: string | null;
  createdBy: string;
};

export function applyDateColorOptimisticUpdate(
  dateColors: DateColor[],
  dateStr: string,
  color: DateColorType,
  createdBy: string
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
    { id: crypto.randomUUID(), dateStr, color, createdBy },
  ];
}

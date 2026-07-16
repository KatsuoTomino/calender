export type ExpectedImageFilter =
  | { kind: "null" }
  | { kind: "equals"; value: string }
  | { kind: "oneOf"; values: string[] };

export function buildExpectedImageFilter(
  imageUrls: string[] | null
): ExpectedImageFilter {
  if (!imageUrls || imageUrls.length === 0) {
    return { kind: "null" };
  }
  if (imageUrls.length === 1) {
    return {
      kind: "oneOf",
      values: [imageUrls[0], JSON.stringify(imageUrls)],
    };
  }
  return { kind: "equals", value: JSON.stringify(imageUrls) };
}

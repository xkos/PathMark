/** Missing colors in older backups use the same saved-bookmark blue. */
export const DEFAULT_COLLECTION_COLOR = "#2563eb";
export const COLLECTION_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#ea580c", "#ca8a04", "#9333ea", "#db2777", "#0891b2", "#64748b"];
export function collectionColor(color?: string): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_COLLECTION_COLOR;
}

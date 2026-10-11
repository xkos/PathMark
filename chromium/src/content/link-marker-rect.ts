// Inline links can contain empty fragments before visible text or block children.
export function visibleLinkRect(rects: Iterable<DOMRect>, width: number, height: number): DOMRect | undefined {
  return Array.from(rects).find(rect => rect.width > 0 && rect.height > 0 &&
    rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width);
}

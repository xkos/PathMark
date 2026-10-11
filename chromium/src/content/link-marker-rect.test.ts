import { describe, it, expect } from "vitest";
import { visibleLinkRect } from "./link-marker-rect";
const rect = (left: number, top: number, width: number, height: number) => ({left,top,width,height,right:left+width,bottom:top+height}) as DOMRect;
describe("visible link fragments", () => {
  it.each([0,16])("skips a zero-width leading fragment with height %s", height => {
    const valid = rect(667,335,276,155);
    expect(visibleLinkRect([rect(667,335,0,height),valid],1918,625)).toBe(valid);
  });
  it("chooses the visible line after earlier lines scroll off screen", () => {
    const visible = rect(40,80,210,16);
    expect(visibleLinkRect([rect(40,-30,210,16),visible],1000,700)).toBe(visible);
  });
  it("excludes empty and offscreen rectangles", () => {
    expect(visibleLinkRect([rect(0,0,0,16),rect(1000,40,20,16),rect(40,700,20,16)],1000,700)).toBeUndefined();
  });
});

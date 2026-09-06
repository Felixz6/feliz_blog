export const titleChainDefinitions = [
  {
    id: 0, type: "weave", route: "left",
    buildStart: 0.025, buildEnd: 0.62, direction: 1,
    verticalPhase: 1, planePhase: 0,
    topInset: 0.19, bottomInset: 0.18, xInset: 0.13, xShift: 0.018,
    breakT: 0.3, desktopLinksPerSegment: 5, mobileLinksPerSegment: 2,
    linkScale: 0.92, tailInset: 0.052, entryOverscan: 0.42, entryBend: -0.12
  },
  {
    id: 1, type: "weave", route: "left",
    buildStart: 0.1, buildEnd: 0.76, direction: 1,
    verticalPhase: 0, planePhase: 0,
    topInset: 0.035, bottomInset: 0.035, xInset: 0.075, xShift: -0.006,
    breakT: 0.5, desktopLinksPerSegment: 6, mobileLinksPerSegment: 3,
    linkScale: 0.9, tailInset: 0.036, entryOverscan: 0.38, entryBend: 0.09
  },
  {
    id: 2, type: "weave", route: "right-clasp",
    buildStart: 0.3, buildEnd: 0.88, direction: -1,
    verticalPhase: 0, planePhase: 0,
    topInset: 0.2, bottomInset: 0.18, xInset: 0.075, xShift: 0,
    breakT: 0.42, desktopLinksPerSegment: 4, mobileLinksPerSegment: 2,
    linkScale: 0.88, tailInset: 0.032, entryOverscan: 0.4, entryBend: -0.035
  }
] as const;

type Bounds = { top: number; bottom: number };
type Box = { left: number; top: number; width: number; height: number };
type Layout = {
  textLeft: number; textRight: number; top?: number; bottom?: number;
  gaps: number[]; anchorBounds: Bounds[];
};
type Point = { x: number; y: number };
type ChainPath = {
  type: "weave"; points: Point[]; segmentCount: number; depths?: number[];
};

// Rebuilt on title layout changes only. The two groups never share a glyph corridor.
export function buildTitleChainRig(box: Box, layout: Layout, linkWidths: number[]) {
  const textLeft = layout.textRight > layout.textLeft ? layout.textLeft : box.left;
  const textRight = layout.textRight > layout.textLeft ? layout.textRight : box.left + box.width;
  const width = textRight - textLeft;
  const gaps = layout.gaps.length === 5
    ? layout.gaps
    : [0.19, 0.31, 0.47, 0.64, 0.81].map(unit => textLeft + width * unit);
  const measuredHeight = (layout.bottom ?? 0) > (layout.top ?? 0);
  const fallback = {
    top: measuredHeight ? layout.top! : box.top,
    bottom: measuredHeight ? layout.bottom! : box.top + box.height
  };
  const boundsAt = (index: number) => layout.anchorBounds[index] ?? fallback;
  const splitX = gaps[3];
  // Include the rotated link's full footprint, its size variation, and residual motion.
  const clearance = Math.max(...linkWidths) * 0.72 + box.height * 0.012;
  const paths: ChainPath[] = titleChainDefinitions.map(definition => {
    const linkWidth = linkWidths[definition.id];
    const burial = Math.max(box.width * definition.tailInset, linkWidth * 0.72 + box.height * 0.06) + linkWidth;
    if (definition.route === "right-clasp") {
      const bounds = boundsAt(5);
      const y = (unit: number) => bounds.top + (bounds.bottom - bounds.top) * unit;
      const lastGlyphWidth = textRight - gaps[4];
      const destination = splitX + Math.max(clearance, Math.min(burial, (gaps[4] - splitX) * 0.6));
      const points = [
        { x: destination, y: y(0.46) },
        { x: gaps[4] + lastGlyphWidth * 0.16, y: y(0.8) },
        { x: textRight - lastGlyphWidth * 0.16, y: y(0.68) },
        { x: textRight + box.width * definition.xInset, y: y(0.36) }
      ];
      return { type: "weave", points, segmentCount: 3, depths: [-1, 1, 1, -1] };
    }
    const destination = splitX - Math.max(clearance, Math.min(burial, (splitX - gaps[2]) * 0.6));
    const xs = [
      textLeft - box.width * definition.xInset,
      ...gaps.slice(0, 3).map(gap => gap + box.width * definition.xShift),
      destination
    ];
    const points = xs.map((x, index) => {
      const bounds = boundsAt(index);
      const height = Math.max(1, bounds.bottom - bounds.top);
      const upper = (index + definition.verticalPhase) % 2 === 0;
      const endpointInset = index === 0 || index === xs.length - 1 ? 0.08 : 0;
      return {
        x,
        y: upper
          ? bounds.top + height * (definition.topInset + endpointInset)
          : bounds.bottom - height * (definition.bottomInset + endpointInset)
      };
    });
    return { type: "weave", points, segmentCount: points.length - 1 };
  });
  return { paths, splitX, clearance };
}

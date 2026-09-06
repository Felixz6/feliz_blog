import type { GlyphBox, GlyphCounter } from "./titleChainCounter.ts";

export const titleChainDefinitions = [
  {
    id: 0, type: "weave", route: "left-upper",
    buildStart: 0.025, buildEnd: 0.78, direction: 1,
    planePhase: 0, xInset: 0.13,
    breakT: 0.55, desktopLinksPerSegment: 3, mobileLinksPerSegment: 2,
    linkScale: 0.9, entryOverscan: 0.42, entryBend: -0.035
  },
  {
    id: 1, type: "weave", route: "left-lower",
    buildStart: 0.1, buildEnd: 0.86, direction: 1,
    planePhase: 1, xInset: 0.075,
    breakT: 0.5, desktopLinksPerSegment: 3, mobileLinksPerSegment: 2,
    linkScale: 0.88, entryOverscan: 0.4, entryBend: 0.025
  },
  {
    id: 2, type: "weave", route: "right-clasp",
    buildStart: 0.24, buildEnd: 0.96, direction: -1,
    planePhase: 0, xInset: 0.075,
    breakT: 0.5, desktopLinksPerSegment: 3, mobileLinksPerSegment: 2,
    linkScale: 0.88, entryOverscan: 0.4, entryBend: 0.025
  }
] as const;

type Bounds = { top: number; bottom: number };
type Box = { left: number; top: number; width: number; height: number };
type Layout = {
  textLeft: number; textRight: number; top?: number; bottom?: number;
  gaps: number[]; anchorBounds: Bounds[];
  glyphBounds?: GlyphBox[]; counter?: GlyphCounter | null;
};
type Point = { x: number; y: number };
type Curve = [Point, Point, Point, Point];
type Knot = [number, number, number, number];
type ChainPath = {
  type: "weave"; points: Point[]; segmentCount: number; curves: Curve[];
  route: "left-upper" | "left-lower" | "right-clasp";
  backRanges: [number, number][];
  counter?: GlyphCounter; portalRight?: number; counterUnit?: number;
  crossings: { x: number; y: number; unit: number; radius: number; front: boolean }[];
};

// Curves and crossing ownership are rebuilt only with the measured title layout.
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
  const top = fallback.top, height = fallback.bottom - top;
  const glyphAt = (index: number): GlyphBox => layout.glyphBounds?.[index] ?? {
    left: index === 0 ? textLeft : gaps[index - 1],
    right: index === 5 ? textRight : gaps[index],
    ...(layout.anchorBounds[index] ?? { top: top + height * .28, bottom: fallback.bottom })
  };
  const glyph = glyphAt(3), sGlyph = glyphAt(2), rGlyph = glyphAt(4), lastGlyph = glyphAt(5);
  const glyphWidth = glyph.right - glyph.left;
  const glyphHeight = glyph.bottom - glyph.top;
  const counter = layout.counter ?? {
    x: glyph.left + glyphWidth * 0.39, y: glyph.top + glyphHeight * 0.7,
    radiusX: glyphWidth * 0.13, radiusY: glyphHeight * 0.15
  };
  const counterX = (counter.x - textLeft) / width;
  const counterY = (counter.y - top) / height;
  const letterX = (letter: GlyphBox, ratio: number) => (letter.left - textLeft + (letter.right - letter.left) * ratio) / width;
  const letterY = (letter: GlyphBox, ratio: number) => (letter.top - top + (letter.bottom - letter.top) * ratio) / height;
  const letterSlope = (letter: GlyphBox, ratio: number) => (letter.bottom - letter.top) * ratio / height;
  const paths: ChainPath[] = titleChainDefinitions.map(definition => {
    // Each knot includes its own tangent: unequal sweeps, not a repeating wave.
    const knots: Knot[] = definition.route === "left-upper"
      ? [[-definition.xInset, .1, .1, .26], [.205, .83, .09, .01],
        [letterX(sGlyph, .68), letterY(sGlyph, .12), .068, -letterSlope(sGlyph, .04)],
        [letterX(glyph, .28), letterY(glyph, .2), .025, letterSlope(glyph, .11)],
        [.65, .87, .06, .07]]
      : definition.route === "left-lower"
        ? [[-definition.xInset, .88, .13, -.1], [.265, .22, .078, .015],
          [.4, .79, .045, .025], [letterX(sGlyph, .9), letterY(sGlyph, .57), .025, -letterSlope(sGlyph, .1)]]
        : [[letterX(lastGlyph, .42), letterY(lastGlyph, .33), -.08, letterSlope(lastGlyph, .12)],
          [letterX(rGlyph, .44), letterY(rGlyph, .5), -.07, -letterSlope(rGlyph, .15)],
          [letterX(glyph, .57), letterY(glyph, .06), -.06, -letterSlope(glyph, .018)],
          [letterX(glyph, -.06), letterY(glyph, .3), 0, letterSlope(glyph, .13)],
          [counterX, counterY, .095, .05], [1 + box.width * definition.xInset / width, .93, .13, .13]];
    const points = knots.map(([x, y]) => ({ x: textLeft + width * x, y: top + height * y }));
    const curves: Curve[] = knots.slice(0, -1).map((knot, index) => {
      const end = knots[index + 1];
      return [
        points[index],
        { x: points[index].x + knot[2] * width, y: points[index].y + knot[3] * height },
        { x: points[index + 1].x - end[2] * width, y: points[index + 1].y - end[3] * height },
        points[index + 1]
      ];
    });
    const backRanges: [number, number][] = definition.route === "left-upper"
      ? [[.12, .22], [.43, .56], [.93, 1]]
      : definition.route === "left-lower"
        ? [[.34, .48], [.91, 1]]
        : [[0, .13]];
    return {
      type: "weave", curves, points, segmentCount: curves.length,
      route: definition.route, backRanges, crossings: [],
      ...(definition.route === "right-clasp" ? {
        counter, counterUnit: 4 / 5, portalRight: glyph.right - glyphWidth * .12
      } : {})
    };
  });
  const samples = paths.map(path => Array.from({ length: 129 }, (_, index) => sampleTitleChainCurve(path, index / 128)));
  const crossings: { x: number; y: number; ids: number[]; units: number[]; overId: number; overIndex: number }[] = [];
  for (let first = 0; first < paths.length; first++) {
    for (let second = first; second < paths.length; second++) {
      const pair: typeof crossings = [];
      for (let i = 0; i < 128; i++) {
        const a = samples[first][i], b = samples[first][i + 1];
        const rx = b.x - a.x, ry = b.y - a.y;
        for (let j = first === second ? i + 2 : 0; j < 128; j++) {
          const c = samples[second][j], d = samples[second][j + 1];
          const sx = d.x - c.x, sy = d.y - c.y;
          const denominator = rx * sy - ry * sx;
          if (Math.abs(denominator) < 0.00001) continue;
          const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator;
          const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const x = a.x + rx * t, y = a.y + ry * t;
          if (pair.some(point => Math.hypot(point.x - x, point.y - y) < 2)) continue;
          pair.push({ x, y, ids: [first, second], units: [(i + t) / 128, (j + u) / 128], overId: 0, overIndex: 0 });
        }
      }
      pair.sort((a, b) => a.x - b.x);
      pair.forEach((crossing, index) => {
        crossing.overId = index % 2 === 0 ? second : first;
        crossing.overIndex = index % 2 === 0 ? 1 : 0;
        crossing.ids.forEach((id, arm) => paths[id].crossings.push({
          x: crossing.x, y: crossing.y, unit: crossing.units[arm],
          radius: Math.max(...linkWidths) * 1.6, front: arm === crossing.overIndex
        }));
      });
      crossings.push(...pair);
    }
  }
  return { paths, counter, crossings };
}

export function sampleTitleChainCurve(path: ChainPath, unit: number) {
  const position = Math.max(0, Math.min(1, unit)) * path.curves.length;
  const index = Math.min(path.curves.length - 1, Math.floor(position));
  const u = position - index, v = 1 - u;
  const [a, b, c, d] = path.curves[index];
  const x = v ** 3 * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u ** 3 * d.x;
  const y = v ** 3 * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u ** 3 * d.y;
  const tangentX = 3 * v * v * (b.x - a.x) + 6 * v * u * (c.x - b.x) + 3 * u * u * (d.x - c.x);
  const tangentY = 3 * v * v * (b.y - a.y) + 6 * v * u * (c.y - b.y) + 3 * u * u * (d.y - c.y);
  let back = path.backRanges.some(([start, end]) => unit >= start && unit <= end)
    || (path.route === "right-clasp" && unit >= path.counterUnit! && x < path.portalRight!);
  let nearest = Infinity;
  for (const crossing of path.crossings) {
    if (Math.abs(unit - crossing.unit) > 0.08) continue;
    const distance = Math.hypot(x - crossing.x, y - crossing.y);
    if (distance < crossing.radius && distance < nearest) {
      back = !crossing.front;
      nearest = distance;
    }
  }
  if (path.route === "right-clasp" ? unit < 0.025 : unit > 0.98) back = true;
  return { x, y, tangentX, tangentY, plane: back ? "back" : "front", depth: back ? -1 : 1 };
}

export function fitTitleChainConnector(
  sample: Point & { angle: number },
  before: Point & { tangentX: number; tangentY: number },
  after: Point & { tangentX: number; tangentY: number },
  width: number
) {
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const span = Math.max(0.001, Math.hypot(dx, dy));
  const projection = Math.abs((before.tangentX * dx + before.tangentY * dy) / span)
    + Math.abs((after.tangentX * dx + after.tangentY * dy) / span);
  sample.x = (before.x + after.x) * 0.5;
  sample.y = (before.y + after.y) * 0.5;
  sample.angle = Math.atan2(dy, dx);
  return Math.max(0.62, Math.min(1.16, (span - width * 0.34 * projection) / width));
}

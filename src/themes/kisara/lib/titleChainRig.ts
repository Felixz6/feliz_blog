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
type ChainPath = {
  type: "weave"; points: Point[]; segmentCount: number; curves: Curve[];
  route: "left-upper" | "left-lower" | "right-clasp";
  counter?: GlyphCounter; portalRight?: number; counterUnit?: number;
  crossings: { x: number; y: number; unit: number; radius: number; front: boolean }[];
};

function smoothCurves(points: Point[]): Curve[] {
  return points.slice(0, -1).map((point, index) => {
    const before = points[Math.max(0, index - 1)];
    const end = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    return [
      point,
      { x: point.x + (end.x - before.x) / 6, y: point.y + (end.y - before.y) / 6 },
      { x: end.x - (after.x - point.x) / 6, y: end.y - (after.y - point.y) / 6 },
      end
    ];
  });
}

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
  const boundsAt = (index: number) => layout.anchorBounds[index] ?? fallback;
  const glyph = layout.glyphBounds?.[3] ?? { left: gaps[2], right: gaps[3], ...boundsAt(3) };
  const glyphWidth = glyph.right - glyph.left;
  const glyphHeight = glyph.bottom - glyph.top;
  const counter = layout.counter ?? {
    x: glyph.left + glyphWidth * 0.39, y: glyph.top + glyphHeight * 0.7,
    radiusX: glyphWidth * 0.13, radiusY: glyphHeight * 0.15
  };
  const top = fallback.top, height = fallback.bottom - top;
  const paths: ChainPath[] = titleChainDefinitions.map(definition => {
    if (definition.route === "right-clasp") {
      const hole = { x: counter.x, y: counter.y };
      const points = [
        { x: textLeft + width * 0.3, y: top + height * 0.33 },
        { x: textLeft + width * 0.4, y: top + height * 0.93 },
        { x: counter.x + glyphWidth * 0.3, y: top + height * 0.24 },
        { x: counter.x - glyphWidth * 0.55, y: top + height * 0.46 },
        hole,
        { x: textLeft + width * 0.74, y: top + height * 0.82 },
        { x: textLeft + width * 0.88, y: top + height * 0.25 },
        { x: textRight + box.width * definition.xInset, y: top + height * 0.62 }
      ];
      return {
        type: "weave", curves: smoothCurves(points), points, segmentCount: 7,
        route: "right-clasp", counter, counterUnit: 4 / 7,
        portalRight: glyph.right - glyphWidth * 0.12, crossings: []
      };
    }
    const knots = definition.route === "left-upper"
      ? [[-definition.xInset, 0.82], [0.18, 0.19], [0.32, 0.84], [0.49, 0.18], [0.66, 0.78], [0.75, 0.39]]
      : [[-definition.xInset, 0.15], [0.2, 0.91], [0.37, 0.28], [0.55, 0.84], [0.84, 0.27], [0.91, 0.6]];
    const points = knots.map(([x, y]) => ({ x: textLeft + width * x, y: top + height * y }));
    return {
      type: "weave", curves: smoothCurves(points), points, segmentCount: 5,
      route: definition.route, crossings: []
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
  let back = path.route === "right-clasp"
    ? unit < 0.07 || (index === 4 && x < (path.portalRight ?? x)) || index === 1 || index === 5
    : unit > 0.92 || (index + (path.route === "left-lower" ? 1 : 0)) % 2 === 1;
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

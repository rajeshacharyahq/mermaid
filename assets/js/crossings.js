"use strict";

function normalizeArrowEndpointTails(svg) {
  svg?.querySelectorAll("path.flowchart-link[marker-end]").forEach(path => {
    // Mermaid may shorten the last segment past a nearby waypoint when leaving
    // room for the marker, reversing its tangent (notably on cylinders).
    const commands = path.getAttribute("d")?.match(/[MLCQAZmlcqaz][^MLCQAZmlcqaz]*/g);
    if (!commands || commands.length < 3) return;
    const endpoint = command => {
      const numbers = command.slice(1).match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)?.map(Number);
      return numbers?.length >= 2 ? { x: numbers.at(-2), y: numbers.at(-1) } : null;
    };
    let changed = false;
    while (commands.length >= 3) {
      const last = commands.at(-1), middle = commands.at(-2);
      if (!last.startsWith("L") || !middle.startsWith("L")) break;
      const a = endpoint(commands.at(-3)), b = endpoint(middle), c = endpoint(last);
      if (!a || !b || !c) break;
      const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
      const backwards = ux * vx + uy * vy < 0;
      const collinear = Math.abs(ux * vy - uy * vx) < 0.01 * Math.max(1, Math.hypot(ux, uy));
      if (!backwards || !collinear || Math.hypot(vx, vy) > 16) break;
      commands.splice(commands.length - 2, 1);
      changed = true;
    }
    if (changed) path.setAttribute("d", commands.join(""));
  });
}

// Work in SVG coordinates so crossings between different subgraph transforms
// are treated just like crossings within one group. Masks keep exports transparent.
function addArrowCrossingJumps(svg) {
  if (!svg) return;
  const rootInverse = svg.getCTM().inverse();
  const edges = [...svg.querySelectorAll("path.flowchart-link")].map(path => {
    const matrix = rootInverse.multiply(path.getCTM());
    const length = path.getTotalLength();
    const count = Math.max(1, Math.ceil(length / 2));
    const points = [];
    let distance = 0;
    for (let i = 0; i <= count; i++) {
      const point = path.getPointAtLength(length * i / count).matrixTransform(matrix);
      if (i) distance += Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y);
      points.push({ x: point.x, y: point.y, distance });
    }
    return { path, points, inverse: matrix.inverse(), jumps: [], gaps: [], length: distance };
  });
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const grid = new Map();
  const radius = 7;
  edges.forEach((edge, edgeIndex) => {
    edge.points.slice(1).forEach((b, index) => {
      const a = edge.points[index];
      const vector = subtract(b, a);
      const size = b.distance - a.distance;
      if (size < 0.001) return;
      const seen = new Set();
      for (let x = Math.floor(Math.min(a.x, b.x) / 64); x <= Math.floor(Math.max(a.x, b.x) / 64); x++) {
        for (let y = Math.floor(Math.min(a.y, b.y) / 64); y <= Math.floor(Math.max(a.y, b.y) / 64); y++) {
          const key = `${x},${y}`;
          const bucket = grid.get(key) || [];
          for (const other of bucket) {
            if (other.edgeIndex === edgeIndex || seen.has(other)) continue;
            seen.add(other);
            const denominator = cross(vector, other.vector);
            // Ignore tangencies and shared/parallel runs, which are not crossings.
            if (Math.abs(denominator) < size * other.size * 0.3) continue;
            const offset = subtract(other.a, a);
            const t = cross(offset, other.vector) / denominator;
            const u = cross(offset, vector) / denominator;
            if (t < 0 || t > 1 || u < 0 || u > 1) continue;
            const at = a.distance + t * size;
            const otherAt = other.a.distance + u * other.size;
            if (at < 12 || at > edge.length - 12 || otherAt < 12 || otherAt > other.edge.length - 12) continue;
            const horizontal = Math.abs(vector.x) / size >= Math.abs(other.vector.x) / other.size;
            const over = horizontal ? edge : other.edge;
            const under = horizontal ? other.edge : edge;
            const distance = horizontal ? at : otherAt;
            if (over.jumps.some(jump => Math.abs(jump.distance - distance) < radius * 2 + 2)) continue;
            over.jumps.push({ distance, under });
          }
          bucket.push({ edge, edgeIndex, a, vector, size });
          grid.set(key, bucket);
        }
      }
    });
  });
  const pointAt = (edge, distance) => {
    const index = edge.points.findIndex(point => point.distance >= distance);
    const b = edge.points[Math.max(1, index)];
    const a = edge.points[Math.max(0, index - 1)];
    const t = (distance - a.distance) / (b.distance - a.distance || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const coordinate = (edge, point) => {
    const local = new DOMPoint(point.x, point.y).matrixTransform(edge.inverse);
    return `${local.x.toFixed(3)},${local.y.toFixed(3)}`;
  };
  edges.forEach(edge => {
    if (!edge.jumps.length) return;
    edge.jumps.sort((a, b) => a.distance - b.distance);
    let d = `M${coordinate(edge, edge.points[0])}`;
    let cursor = 1;
    for (const jump of edge.jumps) {
      const start = pointAt(edge, jump.distance - radius);
      const end = pointAt(edge, jump.distance + radius);
      const dx = end.x - start.x, dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      let nx = -dy / length, ny = dx / length;
      if (ny > 0 || (Math.abs(ny) < 0.001 && nx < 0)) { nx = -nx; ny = -ny; }
      const control1 = { x: start.x + nx * radius * 4 / 3, y: start.y + ny * radius * 4 / 3 };
      const control2 = { x: end.x + nx * radius * 4 / 3, y: end.y + ny * radius * 4 / 3 };
      while (cursor < edge.points.length && edge.points[cursor].distance < jump.distance - radius) d += `L${coordinate(edge, edge.points[cursor++])}`;
      d += `L${coordinate(edge, start)}C${coordinate(edge, control1)} ${coordinate(edge, control2)} ${coordinate(edge, end)}`;
      while (cursor < edge.points.length && edge.points[cursor].distance <= jump.distance + radius) cursor++;
      jump.under.gaps.push({ points: [start, control1, control2, end], width: (parseFloat(getComputedStyle(edge.path).strokeWidth) || 1) + 4 });
    }
    while (cursor < edge.points.length) d += `L${coordinate(edge, edge.points[cursor++])}`;
    edge.path.setAttribute("d", d);
    edge.path.dataset.crossingJumps = String(edge.jumps.length);
  });
  const namespace = "http://www.w3.org/2000/svg";
  let defs = svg.querySelector("defs");
  if (!defs) { defs = document.createElementNS(namespace, "defs"); svg.prepend(defs); }
  edges.forEach((edge, index) => {
    if (!edge.gaps.length) return;
    const box = edge.path.getBBox();
    const mask = document.createElementNS(namespace, "mask");
    mask.id = `${svg.id}-crossing-mask-${index}`;
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    mask.setAttribute("maskContentUnits", "userSpaceOnUse");
    mask.style.maskType = "luminance";
    const background = document.createElementNS(namespace, "rect");
    for (const element of [mask, background]) {
      element.setAttribute("x", box.x - 30); element.setAttribute("y", box.y - 30);
      element.setAttribute("width", box.width + 60); element.setAttribute("height", box.height + 60);
    }
    background.style.setProperty("fill", "white", "important");
    mask.append(background);
    edge.gaps.forEach(gap => {
      const cut = document.createElementNS(namespace, "path");
      const [a, b, c, d] = gap.points.map(point => coordinate(edge, point));
      cut.setAttribute("d", `M${a}C${b} ${c} ${d}`);
      cut.style.setProperty("fill", "none", "important");
      cut.style.setProperty("stroke", "black", "important");
      cut.style.setProperty("stroke-width", gap.width, "important");
      mask.append(cut);
    });
    defs.append(mask);
    edge.path.setAttribute("mask", `url(#${mask.id})`);
  });
}

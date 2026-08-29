/**
 * charts.js — dependency-free SVG string builders. No DOM, node-safe.
 */

/**
 * Donut chart. segments: [{ value, color }]
 * Returns an inline <svg> string.
 */
export function donutSVG(segments = [], { size = 190, stroke = 26, gapDeg = 2 } = {}) {
  const total = segments.reduce((s, x) => s + Math.max(x.value, 0), 0);
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;

  if (total <= 0) {
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">`
      + `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#1c2133" stroke-width="${stroke}"/>`
      + `</svg>`;
  }

  const gapFrac = (gapDeg / 360);
  const parts = [];
  let acc = 0;

  for (const seg of segments) {
    const value = Math.max(seg.value, 0);
    if (value === 0) continue;
    const frac = value / total;
    const len = Math.max(circ * (frac - gapFrac), 0.75);
    const rotation = (acc / total) * 360 - 90;
    parts.push(
      `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${seg.color}" `
      + `stroke-width="${stroke}" stroke-dasharray="${len.toFixed(3)} ${(circ - len).toFixed(3)}" `
      + `transform="rotate(${rotation.toFixed(3)} ${c} ${c})"/>`
    );
    acc += value;
  }

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">${parts.join('')}</svg>`;
}

/** Heatmap cell class for a count (engine.heatLevel maps 1:1). */
export function heatClass(level) {
  return `cell c${Math.max(0, Math.min(4, level))}`;
}

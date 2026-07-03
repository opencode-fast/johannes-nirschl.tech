// Region-of-interest definition and skin-colour sampling on the MediaPipe face mesh.
//
// We deliberately analyse only the forehead and both cheeks: these are the best
// perfused, flattest, least-occluded skin patches (no eyes, brows, lips, hair).
// ROIs are built as rotated rectangles aligned to the face axis, so they track
// head roll/tilt, and a skin-colour test rejects stray hair/shadow/specular pixels.

// Stable landmark anchors (MediaPipe FaceMesh indices).
const IDX = {
  faceLeft: 234,   // image-left face edge
  faceRight: 454,  // image-right face edge
  foreheadTop: 10, // hairline centre
  glabella: 9,     // between the eyebrows
  chin: 152,
  cheekA: 50,      // cheek (image-left)
  cheekB: 280,     // cheek (image-right)
};

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y) || 1e-6;
const norm = (v) => { const l = len(v); return { x: v.x / l, y: v.y / l }; };
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function box(c, ax, ay, hw, hh) {
  return [
    { x: c.x - ax.x * hw - ay.x * hh, y: c.y - ax.y * hw - ay.y * hh },
    { x: c.x + ax.x * hw - ay.x * hh, y: c.y + ax.y * hw - ay.y * hh },
    { x: c.x + ax.x * hw + ay.x * hh, y: c.y + ax.y * hw + ay.y * hh },
    { x: c.x - ax.x * hw + ay.x * hh, y: c.y - ax.y * hw + ay.y * hh },
  ];
}

// Build forehead + cheek polygons (in pixel coords of a w×h frame).
export function computeROIs(landmarks, w, h) {
  const P = (i) => ({ x: landmarks[i].x * w, y: landmarks[i].y * h });
  const L = P(IDX.faceLeft), R = P(IDX.faceRight);
  const top = P(IDX.foreheadTop), chin = P(IDX.chin), gl = P(IDX.glabella);
  const fw = len(sub(R, L));            // face width
  const fh = len(sub(chin, top));       // face height

  let ax = norm(sub(R, L));             // horizontal face axis (follows roll)
  let ay = { x: -ax.y, y: ax.x };       // perpendicular
  if ((chin.x - top.x) * ay.x + (chin.y - top.y) * ay.y < 0) ay = { x: -ay.x, y: -ay.y }; // point toward chin

  const foreheadCenter = lerp(gl, top, 0.5); // mid-forehead, above brows
  return {
    forehead: box(foreheadCenter, ax, ay, 0.19 * fw, 0.09 * fh),
    cheekA: box(P(IDX.cheekA), ax, ay, 0.09 * fw, 0.10 * fh),
    cheekB: box(P(IDX.cheekB), ax, ay, 0.09 * fw, 0.10 * fh),
  };
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Lenient skin test that works across skin tones: reject too-dark (hair/shadow),
// blown-out specular highlights, and strongly blue pixels.
function isSkin(r, g, b) {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma < 30 || luma > 245) return false;
  if (b > r) return false;          // skin is warmer than it is blue
  if (r < 40) return false;
  return true;
}

// Mean R/G/B (+ brightness) of skin pixels inside a polygon, sampled from ctx.
export function sampleROI(ctx, poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  minX = Math.max(0, Math.floor(minX)); minY = Math.max(0, Math.floor(minY));
  maxX = Math.min(ctx.canvas.width, Math.ceil(maxX));
  maxY = Math.min(ctx.canvas.height, Math.ceil(maxY));
  const bw = maxX - minX, bh = maxY - minY;
  if (bw <= 0 || bh <= 0) return { r: 0, g: 0, b: 0, brightness: 0, count: 0 };

  const img = ctx.getImageData(minX, minY, bw, bh).data;
  let sr = 0, sg = 0, sb = 0, count = 0;
  for (let yy = 0; yy < bh; yy++) {
    for (let xx = 0; xx < bw; xx++) {
      if (!pointInPoly(minX + xx, minY + yy, poly)) continue;
      const o = (yy * bw + xx) * 4;
      const r = img[o], g = img[o + 1], b = img[o + 2];
      if (!isSkin(r, g, b)) continue;
      sr += r; sg += g; sb += b; count++;
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0, brightness: 0, count: 0 };
  const r = sr / count, g = sg / count, b = sb / count;
  return { r, g, b, brightness: 0.299 * r + 0.587 * g + 0.114 * b, count };
}

// Draw the ROI polygons as an overlay (coords scaled from proc space to display).
export function drawROIs(ctx, rois, scale) {
  const colors = { forehead: "#35c4b5", cheekA: "#ff4d6d", cheekB: "#ff4d6d" };
  ctx.lineWidth = 2;
  for (const key of Object.keys(rois)) {
    const poly = rois[key];
    ctx.strokeStyle = colors[key];
    ctx.fillStyle = colors[key] + "22";
    ctx.beginPath();
    ctx.moveTo(poly[0].x * scale, poly[0].y * scale);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x * scale, poly[i].y * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

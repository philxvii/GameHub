// Géométrie pure (sans trigonométrie : seules + − × ÷ et √ sont garanties identiques
// d'un navigateur à l'autre, condition du déterminisme multijoueur).

export const dist = (ax, ay, bx, by) => Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));

// Tracé d'un tronçon entre deux stations façon plan de métro : un segment droit puis un
// segment à 45°. La forme ne dépend pas du sens de parcours (ordre canonique par id).
export function segPath(a, b) {
  const swap = a.id > b.id;
  const p = swap ? b : a, q = swap ? a : b;
  const dx = q.x - p.x, dy = q.y - p.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  let mx, my;
  if (adx >= ady) { mx = q.x - Math.sign(dx) * ady; my = p.y; }
  else { mx = p.x; my = q.y - Math.sign(dy) * adx; }
  const pts = [p.x, p.y, mx, my, q.x, q.y];
  return swap ? [pts[4], pts[5], pts[2], pts[3], pts[0], pts[1]] : pts;
}

export function polyLen(pts) {
  let L = 0;
  for (let i = 2; i < pts.length; i += 2) L += dist(pts[i - 2], pts[i - 1], pts[i], pts[i + 1]);
  return L;
}

// Point à la distance d le long d'une polyligne plate [x0,y0,x1,y1,...] ; dx/dy = direction.
export function pointAt(pts, d) {
  for (let i = 2; i < pts.length; i += 2) {
    const l = dist(pts[i - 2], pts[i - 1], pts[i], pts[i + 1]);
    if (d <= l || i === pts.length - 2) {
      const u = l > 0 ? Math.max(0, Math.min(1, d / l)) : 0;
      return {
        x: pts[i - 2] + (pts[i] - pts[i - 2]) * u, y: pts[i - 1] + (pts[i + 1] - pts[i - 1]) * u,
        dx: l > 0 ? (pts[i] - pts[i - 2]) / l : 1, dy: l > 0 ? (pts[i + 1] - pts[i - 1]) / l : 0,
      };
    }
    d -= l;
  }
  return { x: pts[0], y: pts[1], dx: 1, dy: 0 };
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let u = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = Math.max(0, Math.min(1, u));
  return dist(px, py, ax + dx * u, ay + dy * u);
}

export function distToPoly(px, py, pts) {
  let m = Infinity;
  for (let i = 2; i < pts.length; i += 2) m = Math.min(m, distToSeg(px, py, pts[i - 2], pts[i - 1], pts[i], pts[i + 1]));
  return m;
}

// Courbe de Catmull-Rom (ouverte ou fermée) échantillonnée : sert à générer rivières,
// côtes et lacs à partir de quelques points de contrôle, une fois pour toutes.
export function catmull(points, steps, closed) {
  const n = points.length;
  const out = [];
  const P = i => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push(
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      );
    }
  }
  if (!closed) out.push(points[n - 1][0], points[n - 1][1]);
  return out;
}

// Rivière : ligne médiane lissée, élargie de part et d'autre (largeur variable possible).
export function riverPolygon(path, width, steps = 10) {
  const c = catmull(path, steps, false);
  const left = [], right = [];
  const n = c.length / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = c[b * 2] - c[a * 2], ty = c[b * 2 + 1] - c[a * 2 + 1];
    const l = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= l; ty /= l;
    const w = (Array.isArray(width) ? width[0] + (width[1] - width[0]) * (i / (n - 1)) : width) / 2;
    left.push(c[i * 2] - ty * w, c[i * 2 + 1] + tx * w);
    right.push(c[i * 2] + ty * w, c[i * 2 + 1] - tx * w);
  }
  const poly = left.slice();
  for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
  return poly;
}

export function bbox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]);
    y0 = Math.min(y0, poly[i + 1]); y1 = Math.max(y1, poly[i + 1]);
  }
  return [x0, y0, x1, y1];
}

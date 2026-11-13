// ===== Paint mixing engine: spectral Kubelka–Munk + CIEDE2000 =====
export const Engine = (() => {
  const L0 = 400, STEP = 10, NB = 31;
  const lam = Array.from({ length: NB }, (_, i) => L0 + i * STEP);
  const sig = (x) => 1 / (1 + Math.exp(-x));
  const gau = (x, mu, s) => Math.exp(-0.5 * ((x - mu) / s) ** 2);
  const g2 = (x, mu, s1, s2) => { const s = x < mu ? s1 : s2; return Math.exp(-0.5 * ((x - mu) / s) ** 2); };

  // CIE 1931 2° observer, multi-lobe fit (Wyman, Sloan & Shirley 2013)
  const xb = lam.map(l => 1.056 * g2(l, 599.8, 37.9, 31.0) + 0.362 * g2(l, 442.0, 16.0, 26.7) - 0.065 * g2(l, 501.1, 20.4, 26.2));
  const yb = lam.map(l => 0.821 * g2(l, 568.8, 46.9, 40.5) + 0.286 * g2(l, 530.9, 16.3, 31.1));
  const zb = lam.map(l => 1.217 * g2(l, 437.0, 11.8, 36.0) + 0.681 * g2(l, 459.0, 26.0, 13.8));
  // Approximate D65 relative SPD, 400–700 nm @10 nm
  const D65 = [82.75,91.49,93.43,86.68,104.86,117.01,117.81,114.86,115.92,108.81,109.35,107.80,104.79,107.69,104.41,104.05,100.00,96.33,95.79,88.69,90.01,89.60,87.70,83.29,83.70,80.03,80.21,82.28,78.28,69.72,71.61];
  const wx = xb.map((v, i) => v * D65[i]), wy = yb.map((v, i) => v * D65[i]), wz = zb.map((v, i) => v * D65[i]);
  const Ynorm = wy.reduce((a, b) => a + b, 0);

  function specToLinRGB(R) {
    let X = 0, Y = 0, Z = 0;
    for (let i = 0; i < NB; i++) { X += R[i] * wx[i]; Y += R[i] * wy[i]; Z += R[i] * wz[i]; }
    X /= Ynorm; Y /= Ynorm; Z /= Ynorm;
    return [
      3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
      -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z,
      0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
    ];
  }
  // white-normalise so a perfect reflector maps to (1,1,1)
  const W = specToLinRGB(new Array(NB).fill(1));

  // --- colour math
  const s2l = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const l2s = c => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  function linToSrgb(lin) { return lin.map((c, k) => Math.round(255 * Math.min(1, Math.max(0, l2s(c / W[k]))))); }
  function rgbToHex(rgb) { return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join(''); }
  function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  // --- Pigments (parametric reflectance curves, tuned to typical acrylic masstones)
  const mk = (f) => lam.map(l => Math.min(0.95, Math.max(0.012, f(l))));
  // shape helpers
  const Yel = (edge, top = 0.84, w = 11, base = 0.05) => l => base + top * sig((l - edge) / w);
  const Red = (edge, top = 0.8, w = 10, blue = 0, base = 0.04) => l => base + blue * gau(l, 425, 28) + top * sig((l - edge) / w);
  const Blu = (pk, h, wd, tail = 0, base = 0.03, tailAt = 670) => l => base + h * gau(l, pk, wd) + tail * sig((l - tailAt) / 14);
  const Grn = (pk, h, wd, tail = 0, base = 0.03) => l => base + h * gau(l, pk, wd) + tail * sig((l - 680) / 14);
  const Earth = (edge, top, w, base, slope = 0) => l => base + top * sig((l - edge) / w) + slope * (l - 400) / 300;

  const G = { prim: 'Primaries', yel: 'Yellows', ora: 'Oranges', red: 'Reds', pur: 'Purples & pinks', blu: 'Blues', grn: 'Greens', ear: 'Earths & browns', blk: 'Greys & blacks' };
  // strong = high tinting strength: add in small amounts
  const LIB = [
    // primaries (the starter set)
    ['white',   G.prim, 'Titanium White',        'White',        'PW6',    0, l => 0.90 + 0.03 * sig((l - 430) / 10)],
    ['yellow',  G.prim, 'Hansa Yellow Light',    'Hansa Yellow', 'PY3',    0, Yel(505)],
    ['magenta', G.prim, 'Quinacridone Magenta',  'Magenta',      'PR122',  1, l => 0.035 + 0.30 * gau(l, 425, 28) + 0.80 * sig((l - 612) / 16)],
    ['cyan',    G.prim, 'Phthalo Blue (Green Shade)', 'Phthalo Blue', 'PB15:3', 1, Blu(482, 0.38, 36, 0.03, 0.03, 680)],
    ['black',   G.prim, 'Mars Black',            'Black',        'PBk11',  1, l => 0.035 + 0.005 * (l - 400) / 300],
    // yellows
    ['lemon',    G.yel, 'Cadmium Yellow Lemon',  'Lemon Yellow',  'PY35',  0, Yel(500, 0.83, 9)],
    ['cadYelL',  G.yel, 'Cadmium Yellow Light',  'Cad. Yellow Light', 'PY35', 0, Yel(515, 0.84, 10)],
    ['yellowW',  G.yel, 'Cadmium Yellow Medium', 'Cad. Yellow',   'PY35',  0, Yel(528, 0.82, 10)],
    ['hansaMed', G.yel, 'Hansa Yellow Medium',   'Hansa Yellow Med.', 'PY74', 0, Yel(520, 0.84, 11)],
    ['diaryl',   G.yel, 'Diarylide Yellow',      'Diarylide Yellow', 'PY83', 0, Yel(545, 0.80, 12, 0.05)],
    ['naples',   G.yel, 'Naples Yellow Hue',     'Naples Yellow', 'PW6 · PY42', 0, Earth(495, 0.48, 22, 0.36)],
    // oranges
    ['cadOr',    G.ora, 'Cadmium Orange',        'Cad. Orange',   'PO20',  0, Yel(566, 0.82, 11, 0.045)],
    ['pyrOr',    G.ora, 'Pyrrole Orange',        'Pyrrole Orange','PO73',  0, Yel(578, 0.82, 10, 0.04)],
    // reds
    ['red',      G.red, 'Cadmium Red Light',     'Cad. Red Light','PR108', 0, Red(594)],
    ['cadRedM',  G.red, 'Cadmium Red Medium',    'Cad. Red',      'PR108', 0, Red(606, 0.78, 10, 0, 0.035)],
    ['pyrRed',   G.red, 'Pyrrole Red',           'Pyrrole Red',   'PR254', 0, Red(600, 0.80, 9, 0.02, 0.035)],
    ['naphRed',  G.red, 'Naphthol Crimson',      'Naphthol Crimson', 'PR170', 1, Red(612, 0.76, 11, 0.06, 0.035)],
    ['quinRed',  G.red, 'Quinacridone Red',      'Quin. Red',     'PV19',  1, Red(602, 0.80, 13, 0.16, 0.035)],
    ['alizarin', G.red, 'Alizarin Crimson Hue',  'Alizarin Crimson', 'PR177 · PV19', 1, Red(628, 0.62, 16, 0.10, 0.03)],
    // purples & pinks
    ['quinViol', G.pur, 'Quinacridone Violet',   'Quin. Violet',  'PV19',  1, l => 0.035 + 0.22 * gau(l, 420, 30) + 0.62 * sig((l - 625) / 16)],
    ['dioxazine',G.pur, 'Dioxazine Purple',      'Dioxazine Purple', 'PV23', 1, l => 0.025 + 0.13 * gau(l, 425, 32) + 0.30 * sig((l - 660) / 16)],
    ['ultraViol',G.pur, 'Ultramarine Violet',    'Ultra. Violet', 'PV15',  0, l => 0.04 + 0.30 * gau(l, 430, 35) + 0.35 * sig((l - 640) / 18)],
    ['opera',    G.pur, 'Brilliant Rose / Opera Pink', 'Rose Pink', 'PR122 · PW6', 0, l => 0.18 + 0.50 * gau(l, 425, 34) + 0.72 * sig((l - 590) / 18)],
    // blues
    ['ultra',    G.blu, 'Ultramarine Blue',      'Ultramarine',   'PB29',  0, Blu(448, 0.40, 32, 0.22, 0.03)],
    ['cobalt',   G.blu, 'Cobalt Blue',           'Cobalt Blue',   'PB28',  0, Blu(462, 0.50, 38, 0.12, 0.04, 690)],
    ['cerulean', G.blu, 'Cerulean Blue Hue',     'Cerulean',      'PB15 · PW6', 0, Blu(482, 0.58, 48, 0.08, 0.10, 690)],
    ['phthaloRS',G.blu, 'Phthalo Blue (Red Shade)', 'Phthalo Blue RS', 'PB15:1', 1, Blu(465, 0.33, 34, 0.04, 0.03, 680)],
    ['prussian', G.blu, 'Prussian Blue',         'Prussian Blue', 'PB27',  1, Blu(478, 0.14, 40, 0.02, 0.025, 690)],
    ['manganese',G.blu, 'Manganese Blue Hue',    'Manganese Blue','PB15',  1, Blu(492, 0.48, 40, 0.03, 0.04, 690)],
    // greens
    ['phthaloG', G.grn, 'Phthalo Green (Blue Shade)',   'Phthalo Green', 'PG7',  1, Grn(508, 0.36, 30)],
    ['phthaloGY',G.grn, 'Phthalo Green (Yellow Shade)', 'Phthalo Green YS', 'PG36', 1, Grn(524, 0.40, 30)],
    ['permGreen',G.grn, 'Permanent Green Light', 'Perm. Green Light', 'PG7 · PY3', 0, Grn(540, 0.58, 38, 0.06, 0.05)],
    ['sap',      G.grn, 'Sap Green',             'Sap Green',     'PG7 · PY110', 0, Grn(552, 0.15, 42, 0.10, 0.03)],
    ['chromOx',  G.grn, 'Chromium Oxide Green',  'Chrom. Ox. Green', 'PG17', 0, Grn(540, 0.22, 46, 0.08, 0.06)],
    ['hooker',   G.grn, "Hooker's Green Hue",   "Hooker's Green", 'PG7 · PY', 1, Grn(530, 0.16, 36, 0.04, 0.03)],
    // earths
    ['ochre',    G.ear, 'Yellow Ochre',          'Yellow Ochre',  'PY42',  0, Earth(545, 0.50, 22, 0.08)],
    ['rawSienna',G.ear, 'Raw Sienna',            'Raw Sienna',    'PBr7',  0, Earth(565, 0.42, 24, 0.06)],
    ['burntSien',G.ear, 'Burnt Sienna',          'Burnt Sienna',  'PR101', 0, Earth(600, 0.36, 26, 0.045)],
    ['redOxide', G.ear, 'Red Oxide',             'Red Oxide',     'PR101', 0, Earth(608, 0.30, 20, 0.04)],
    ['rawUmber', G.ear, 'Raw Umber',             'Raw Umber',     'PBr7',  1, Earth(560, 0.10, 40, 0.04, 0.03)],
    ['burntUmb', G.ear, 'Burnt Umber',           'Burnt Umber',   'PBr7',  1, Earth(595, 0.13, 30, 0.035, 0.01)],
    ['vanDyke',  G.ear, 'Van Dyke Brown Hue',    'Van Dyke Brown','PBr7 · PBk', 1, Earth(600, 0.06, 35, 0.03)],
    // greys & blacks
    ['ivory',    G.blk, 'Ivory Black',           'Ivory Black',   'PBk9',  1, l => 0.032 + 0.012 * (l - 400) / 300],
    ['carbon',   G.blk, 'Carbon Black',          'Carbon Black',  'PBk7',  1, l => 0.022],
    ['paynes',   G.blk, "Payne's Grey",          "Payne's Grey",  'PB29 · PBk', 1, l => 0.035 + 0.05 * gau(l, 460, 50)],
    ['neutral',  G.blk, 'Neutral Grey (N5)',     'Neutral Grey',  'PW6 · PBk', 0, l => 0.20],
  ];
  const PIGMENTS = LIB.map(([id, group, name, short, code, strong, f]) => ({ id, group, name, short, code, strong: !!strong, core: group === G.prim, R: mk(f) }));
  const GROUPS = Object.values(G);
  for (const p of PIGMENTS) {
    p.KS = p.R.map(r => (1 - r) ** 2 / (2 * r));
    p.hex = rgbToHex(linToSrgb(specToLinRGB(p.R)));
  }

  function mixSpectrum(pigs, w) {
    const R = new Array(NB);
    for (let i = 0; i < NB; i++) {
      let ks = 0;
      for (let j = 0; j < pigs.length; j++) ks += w[j] * pigs[j].KS[i];
      R[i] = 1 + ks - Math.sqrt(ks * ks + 2 * ks);
    }
    return R;
  }

  function linNormToLab(lin) { // lin already white-normalised (0..1 linear sRGB)
    const [r, g, b] = lin;
    const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
    const Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
    const Z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
    const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
    const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function rgbToLab(rgb) { return linNormToLab(rgb.map(v => s2l(v / 255))); }
  function specToLab(R) { const lin = specToLinRGB(R); return linNormToLab(lin.map((c, k) => Math.max(0, c / W[k]))); }
  function specToHex(R) { return rgbToHex(linToSrgb(specToLinRGB(R))); }

  function dE00(a, b) {
    const [L1, a1, b1] = a, [L2, a2, b2] = b;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h = (x, y) => { if (x === 0 && y === 0) return 0; let d = Math.atan2(y, x) * 180 / Math.PI; return d < 0 ? d + 360 : d; };
    const h1p = h(a1p, b1), h2p = h(a2p, b2);
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360; hbp /= 2; }
    const T = 1 - 0.17 * Math.cos((hbp - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hbp * Math.PI / 180) + 0.32 * Math.cos((3 * hbp + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * hbp - 63) * Math.PI / 180);
    const dTh = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
    const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
    const Sl = 1 + 0.015 * (Lbp - 50) ** 2 / Math.sqrt(20 + (Lbp - 50) ** 2);
    const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin(2 * dTh * Math.PI / 180) * Rc;
    return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
  }

  // --- solver
  function evalMix(pigs, w, targetLab) { return dE00(specToLab(mixSpectrum(pigs, w)), targetLab); }

  function* compositions(n, k) { // positive integer compositions of n into k parts
    if (k === 1) { yield [n]; return; }
    for (let i = 1; i <= n - k + 1; i++) for (const rest of compositions(n - i, k - 1)) yield [i, ...rest];
  }
  function* subsets(arr, maxK) {
    const n = arr.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      const s = []; for (let i = 0; i < n; i++) if (mask & (1 << i)) s.push(arr[i]);
      if (s.length <= maxK) yield s;
    }
  }

  function refine(pigs, w0, targetLab) {
    let w = w0.slice(), best = evalMix(pigs, w, targetLab);
    let step = 1.6;
    while (step > 1.004) {
      let improved = false;
      for (let j = 0; j < w.length; j++) {
        for (const f of [step, 1 / step]) {
          const t = w.slice(); t[j] *= f;
          const s = t.reduce((a, b) => a + b, 0); for (let k = 0; k < t.length; k++) t[k] /= s;
          const d = evalMix(pigs, t, targetLab);
          if (d < best - 1e-6) { best = d; w = t; improved = true; }
        }
      }
      if (!improved) step = Math.sqrt(step);
    }
    return { w, dE: best };
  }

  // with a big collection, keep the paints that do best alone or in pairs (plus white and black)
  function shortlist(pool, targetLab, max) {
    const score = new Map(pool.map(p => [p.id, evalMix([p], [1], targetLab)]));
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      for (let a = 1; a < 10; a++) {
        const wa = a * a, wb = (10 - a) * (10 - a), t = wa + wb;
        const d = evalMix([pool[i], pool[j]], [wa / t, wb / t], targetLab);
        if (d < score.get(pool[i].id)) score.set(pool[i].id, d);
        if (d < score.get(pool[j].id)) score.set(pool[j].id, d);
      }
    }
    const keep = pool.filter(p => p.id === 'white' || p.id === 'black');
    for (const p of pool.slice().sort((a, b) => score.get(a.id) - score.get(b.id))) {
      if (keep.length >= max) break;
      if (!keep.includes(p)) keep.push(p);
    }
    return keep;
  }

  function solve(targetRgb, enabledIds, maxPaints = 4) {
    const targetLab = rgbToLab(targetRgb);
    let pool = PIGMENTS.filter(p => enabledIds.includes(p.id));
    if (pool.length > 10) pool = shortlist(pool, targetLab, 10);
    const coarse = [];
    const N = 10;
    for (const s of subsets(pool, maxPaints)) {
      let bestHere = null;
      for (const c of compositions(Math.max(N, s.length), s.length)) {
        // bias small amounts for strong pigments by squaring proportions
        const raw = c.map(v => v * v); const tot = raw.reduce((a, b) => a + b, 0);
        const w = raw.map(v => v / tot);
        const d = evalMix(s, w, targetLab);
        if (!bestHere || d < bestHere.dE) bestHere = { pigs: s, w, dE: d };
      }
      coarse.push(bestHere);
    }
    coarse.sort((a, b) => a.dE - b.dE);
    const results = [];
    for (const c of coarse.slice(0, 18)) {
      const r = refine(c.pigs, c.w, targetLab);
      results.push(finish(c.pigs, r.w, r.dE, targetLab));
    }
    results.sort((a, b) => a.dE - b.dE);
    const best = results[0];
    // simpler alternative: fewest paints within +2.5 ΔE of best
    let simple = null;
    for (const r of results) {
      if (r.items.length < best.items.length && r.dE <= best.dE + 2.5) {
        if (!simple || r.items.length < simple.items.length || (r.items.length === simple.items.length && r.dE < simple.dE)) simple = r;
      }
    }
    return { targetLab, best, simple };
  }

  function finish(pigs, w, dE, targetLab) {
    // drop negligible components (<0.15%) and re-evaluate
    let items = pigs.map((p, i) => ({ p, w: w[i] })).filter(x => x.w >= 0.0015);
    const tot = items.reduce((a, b) => a + b.w, 0); items.forEach(x => x.w /= tot);
    const ps = items.map(x => x.p), ws = items.map(x => x.w);
    const R = mixSpectrum(ps, ws);
    dE = dE00(specToLab(R), targetLab);
    items.sort((a, b) => b.w - a.w);
    return { items, dE, hex: specToHex(R), parts: toParts(items, targetLab, dE) };
  }

  function toParts(items, targetLab, dEbest) {
    // smallest whole-number ratio whose mix stays within 1.5 ΔE of the exact one
    for (let T = 2; T <= 60; T++) {
      const parts = items.map(x => Math.round(x.w * T));
      if (parts.every(v => v === 0)) continue;
      const use = items.map((x, i) => ({ p: x.p, n: parts[i] })).filter(x => x.n > 0);
      const s = use.reduce((a, b) => a + b.n, 0);
      const d = evalMix(use.map(u => u.p), use.map(u => u.n / s), targetLab);
      if (d <= dEbest + 1.5) return { T, parts, dE: d };
    }
    return null;
  }

  return { PIGMENTS, GROUPS, solve, hexToRgb, rgbToHex, rgbToLab, dE00, s2l, l2s };
})();



import { Engine } from './engine.js';
import './style.css';

const $ = id => document.getElementById(id);
const P = Engine.PIGMENTS;
const store = { get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
                set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} } };

let enabled = store.get('amf.paints', P.filter(p => p.core).map(p => p.id)).filter(id => P.some(p => p.id === id));
if (!enabled.length) enabled = P.filter(p => p.core).map(p => p.id);
let maxPaints = store.get('amf.max', 4);
$('maxP').value = String(maxPaints);
let target = [138,154,91];

// ---------- paints: primaries + colour groups
const CORE = P.filter(p => p.core).map(p => p.id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const chev = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 6 6 6-6 6"/></svg>';

function paintCard(p){
  const el = document.createElement('label');
  el.className = 'paint';
  el.dataset.id = p.id;
  el.dataset.search = (p.name + ' ' + p.short + ' ' + p.code + ' ' + p.group).toLowerCase();
  el.innerHTML = `<input type="checkbox" id="pp-${p.id}"><span class="dab" style="background:${p.hex}"></span><span style="min-width:0"><div class="nm">${esc(p.name)}</div><div class="cd">${esc(p.code)}${p.strong ? ' · strong' : ''}</div></span>`;
  el.querySelector('input').addEventListener('change', e => togglePaint(p.id, e.target.checked));
  return el;
}
function buildPaints(){
  $('starter').innerHTML = '';
  P.filter(p => p.core).forEach(p => $('starter').appendChild(paintCard(p)));
  $('groups').innerHTML = '';
  for (const g of Engine.GROUPS.slice(1)){
    const ps = P.filter(p => p.group === g);
    const d = document.createElement('details');
    d.dataset.group = g;
    d.innerHTML = `<summary>${chev}<span class="gname">${esc(g)}<span class="gdots">${ps.map(p => `<i style="background:${p.hex}"></i>`).join('')}</span></span><span class="count"></span></summary><div class="inner"><div class="paints"></div></div>`;
    const box = d.querySelector('.paints');
    ps.forEach(p => box.appendChild(paintCard(p)));
    $('groups').appendChild(d);
  }
  syncPaints();
}
function syncPaints(){
  document.querySelectorAll('.paint[data-id]').forEach(el => {
    const on = enabled.includes(el.dataset.id);
    el.querySelector('input').checked = on;
    el.classList.toggle('off', !on);
    el.classList.toggle('has', on && !CORE.includes(el.dataset.id));
  });
  document.querySelectorAll('#groups details').forEach(d => {
    const ids = P.filter(p => p.group === d.dataset.group).map(p => p.id);
    const n = ids.filter(id => enabled.includes(id)).length;
    const c = d.querySelector('.count');
    c.textContent = n ? `${n} of ${ids.length} owned` : `${ids.length} paints`;
    c.classList.toggle('on', n > 0);
  });
  const extra = enabled.filter(id => !CORE.includes(id)).length;
  const prim = enabled.filter(id => CORE.includes(id)).length;
  $('paintCount').textContent = `${prim} of 5 primaries` + (extra ? ` and ${extra} other tube${extra > 1 ? 's' : ''} in use` : ' in use');
}
function togglePaint(id, on){
  if (on){ if (!enabled.includes(id)) enabled.push(id); }
  else enabled = enabled.filter(x => x !== id);
  if (!enabled.length){ enabled = [id]; }
  store.set('amf.paints', enabled); syncPaints(); run();
}
$('maxP').addEventListener('change', e => { maxPaints = +e.target.value; store.set('amf.max', maxPaints); run(); });
$('resetSet').onclick = () => { enabled = CORE.slice(); store.set('amf.paints', enabled); syncPaints(); run(); note(`Back to the five primaries.`); };

// search across groups: opens groups with matches, hides the rest
$('paintSearch').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#groups details').forEach(d => {
    let hits = 0;
    d.querySelectorAll('.paint').forEach(el => { const m = !q || el.dataset.search.includes(q); el.hidden = !m; if (m) hits++; });
    d.hidden = !!q && !hits;
    if (q) d.open = hits > 0;
  });
});

// ---------- save / load paint set
function note(html, err){ const m = $('setMsg'); m.hidden = false; m.className = 'msg' + (err ? ' err' : ''); m.innerHTML = html; clearTimeout(note.t); note.t = setTimeout(() => m.hidden = true, 7000); }
function setFile(){
  return JSON.stringify({
    app: 'ToneCooker', version: 1, saved: new Date().toISOString().slice(0, 10),
    maxPaintsPerMix: maxPaints,
    paints: P.filter(p => enabled.includes(p.id)).map(p => ({ id: p.id, name: p.name, pigment: p.code, group: p.group }))
  }, null, 2);
}
let downloads = null;
if (window.claude && window.claude.use) window.claude.use('downloads').then(d => { downloads = d; }).catch(() => {});
$('saveSet').onclick = async () => {
  const text = setFile();
  if (downloads){
    try { await downloads.save({ filename: 'my-acrylic-paints.json', data: text }); note(`Saved <b>my-acrylic-paints.json</b> with ${enabled.length} paints.`); return; }
    catch(e){ if (e && e.code === 'declined') return; if (e && e.code === 'rate_limited'){ note('A save is already waiting for you. Finish that one first.', true); return; } }
  }
  $('fileText').value = text; $('fileBox').hidden = false;
};
$('copyText').onclick = () => {
  const t = $('fileText');
  const ok = () => { $('copyText').textContent = 'Copied'; setTimeout(() => $('copyText').textContent = 'Copy', 1600); };
  try { navigator.clipboard.writeText(t.value).then(ok, () => { t.select(); }); } catch(e){ t.select(); }
};
$('closeBox').onclick = () => $('fileBox').hidden = true;

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
function findPaint(entry){
  if (entry && typeof entry === 'object') entry = entry.id || entry.name || '';
  const n = norm(entry); if (!n) return null;
  return P.find(p => norm(p.id) === n) || P.find(p => norm(p.name) === n) || P.find(p => norm(p.short) === n)
      || P.find(p => norm(p.name).includes(n) || n.includes(norm(p.name)));
}
$('loadSet').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  let text = '';
  try { text = await f.text(); } catch(err){ note('That file couldn’t be read.', true); return; }
  let list = null, max = null;
  try { const j = JSON.parse(text); list = Array.isArray(j) ? j : j.paints; max = j.maxPaintsPerMix; } catch(err){ list = text.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean); }
  if (!Array.isArray(list) || !list.length){ note('No paints found in that file. Use a file saved from this app, or a text file with one paint name per line.', true); return; }
  const found = [], unknown = [];
  list.forEach(x => { const p = findPaint(x); if (p){ if (!found.includes(p.id)) found.push(p.id); } else unknown.push(typeof x === 'object' ? (x.name || x.id) : x); });
  if (!found.length){ note('None of the paint names in that file matched paints in this app.', true); return; }
  enabled = found; store.set('amf.paints', enabled);
  if ([2,3,4,5].includes(max)){ maxPaints = max; $('maxP').value = String(max); store.set('amf.max', max); }
  syncPaints(); run();
  note(`Loaded ${found.length} paint${found.length > 1 ? 's' : ''} from <b>${esc(f.name)}</b>.` + (unknown.length ? ` Not recognised: ${unknown.slice(0, 5).map(esc).join(', ')}${unknown.length > 5 ? '…' : ''}.` : ''), false);
});

// ---------- result
const fmtPct = w => { const v = w*100; return v < 1 ? v.toFixed(1)+'%' : v < 10 ? v.toFixed(1)+'%' : Math.round(v)+'%'; };
const short = p => p.short;
function verdict(d){
  if (d < 2) return ['good','Near-perfect match'];
  if (d < 5) return ['good','Very close'];
  if (d < 9) return ['warn','Close, slightly off'];
  return ['bad','Out of reach — closest possible'];
}
function partsLine(r){
  if (!r.parts) return '';
  const bits = [], touches = [];
  r.items.forEach((x,i) => { const n = r.parts.parts[i]; if (n > 0) bits.push(`${n} ${short(x.p)}`); else touches.push(short(x.p)); });
  return bits.join(' : ') + (touches.length ? ` + a touch of ${touches.join(' and ')}` : '');
}
function recipeHTML(r){
  return r.items.map((x,i) => {
    const n = r.parts ? r.parts.parts[i] : null;
    const pt = n == null ? '' : n === 0 ? 'touch' : `${n} part${n>1?'s':''}`;
    return `<div class="ri"><span class="dab" style="background:${x.p.hex}"></span><div><div class="nm">${x.p.name}${x.p.strong?'<span class="strong">strong</span>':''}</div><div class="cd">${x.p.code}</div></div><div class="pc">${fmtPct(x.w)}</div><div class="pt">${pt}</div></div>`;
  }).join('');
}
function steps(r){
  const items = r.items.slice();
  // base = the largest weak paint; then other weak paints; strong paints last, smallest first
  const weak = items.filter(x => !x.p.strong).sort((a,b) => b.w - a.w);
  const strong = items.filter(x => x.p.strong).sort((a,b) => b.w - a.w);
  const out = [];
  const order = weak.length ? weak : [strong.shift()];
  order.forEach((x,i) => out.push(i === 0
    ? `Put down the <b>${x.p.name}</b> first (${fmtPct(x.w)} of the mix). It's your base.`
    : `Mix in the <b>${x.p.name}</b> (${fmtPct(x.w)}).`));
  strong.forEach(x => out.push(x.w < 0.04
    ? `Add <b>${x.p.name}</b> with the tip of the knife, a speck at a time (${fmtPct(x.w)}). It's very strong.`
    : `Add <b>${x.p.name}</b> gradually (${fmtPct(x.w)}). Stop and compare as you go.`));
  out.push('Let a dab dry next to your target. Acrylics usually dry a little darker.');
  return out.map(s => `<li>${s}</li>`).join('');
}

let runTimer = 0;
function run(){
  clearTimeout(runTimer);
  runTimer = setTimeout(() => {
    const hex = Engine.rgbToHex(target).toUpperCase();
    const res = Engine.solve(target, enabled, maxPaints);
    const b = res.best;
    $('swT').style.background = hex; $('hexT').textContent = hex;
    $('swM').style.background = b.hex; $('hexM').textContent = b.hex.toUpperCase();
    const [cls, txt] = verdict(b.dE);
    $('pill').className = 'pill ' + cls; $('pill').textContent = txt;
    $('deTxt').textContent = `ΔE2000 ${b.dE.toFixed(1)}`;
    $('strip').innerHTML = b.items.map(x => `<span style="background:${x.p.hex};flex-grow:${x.w}" title="${x.p.name} ${fmtPct(x.w)}"></span>`).join('');
    $('recipe').innerHTML = recipeHTML(b);
    const pl = partsLine(b);
    $('ratio').innerHTML = pl ? `${pl}<small>Whole-number ratio. Use the same scoop or knife-load for each part.</small>` : `<small>The amounts are too uneven for a simple ratio. Start from the base and add the others by weight or in tiny dabs.</small>`;
    $('steps').innerHTML = steps(b);
    $('dT').style.background = hex; $('dM').style.background = b.hex;
    $('dV').textContent = `${txt} · ΔE ${b.dE.toFixed(1)}`;
    $('dR').textContent = pl || b.items.map(x => `${short(x.p)} ${fmtPct(x.w)}`).join(' · ');

    // gamut + "more paints" suggestion
    let gm = '', sugg = [];
    if (b.dE >= 5){
      const all = P.map(p => p.id);
      const missing = all.filter(id => !enabled.includes(id));
      if (missing.length){
        const better = Engine.solve(target, all, Math.max(maxPaints, 4)).best;
        const addP = better.items.filter(x => missing.includes(x.p.id)).map(x => x.p);
        if (better.dE < b.dE - 2 && addP.length){
          gm = `With <b>${addP.map(p => esc(p.name)).join('</b> and <b>')}</b> this gets to ΔE ${better.dE.toFixed(1)}. <button class="btn small" id="useSugg" style="margin-top:8px">I have ${addP.length > 1 ? 'these' : 'it'}, use ${addP.length > 1 ? 'them' : 'it'}</button>`;
          sugg = addP.map(p => p.id);
        }
      }
      if (!gm && b.dE >= 9) gm = 'This colour is brighter or purer than these paints can make together. The recipe is the closest you can get. A ready-made tube in this colour is the only way to hit it exactly.';
      if (!gm && maxPaints < 4) gm = 'Allowing more paints in one mix may get closer.';
    }
    $('gamutMsg').hidden = !gm; $('gamutMsg').innerHTML = gm;
    if ($('useSugg')) $('useSugg').onclick = () => { sugg.forEach(id => { if (!enabled.includes(id)) enabled.push(id); }); store.set('amf.paints', enabled); syncPaints(); run(); };

    const s = res.simple;
    if (s){
      $('alt').hidden = false;
      $('alt').innerHTML = `<div class="head"><h3 style="font-size:16px">Simpler: ${s.items.length} paint${s.items.length>1?'s':''}</h3><span class="de"><span class="miniswatch" style="background:${s.hex}"></span> ΔE ${s.dE.toFixed(1)}</span></div><div class="strip">${s.items.map(x => `<span style="background:${x.p.hex};flex-grow:${x.w}"></span>`).join('')}</div><div class="recipe">${recipeHTML(s)}</div>${partsLine(s)?`<div class="ratio" style="font-size:17px">${partsLine(s)}</div>`:''}`;
    } else $('alt').hidden = true;
    pushRecent(hex);
  }, 60);
}

// ---------- manual input
const EX = [['#8A9A5B','Sage'],['#C0392B','Brick red'],['#E8A33D','Ochre'],['#2E5E8C','Denim'],['#6B4E9B','Violet'],['#D8B4A0','Skin tone'],['#5B3A29','Chocolate'],['#87CEEB','Sky'],['#2F4F3E','Forest'],['#9FA4A9','Cool grey']];
function chip(hex, title, onClick){ const b = document.createElement('button'); b.className = 'chip'; b.style.background = hex; b.title = title; b.setAttribute('aria-label', title + ' ' + hex); b.onclick = onClick; return b; }
EX.forEach(([h,n]) => $('examples').appendChild(chip(h, n, () => setTarget(Engine.hexToRgb(h)))));
let recent = store.get('amf.recent', []);
function pushRecent(hex){ recent = [hex, ...recent.filter(h => h !== hex)].slice(0, 10); store.set('amf.recent', recent); }

function parseColour(s){
  s = s.trim();
  let m = s.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i); if (m) return Engine.hexToRgb(m[1]);
  m = s.match(/^(?:rgb\s*\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)?$/i);
  if (m){ const v = m.slice(1,4).map(Number); if (v.every(x => x <= 255)) return v; }
  return null;
}
function setTarget(rgb, from){
  target = rgb.map(v => Math.round(v));
  const hex = Engine.rgbToHex(target).toUpperCase();
  if (from !== 'picker') $('colorIn').value = hex.toLowerCase();
  if (from !== 'hex') $('hexIn').value = hex;
  $('hexHint').textContent = 'Type a hex code like #4A7C59 or an RGB value like 74, 124, 89.';
  $('hexHint').style.color = '';
  run();
}
$('colorIn').addEventListener('input', e => setTarget(Engine.hexToRgb(e.target.value), 'picker'));
function hexSubmit(){ const c = parseColour($('hexIn').value); if (c) setTarget(c); else { $('hexHint').textContent = 'That isn’t a colour code. Use #RRGGBB (like #4A7C59) or three numbers 0–255.'; $('hexHint').style.color = 'var(--bad)'; } }
$('hexGo').onclick = hexSubmit;
$('hexIn').addEventListener('keydown', e => { if (e.key === 'Enter') hexSubmit(); });

// ---------- tabs
let tab = 'code';
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(t){
  tab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $('pane-code').hidden = t !== 'code';
  $('pane-src').hidden = t === 'code';
  ['photo','camera','link'].forEach(k => $('src-'+k).hidden = k !== t);
  if (t !== 'code') requestAnimationFrame(placeMarkers);
}

// ---------- image handling
const cv = $('cv'), ctx = cv.getContext('2d', { willReadFrequently: true });
let img = null, pick = null, wbRef = null, wbMode = false;   // pick/wbRef in canvas pixel coords
const MAXDIM = 1400;

function loadBitmapToCanvas(source, name){
  const w0 = source.naturalWidth || source.width, h0 = source.naturalHeight || source.height;
  const k = Math.min(1, MAXDIM / Math.max(w0, h0));
  cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
  ctx.drawImage(source, 0, 0, cv.width, cv.height);
  img = true; pick = null; wbRef = null; wbMode = false; updWbBtn();
  $('imgName').textContent = name || 'Photo';
  $('mk').hidden = true; $('mkwb').hidden = true;
  $('stageHint').textContent = 'Click or tap the photo to pick a colour. Drag to fine-tune.';
  dominant();
}
function loadFile(file){
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.onload = () => { loadBitmapToCanvas(im, file.name && file.name !== 'image.png' ? file.name : 'Pasted image'); URL.revokeObjectURL(url); };
  im.onerror = () => { $('stageHint').textContent = 'That file couldn’t be opened as an image. Try a JPG or PNG.'; };
  im.src = url;
}
$('fileIn').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
$('camIn').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });

// drag & drop + paste
const dropZone = $('pane-src');
['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); $('src-photo').classList.add('over'); }));
['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); $('src-photo').classList.remove('over'); }));
dropZone.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
document.addEventListener('paste', e => {
  const items = [...(e.clipboardData?.items || [])];
  const imgItem = items.find(i => i.type.startsWith('image/'));
  if (imgItem){ e.preventDefault(); if (tab === 'code' || tab === 'camera') showTab('photo'); loadFile(imgItem.getAsFile()); return; }
  const text = e.clipboardData?.getData('text') || '';
  if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  const c = parseColour(text); if (c){ showTab('code'); setTarget(c); return; }
  if (/^https?:\/\//i.test(text.trim())){ showTab('link'); $('urlIn').value = text.trim(); loadUrl(); }
});

// link
function loadUrl(){
  const u = $('urlIn').value.trim();
  const msg = $('urlMsg');
  if (!/^https?:\/\//i.test(u)){ msg.hidden = false; msg.className = 'msg err'; msg.textContent = 'Paste a full link that starts with https://'; return; }
  msg.hidden = false; msg.className = 'msg'; msg.textContent = 'Loading…';
  const im = new Image(); im.crossOrigin = 'anonymous';
  let done = false;
  const fail = () => { if (done) return; done = true; msg.className = 'msg err';
    msg.innerHTML = 'This image can’t be opened from a link here. Open the link in your browser, right-click or long-press the picture, choose <b>Copy image</b>, then come back and press Ctrl+V / ⌘V.'; };
  im.onload = () => { if (done) return; done = true;
    try { loadBitmapToCanvas(im, u.split('/').pop().split('?')[0] || 'Linked image'); ctx.getImageData(0,0,1,1); msg.hidden = true; }
    catch(e){ fail(); } };
  im.onerror = fail;
  setTimeout(fail, 8000);
  im.src = u;
}
$('urlGo').onclick = loadUrl;
$('urlIn').addEventListener('keydown', e => { if (e.key === 'Enter') loadUrl(); });

// sampling
const lin = v => Engine.s2l(v/255), unlin = c => Math.round(255*Math.min(1,Math.max(0,Engine.l2s(c))));
function avgAt(x, y){
  const r = +$('radius').value;
  const x0 = Math.max(0, Math.round(x - r)), y0 = Math.max(0, Math.round(y - r));
  const x1 = Math.min(cv.width - 1, Math.round(x + r)), y1 = Math.min(cv.height - 1, Math.round(y + r));
  const d = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
  let s = [0,0,0], n = 0;
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++){
    if ((i-x)**2 + (j-y)**2 > r*r + 0.5) continue;
    const o = ((j - y0) * (x1 - x0 + 1) + (i - x0)) * 4;
    s[0] += lin(d[o]); s[1] += lin(d[o+1]); s[2] += lin(d[o+2]); n++;
  }
  return s.map(v => v / Math.max(1, n));   // linear
}
function applyWb(linRgb){
  if (!wbRef) return linRgb.map(unlin);
  const m = (wbRef[0] + wbRef[1] + wbRef[2]) / 3;
  return linRgb.map((c, k) => unlin(c * m / Math.max(1e-4, wbRef[k])));
}
function placeMarkers(){
  const rect = cv.getBoundingClientRect(); if (!rect.width) return;
  const sc = rect.width / cv.width;
  const place = (el, p) => { if (!p){ el.hidden = true; return; } el.hidden = false;
    const size = Math.max(14, (2 * +$('radius').value + 1) * sc + 6);
    el.style.left = p[0] * sc + 'px'; el.style.top = p[1] * sc + 'px'; el.style.width = el.style.height = size + 'px'; };
  place($('mk'), pick); place($('mkwb'), wbRef ? wbRef.pt : null);
}
window.addEventListener('resize', placeMarkers);
$('radius').addEventListener('input', () => { placeMarkers(); if (pick) samplePick(); });

function evToPx(e){
  const r = cv.getBoundingClientRect();
  return [Math.max(0, Math.min(cv.width - 1, (e.clientX - r.left) * cv.width / r.width)),
          Math.max(0, Math.min(cv.height - 1, (e.clientY - r.top) * cv.height / r.height))];
}
function samplePick(){ setTarget(applyWb(avgAt(pick[0], pick[1]))); }
let dragging = false;
cv.addEventListener('pointerdown', e => {
  if (!img) return;
  const p = evToPx(e);
  if (wbMode){
    const a = avgAt(p[0], p[1]); wbRef = [...a]; wbRef.pt = p; wbMode = false; updWbBtn();
    $('stageHint').textContent = 'White balance set. Colours from this photo are now corrected for the lighting.';
    placeMarkers(); dominant(); if (pick) samplePick(); return;
  }
  dragging = true; cv.setPointerCapture(e.pointerId);
  pick = p; placeMarkers(); samplePick();
});
cv.addEventListener('pointermove', e => { if (!dragging) return; pick = evToPx(e); placeMarkers(); samplePick(); });
cv.addEventListener('pointerup', () => dragging = false);
cv.addEventListener('pointercancel', () => dragging = false);
function updWbBtn(){
  const b = $('wbBtn');
  b.classList.toggle('on', wbMode || !!wbRef);
  b.textContent = wbMode ? 'Tap white or grey…' : wbRef ? 'White balance on ✕' : 'White balance';
}
$('wbBtn').onclick = () => {
  if (wbRef){ wbRef = null; wbMode = false; updWbBtn(); placeMarkers(); dominant(); if (pick) samplePick();
    $('stageHint').textContent = 'White balance removed.'; return; }
  wbMode = !wbMode; updWbBtn();
  $('stageHint').textContent = wbMode ? 'Now tap something that should be white or neutral grey, such as paper or a wall.' : 'Click or tap the photo to pick a colour. Drag to fine-tune.';
};

// dominant colours (k-means on a small copy, in linear RGB)
function dominant(){
  if (!img) return;
  const S = 72, k = Math.min(1, S / Math.max(cv.width, cv.height));
  const c2 = document.createElement('canvas'); c2.width = Math.max(1, Math.round(cv.width*k)); c2.height = Math.max(1, Math.round(cv.height*k));
  const x2 = c2.getContext('2d'); x2.drawImage(cv, 0, 0, c2.width, c2.height);
  const d = x2.getImageData(0, 0, c2.width, c2.height).data;
  const pts = []; for (let i = 0; i < d.length; i += 4) if (d[i+3] > 200) pts.push([lin(d[i]), lin(d[i+1]), lin(d[i+2])]);
  if (!pts.length) return;
  const K = 7; let cen = [];
  for (let i = 0; i < K; i++) cen.push(pts[Math.floor((i + 0.5) * pts.length / K)].slice());
  let asg = new Array(pts.length).fill(0);
  for (let it = 0; it < 12; it++){
    const sum = cen.map(() => [0,0,0,0]);
    pts.forEach((p, i) => { let best = 0, bd = 1e9; cen.forEach((c, j) => { const dd = (p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if (dd < bd){ bd = dd; best = j; } }); asg[i] = best; const s = sum[best]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++; });
    cen = sum.map((s, j) => s[3] ? [s[0]/s[3], s[1]/s[3], s[2]/s[3], s[3]] : [...cen[j].slice(0,3), 0]);
  }
  cen = cen.filter(c => c[3] > pts.length * 0.02).sort((a, b) => b[3] - a[3]);
  $('domi').innerHTML = '';
  cen.forEach(c => { const rgb = applyWb(c.slice(0,3)); const hex = Engine.rgbToHex(rgb).toUpperCase();
    $('domi').appendChild(chip(hex, `${Math.round(100*c[3]/pts.length)}% of photo`, () => { pick = null; placeMarkers(); setTarget(rgb); })); });
}

// sample board so the photo view isn't empty
function sampleBoard(){
  const c = document.createElement('canvas'); c.width = 900; c.height = 560; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 560); grd.addColorStop(0, '#d9dee4'); grd.addColorStop(1, '#b9c0c8'); g.fillStyle = grd; g.fillRect(0, 0, 900, 560);
  const sw = ['#8A9A5B','#C0392B','#E8A33D','#2E5E8C','#6B4E9B','#D8B4A0','#5B3A29','#87CEEB','#2F4F3E','#F2EDE4','#E26D5A','#3E8E7E'];
  sw.forEach((h, i) => { const col = i % 4, row = Math.floor(i / 4); const x = 40 + col * 210, y = 36 + row * 170;
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + 4, y + 6, 190, 140);
    g.fillStyle = h; g.fillRect(x, y, 190, 140);
    const sh = g.createLinearGradient(x, y, x + 190, y + 140); sh.addColorStop(0, 'rgba(255,255,255,.10)'); sh.addColorStop(1, 'rgba(0,0,0,.10)'); g.fillStyle = sh; g.fillRect(x, y, 190, 140); });
  loadBitmapToCanvas(c, 'Sample board — example');
}

// bottom dock: shows the current match whenever the recipe swatches are scrolled out of view
(() => {
  const dock = $('dock');
  const show = on => { dock.classList.toggle('show', on); dock.inert = !on; };
  $('dGo').onclick = () => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('recipeCard').scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  };
  if ('IntersectionObserver' in window){
    new IntersectionObserver(es => es.forEach(e => show(!e.isIntersecting)), { threshold: 0 }).observe($('compare'));
  }
})();

buildPaints();
sampleBoard();
setTarget(target);

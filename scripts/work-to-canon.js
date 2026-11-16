#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T624 굽기 한 줄 0 단계 · 기본은 표만 · 정본 무변)
// =============================================================================
// 에디터 작업 파일(`mf` = 세계 판) → 정본 `server/hanbando-terrain.json` 존 절 — `export-editor-work.js`(정본 → 작업)의 **거꾸로**.
//   ★짝 맞추기는 id 로 한다: 지금 정본을 `export-editor-work.js` 로 그 자리에서 뽑아(부르기만 · 임시 파일) 그 id ↔ 정본 항목을 잇고,
//     작업 파일의 같은 id 와 견준다. 작업 파일의 피처 꼴 · id · 이름을 그대로 쓴다(새 수 0 · 판정 0).
//     · 같다(id·종류·이름·기하가 뽑은 판과 같음)  → 정본 항목 **바이트 그대로**(광종·pk·마을 꼴 같은 정본 칸도 그대로)
//     · 기하·이름이 바뀜                         → 그 칸만 고친다(작업 점이 정본 점을 반올림한 것과 같으면 그 정본 점을 그대로 둔다)
//     · 작업 파일에 없다                          → 정본에서 뺀다
//     · 뽑은 판에 없는 id(에디터에서 새로 그림)    → 그 존 목록 끝에 붙인다(뒤 항목 차례·seedKey 무변) · 존 = 점·중심이 가장 많이 든 존
//   세계 → 존 좌표 = zone-config `worldOffsetX/Y`(= 에디터 WZONES · export-editor-work 와 같은 값).
//   새 피처 꼴은 에디터 Export(`buildExport`) · T550 적재와 같다: 강·계곡 {name, path:[{pos, width}]} · 산맥 + noFit/noValley/pinStart ·
//     숲 {center, rx, ry, densityMult} · 호수 rx=ry 면 {shape:'circle', radius} · 아니면 T550 꼴 {shape:'ellipse', rx, ry, a, b, rotation:0, radius} ·
//     고개 {pos, radius} · 광맥 {center, radius}(광종 칸 비움 → 굽기 한 줄 5단계 `t580-bake-nippon`/`t574-bake` 가 채운다) · 마을 {name, x, y}.
//   `_mirroredFrom` 항목은 작업 파일에 안 나오므로(export 가 건너뜀) 손대지 않는다.
// 게이트(왕복): 새 정본을 다시 `export-editor-work.js` 로 뽑은 `mf` = 작업 파일 `mf`(id 는 다시 매겨지므로 종류·이름·기하의 모둠으로 견준다 ·
//   호수는 export 가 radius 만 내므로 radius = 작업의 radius ?? ⌊(rx+ry)/2⌉ 로 견준다 — export 의 기존 꼴).
// 쓰는 법: node scripts/work-to-canon.js <작업 파일> [--apply] [--out <json>] [--json <표.json>]
//   기본 = 표만(정본 무변) · --apply = 정본에 쓴다 · --out = 다른 파일에 쓴다(예행 비교용) · rc 0 = 왕복 같음 · 3 = 왕복 다름 · 2 = 입력 오류
// =============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const WORK = argv[0];
if (!WORK || WORK.startsWith('--')) { console.error('쓰는 법: node scripts/work-to-canon.js <작업 파일> [--apply] [--out f] [--json f]'); process.exit(2); }
const APPLY = argv.includes('--apply'), OUT = opt('--out'), JOUT = opt('--json');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const R = Math.round;
const offOf = (z) => [ZONES[z].worldOffsetX || 0, ZONES[z].worldOffsetY || 0];
const zoneAt = (x, y) => { for (const [id, Z] of Object.entries(ZONES)) if (x >= Z.worldOffsetX && x < Z.worldOffsetX + Z.zoneWidth && y >= Z.worldOffsetY && y < Z.worldOffsetY + Z.zoneHeight) return id; return null; };

// ── 정본 → 작업(export-editor-work.js 를 부르기만) ──
function exportOf(gameText) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w2c-'));
  // export 는 정본 자리(server/hanbando-terrain.json)를 읽는다 — 다른 판을 견줄 땐 같은 꼴의 임시 레포 자리를 만든다
  let root = ROOT;
  if (gameText != null) {
    root = path.join(tmp, 'r'); fs.mkdirSync(path.join(root, 'server'), { recursive: true }); fs.mkdirSync(path.join(root, 'scripts'));
    fs.copyFileSync(path.join(ROOT, 'scripts', 'export-editor-work.js'), path.join(root, 'scripts', 'export-editor-work.js'));
    fs.copyFileSync(path.join(ROOT, 'server', 'zone-config.js'), path.join(root, 'server', 'zone-config.js'));
    fs.writeFileSync(path.join(root, 'server', 'hanbando-terrain.json'), gameText);
    for (const f of fs.readdirSync(path.join(ROOT, 'server'))) if (/\.js$/.test(f) && f !== 'zone-config.js' && !fs.existsSync(path.join(root, 'server', f))) {
      try { fs.symlinkSync(path.join(ROOT, 'server', f), path.join(root, 'server', f)); } catch (e) {} }
  }
  const out = path.join(tmp, 'w.json');
  execFileSync(process.execPath, [path.join(root, 'scripts', 'export-editor-work.js')], { env: { ...process.env, EW_ZONE: 'hanbando', EW_OUT: out }, stdio: 'ignore' });
  const w = JSON.parse(fs.readFileSync(out, 'utf8'));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  return w;
}

// ── 정본 항목을 export 와 같은 차례로 걷는다(그 차례가 곧 id) ──
//   export: 존 = Object.keys(정본) 중 '_' 아니고 zone-config 에 있는 것 · 존 안 = rivers · ridges · valleys · forests · lakes · passes · ores · villages
//   (선 = path 2점 이상 · 덩이 = center/pos 있는 것 · _mirroredFrom 건너뜀). 아래 걷기가 export 와 같은지는 기하 대조로 확인한다(어긋나면 멈춘다).
const KINDS = [['river', 'rivers', 'line'], ['ridge', 'ridges', 'line'], ['valley', 'valleys', 'line'], ['forest', 'forests', 'blob'],
  ['lake', 'lakes', 'blob'], ['pass', 'passes', 'blob'], ['ore', 'ores', 'blob'], ['village', 'villages', 'vil']];
function walk(world, firstId) {
  const slots = []; let id = firstId;
  for (const z of Object.keys(world)) {
    if (z[0] === '_' || !ZONES[z]) continue;
    const d = world[z] || {};
    for (const [type, key, shape] of KINDS) {
      (d[key] || []).forEach((f, i) => {
        if (shape !== 'vil' && f._mirroredFrom) return;
        if (shape === 'line' && (f.path || []).length < 2) return;
        if (shape === 'blob' && !(f.center || f.pos)) return;
        slots.push({ id: id++, zone: z, key, type, idx: i });
      });
    }
  }
  return slots;
}
// 비교 꼴 — 작업 피처 한 개의 기하(반올림) · 이름 · 종류
const P = (p) => [R(p.x), R(p.y), R(p.w)];
function sig(f) {
  if (f.path) return JSON.stringify([f.type, f.name || '', f.path.map(P)]);
  const c = [R(f.center.x), R(f.center.y)];
  if (f.type === 'forest') return JSON.stringify([f.type, f.name || '', c, R(f.rx), R(f.ry), +(+f.density).toFixed(2)]);
  if (f.type === 'lake') return JSON.stringify([f.type, f.name || '', c, R(f.radius != null ? f.radius : ((f.rx || 0) + (f.ry || 0)) / 2)]);
  if (f.type === 'village') return JSON.stringify([f.type, f.name || '', c]);
  return JSON.stringify([f.type, f.name || '', c, R(f.radius)]);
}

const gameText = fs.readFileSync(GAME, 'utf8');
const world = JSON.parse(gameText);
const W = JSON.parse(fs.readFileSync(WORK, 'utf8'));
if (!W.editorWork || !Array.isArray(W.mf)) { console.error('작업 파일이 아니다(editorWork · mf 가 없다): ' + WORK); process.exit(2); }
const base = exportOf(gameText);   // 임시 레포 자리에서 뽑는다 — 레포 바깥 `../hanbando_terrain_v3.json`(맥 ~/Mini 에 있을 수 있다)을 export 가 먼저 읽는 길을 막는다
const firstId = base.mf.length ? base.mf[0].id : 1;
const slots = walk(world, firstId);
if (slots.length !== base.mf.length) { console.error(`[work-to-canon] 걷기(${slots.length}) ≠ export 피처(${base.mf.length}) — export 차례가 바뀌었다 · 멈춘다`); process.exit(2); }
const byId = new Map(); slots.forEach((s, i) => { if (base.mf[i].id !== s.id || base.mf[i].type !== s.type) { console.error(`[work-to-canon] ${i}번 id/종류 어긋남 — 멈춘다`); process.exit(2); } byId.set(s.id, { slot: s, base: base.mf[i] }); });

// ── 작업 파일을 정본에 ──
const rep = { same: 0, changed: [], renamed: [], removed: [], added: [], moved: [], crossing: [], ids: { dup: 0 } };
const seen = new Set();
const edits = new Map();   // "zone|key" → { set: Map(idx → 새 항목), del: Set(idx), add: [] }
const E = (z, k) => { const kk = z + '|' + k; if (!edits.has(kk)) edits.set(kk, { set: new Map(), del: new Set(), add: [] }); return edits.get(kk); };
const keyOf = Object.fromEntries(KINDS.map(([t, k]) => [t, k]));
function linePath(f, z, orig) {
  const [ox, oy] = offOf(z);
  const pool = new Map(); for (const q of (orig || [])) { const p = q.pos || [q.x, q.y]; pool.set(R(p[0] + ox) + ',' + R(p[1] + oy) + ',' + R(q.width != null ? q.width : 0), q); }
  return f.path.map((p) => pool.get(R(p.x) + ',' + R(p.y) + ',' + R(p.w)) || { pos: [R(p.x - ox), R(p.y - oy)], width: R(p.w) });
}
function newItem(f, z) {
  const [ox, oy] = offOf(z), cx = f.center ? R(f.center.x - ox) : 0, cy = f.center ? R(f.center.y - oy) : 0;
  if (f.type === 'river' || f.type === 'valley') return { name: f.name || '', path: linePath(f, z, null) };
  if (f.type === 'ridge') { const o = { name: f.name || '', path: linePath(f, z, null) }; const g = f.flags || {}; if (g.noFit) o.noFit = true; if (g.noValley) o.noValley = true; if (g.pinStart) o.pinStart = true; return o; }
  if (f.type === 'forest') return { name: f.name || '', center: [cx, cy], rx: R(f.rx), ry: R(f.ry), densityMult: +(+(f.density != null ? f.density : 1.5)).toFixed(2) };
  if (f.type === 'lake') { const rx = R(f.rx != null ? f.rx : f.radius), ry = R(f.ry != null ? f.ry : f.radius);
    return rx === ry ? { name: f.name || '', center: [cx, cy], shape: 'circle', radius: rx } : { name: f.name || '', center: [cx, cy], shape: 'ellipse', rx, ry, a: rx, b: ry, rotation: 0, radius: R((rx + ry) / 2) }; }
  if (f.type === 'pass') return { name: f.name || '', pos: [cx, cy], radius: R(f.radius) };
  if (f.type === 'ore') return { name: f.name || '', center: [cx, cy], radius: R(f.radius) };
  if (f.type === 'village') return { name: f.name || '', x: cx, y: cy };
  return null;
}
function homeZone(f) {
  const cnt = {};
  const pts = f.path ? f.path : [f.center];
  for (const p of pts) { const z = zoneAt(p.x, p.y); if (z) cnt[z] = (cnt[z] || 0) + 1; }
  const zs = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
  return { zone: zs[0] || null, zones: zs };
}
function updItem(orig, f, z) {   // 바뀐 칸만
  const o = JSON.parse(JSON.stringify(orig)), [ox, oy] = offOf(z);
  if ((f.name || '') !== (orig.name || '')) o.name = f.name || '';
  if (f.path) o.path = linePath(f, z, orig.path);
  else if (f.type === 'village') { if (R(orig.x + ox) !== R(f.center.x)) o.x = R(f.center.x - ox); if (R(orig.y + oy) !== R(f.center.y)) o.y = R(f.center.y - oy); }
  else {
    const ck = orig.center ? 'center' : 'pos', c0 = orig[ck];
    if (R(c0[0] + ox) !== R(f.center.x) || R(c0[1] + oy) !== R(f.center.y)) o[ck] = [R(f.center.x - ox), R(f.center.y - oy)];
    if (f.type === 'forest') { if (R(orig.rx) !== R(f.rx)) o.rx = R(f.rx); if (R(orig.ry) !== R(f.ry)) o.ry = R(f.ry); if (+(orig.densityMult || 1.5).toFixed(2) !== +(+f.density).toFixed(2)) o.densityMult = +(+f.density).toFixed(2); }
    else if (f.type === 'lake') { const rw = f.radius != null ? R(f.radius) : R(((f.rx || 0) + (f.ry || 0)) / 2);
      if (f.rx != null && f.ry != null && R(f.rx) !== R(f.ry)) Object.assign(o, { shape: 'ellipse', rx: R(f.rx), ry: R(f.ry), a: R(f.rx), b: R(f.ry), rotation: o.rotation || 0, radius: rw });
      else if (R(orig.radius) !== rw) o.radius = rw; }
    else if (R(orig.radius) !== R(f.radius)) o.radius = R(f.radius);
  }
  return o;
}
for (const f of W.mf) {
  if (seen.has(f.id)) { rep.ids.dup++; continue; } seen.add(f.id);
  const hit = byId.get(f.id);
  if (hit && hit.base.type === f.type) {
    if (sig(f) === sig(hit.base)) { rep.same++; continue; }
    const s = hit.slot, orig = world[s.zone][s.key][s.idx];
    if (!f.path) { const hz = homeZone(f).zone; if (hz && hz !== s.zone) {   // 덩이가 다른 존으로 넘어갔다 → 옮긴다
      E(s.zone, s.key).del.add(s.idx); E(hz, s.key).add.push(updItem(Object.assign({}, orig, f.type === 'village' ? { x: orig.x + offOf(s.zone)[0] - offOf(hz)[0], y: orig.y + offOf(s.zone)[1] - offOf(hz)[1] } : {}), f, hz));
      rep.moved.push(`${f.type} ${f.name} ${s.zone}→${hz}`); continue; } }
    E(s.zone, s.key).set.set(s.idx, updItem(orig, f, s.zone));
    (((f.name || '') !== (hit.base.name || '')) ? rep.renamed : rep.changed).push(`${s.zone} ${f.type} ${f.name}`);
  } else {
    const h = homeZone(f);
    if (!h.zone) { rep.added.push(`(존 밖) ${f.type} ${f.name}`); continue; }
    const it = newItem(f, h.zone); if (!it) continue;
    E(h.zone, keyOf[f.type]).add.push(it);
    rep.added.push(`${h.zone} ${f.type} ${f.name}`);
    if (h.zones.length > 1) rep.crossing.push(`${f.type} ${f.name} ${h.zones.join('/')}`);
  }
}
for (const [id, { slot, base: b }] of byId) if (!seen.has(id)) { E(slot.zone, slot.key).del.add(slot.idx); rep.removed.push(`${slot.zone} ${b.type} ${b.name}`); }

// 새 정본 — 손 안 댄 존·칸은 같은 객체(JSON.stringify 바이트 동일)
const out = JSON.parse(gameText);
const before = {}, after = {};
const cnt = (d) => Object.fromEntries(KINDS.map(([, k]) => [k, (d && d[k] || []).length]));
for (const z of Object.keys(out)) before[z] = cnt(out[z]);
for (const [kk, e] of edits) {
  const [z, k] = kk.split('|');
  if (!out[z]) out[z] = {};
  const arr = out[z][k] || [];
  const nxt = [];
  arr.forEach((it, i) => { if (e.del.has(i)) return; nxt.push(e.set.has(i) ? e.set.get(i) : it); });
  out[z][k] = nxt.concat(e.add);
}
for (const z of Object.keys(out)) after[z] = cnt(out[z]);
const outText = JSON.stringify(out);

// ── 왕복: 새 정본 → export → mf 모둠 = 작업 mf 모둠 ──
const back = exportOf(outText);
const bag = (a) => { const m = new Map(); for (const f of a) { const s = sig(f); m.set(s, (m.get(s) || 0) + 1); } return m; };
const A = bag(W.mf.filter((f, i, all) => all.findIndex((g) => g.id === f.id) === i)), B = bag(back.mf);
let miss = 0, extra = 0; const missL = [], extraL = [];
for (const [s, n] of A) { const d = n - (B.get(s) || 0); if (d > 0) { miss += d; if (missL.length < 8) missL.push(s.slice(0, 120)); } }
for (const [s, n] of B) { const d = n - (A.get(s) || 0); if (d > 0) { extra += d; if (extraL.length < 8) extraL.push(s.slice(0, 120)); } }
const roundTrip = miss === 0 && extra === 0;
const zonesChanged = Object.keys(out).filter((z) => JSON.stringify(out[z]) !== JSON.stringify(world[z]));

console.log(`작업 파일 → 정본 — ${path.relative(ROOT, path.resolve(WORK))} · mf ${W.mf.length} · 지금 정본 export ${base.mf.length}(${base.stamp})`);
console.log(`  같음 ${rep.same} · 기하 바뀜 ${rep.changed.length} · 이름 바뀜 ${rep.renamed.length} · 존 옮김 ${rep.moved.length} · 뺌 ${rep.removed.length} · 새로 ${rep.added.length}${rep.ids.dup ? ' · ⚠겹친 id ' + rep.ids.dup : ''}`);
console.log(`  바뀐 존 절: ${zonesChanged.join(' · ') || '0'} · 손 안 댄 존 절은 바이트 그대로`);
console.log('| 존 | ' + KINDS.map(([, k]) => k).join(' | ') + ' |'); console.log('|---|' + KINDS.map(() => '---').join('|') + '|');
for (const z of zonesChanged) console.log(`| ${z} | ` + KINDS.map(([, k]) => before[z] && before[z][k] !== after[z][k] ? `${before[z][k]} → **${after[z][k]}**` : String((after[z] || {})[k] || 0)).join(' | ') + ' |');
const show = (t, a) => { if (a.length) console.log(`  ${t}(${a.length}): ${a.slice(0, 30).join(' · ')}${a.length > 30 ? ' …' : ''}`); };
show('기하 바뀜', rep.changed); show('이름 바뀜', rep.renamed); show('존 옮김', rep.moved); show('뺌', rep.removed); show('새로', rep.added); show('존 경계에 걸친 새 선(한 존에 둠)', rep.crossing);
console.log(`  왕복(새 정본 → export → mf = 작업 mf): ${roundTrip ? '같음 ✓' : `다름 ✗ — 작업에만 ${miss} · 왕복에만 ${extra}`} · 다시 뽑은 스탬프 ${back.stamp}`);
if (!roundTrip) { for (const s of missL) console.log('    작업에만 ' + s); for (const s of extraL) console.log('    왕복에만 ' + s); }
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ rep, before, after, zonesChanged, roundTrip, miss, extra, stamp: back.stamp }, null, 1));
if (OUT) fs.writeFileSync(OUT, outText);
if (APPLY) { if (!roundTrip) { console.log('  ✗ 왕복이 다르다 — 정본에 안 쓴다'); process.exit(3); } fs.writeFileSync(GAME, outText); console.log('  → 정본에 썼다: server/hanbando-terrain.json'); }
else if (!OUT) console.log('  (표만 — 정본 무변 · 쓰려면 --apply)');
process.exit(roundTrip ? 0 : 3);

// T1474 — 전투실험실(07-10 원본) ↔ battle-core 첫 갈린 틱. 판 두 개를 따로 끝까지 돌려 틱마다 몸 스냅샷(x,y,hp,mrl,routing)을 쌓고 견준다.
//   (두 엔진이 전역 Math.random 을 같은 차례로 쓰므로 한 틱씩 번갈아 돌리지 않는다 — verify 와 같이 판마다 시드를 deploy/buildArmies 직전에 건다.)
// 실행: node scripts/t1474-first-diff.js [--core <battle-core.js>] [--out 계측/T1474/갈린자리]   → .json · .md
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const CORE = path.resolve(arg('--core', path.join(ROOT, 'sim/battle-core.js')));
const OUT = path.resolve(arg('--out', path.join(ROOT, '계측/T1474/갈린자리')));
const LAB = path.join(ROOT, 'lab', '원본', '전투실험실_0710.html');
const __mr = s => { let a = (s * 2654435761) >>> 0 || 1; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function mkctx() { return new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } }); }
function elFor(vals, id) { const d = (id && id.endsWith('_form')) ? 'line' : (id === 'terrain' ? 'plain' : '0'); return { value: vals[id] != null ? String(vals[id]) : d, textContent: '', innerHTML: '', style: {}, getContext: () => mkctx(), width: 760, height: 760, addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 760, height: 760 }) }; }
const H = fs.readFileSync(LAB, 'utf8'); const LAB_SCRIPT = H.match(/<script>([\s\S]*?)<\/script>/)[1];
const snap = us => us.map(u => [u.id, u.side, u.type, u.x, u.y, u.hp, u.mrl, u.routing ? 1 : 0]);
const FN = ['id', 'side', 'type', 'x', 'y', 'hp', 'mrl', 'routing'];
function runLab(vals, seed, maxT, dt) {
  const els = {}; global.document = { getElementById: id => els[id] || (els[id] = elFor(vals, id)) };
  global.requestAnimationFrame = () => 0; global.cancelAnimationFrame = () => {}; global.window = { addEventListener: () => {} }; global.performance = { now: () => 0 };
  delete globalThis.__B;
  (0, eval)(LAB_SCRIPT + '\n;globalThis.__B={deploy,stepBattle,trackVel,setRun:v=>{running=v},setRegen:()=>{_regenTerrain=true},S:()=>sides,R:()=>result,T:()=>tick,U:()=>units};');
  const B = globalThis.__B; Math.random = __mr(seed); B.setRegen(); B.deploy(); B.setRun(true);
  const snaps = [snap(B.U())]; let n = 0;
  while (!B.R() && n < maxT) { B.trackVel(dt); B.stepBattle(dt); n++; snaps.push(snap(B.U())); }
  const s = B.S(), r = B.R(); return { snaps, win: r ? r.win : '미결', tick: +B.T().toFixed(3), dA: s.A.dead, dB: s.B.dead };
}
function runCore(BC, spec, seed, maxT, dt) {
  Math.random = __mr(seed); BC.buildArmies(spec); const snaps = [snap(BC.units)]; let n = 0;
  while (!BC.result && n < maxT) { BC.trackVel(dt); BC.stepBattle(dt); n++; snaps.push(snap(BC.units)); }
  const s = BC.sides, r = BC.result; return { snaps, win: r ? r.win : '미결', tick: +BC.tick.toFixed(3), dA: s.A.dead, dB: s.B.dead };
}
function valsToSpec(v) { const g = (sd, k) => +(v[sd + '_' + k] || 0); const S = sd => ({ champion: g(sd, 'champ'), greataxe: g(sd, 'axe'), spear: g(sd, 'spear'), pike: g(sd, 'pike'), dagger: g(sd, 'dagger'), archer: g(sd, 'archer'), form: v[sd + '_form'] || 'line' }); return { A: S('a'), B: S('b'), terrain: v.terrain || 'plain' }; }
const scen = [
  ['청동편성', { a_champ: 1, a_spear: 6, b_axe: 6, b_dagger: 4 }], ['석기편성', { a_dagger: 8, b_axe: 6, b_dagger: 2 }],
  ['궁수혼합', { a_spear: 6, a_archer: 5, b_axe: 4, b_dagger: 4, b_archer: 3 }], ['시가전', { a_spear: 6, a_dagger: 4, b_axe: 4, b_dagger: 4, b_archer: 3, terrain: 'village' }],
  ['대칭', { a_spear: 8, b_spear: 8 }], ['방패벽', { a_spear: 10, a_form: 'wall', b_axe: 10 }], ['숲', { a_archer: 10, b_axe: 8, terrain: 'forest' }],
  ['장창', { a_pike: 10, b_spear: 10 }], ['원형', { a_spear: 8, a_archer: 4, a_form: 'circle', b_axe: 8 }], ['종대', { a_dagger: 10, a_form: 'column', b_spear: 8 }]];
const SEEDS = [1, 42, 100, 777], DT = 0.05, MAXT = 4000;
const res = [];
for (const [name, base] of scen) {
  const vals = { a_champ: 0, a_axe: 0, a_spear: 0, a_pike: 0, a_dagger: 0, a_archer: 0, b_champ: 0, b_axe: 0, b_spear: 0, b_pike: 0, b_dagger: 0, b_archer: 0, ...base };
  for (const seed of SEEDS) {
    const L = runLab(vals, seed, MAXT, DT);
    delete require.cache[require.resolve(CORE)]; global.window = undefined; const BC = require(CORE);
    const C = runCore(BC, valsToSpec(vals), seed, MAXT, DT);
    const ok = L.win === C.win && L.dA === C.dA && L.dB === C.dB && Math.abs(L.tick - C.tick) < 1e-6;
    let first = null; const n = Math.min(L.snaps.length, C.snaps.length);
    for (let k = 0; k < n && !first; k++) {
      const a = L.snaps[k], b = C.snaps[k];
      if (a.length !== b.length) { first = { tick: k, what: `몸 수 ${a.length} ↔ ${b.length}` }; break; }
      for (let i = 0; i < a.length; i++) for (let f = 3; f < 8; f++) if (a[i][f] !== b[i][f]) { first = { tick: k, id: a[i][0], side: a[i][1], type: a[i][2], field: FN[f], lab: a[i][f], core: b[i][f], x: [a[i][3], b[i][3]], y: [a[i][4], b[i][4]], hp: [a[i][5], b[i][5]], mrl: [a[i][6], b[i][6]], nDiff: a.filter((r, j) => r.some((v, q) => q >= 3 && v !== b[j][q])).length }; i = a.length; break; }
    }
    if (!first && L.snaps.length !== C.snaps.length) first = { tick: n, what: `틱 수 ${L.snaps.length - 1} ↔ ${C.snaps.length - 1}` };
    res.push({ name, seed, ok, lab: { win: L.win, dA: L.dA, dB: L.dB, tick: L.tick }, core: { win: C.win, dA: C.dA, dB: C.dB, tick: C.tick }, first });
    console.error(name, seed, ok ? '✓' : '✗', first ? 'tick ' + first.tick : '');
  }
}
fs.writeFileSync(OUT + '.json', JSON.stringify(res, null, 1));
const f = v => typeof v === 'number' ? +v.toFixed(4) : v;
let md = `# T1474 첫 갈린 틱 (코어 ${path.relative(ROOT, CORE)} · 원본 07-10 · dt 0.05 · 틱 k = k 걸음 뒤 = ${DT}k 초)\n\n| 갈래 | 시드 | 맞음 | 첫 갈린 틱(초) | 몸 | 칸 | 실험실 | core | 실험실 승·죽음 A/B·초 | core 승·죽음 A/B·초 |\n|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of res) { const q = r.first; md += `| ${r.name} | ${r.seed} | ${r.ok ? '✓' : '✗'} | ${q ? q.tick + ' (' + (q.tick * DT).toFixed(2) + ')' : '-'} | ${q && q.id != null ? '#' + q.id + ' ' + q.side + ' ' + q.type : (q ? q.what : '-')} | ${q && q.field || '-'} | ${q && q.field ? f(q.lab) : '-'} | ${q && q.field ? f(q.core) : '-'} | ${r.lab.win}·${r.lab.dA}/${r.lab.dB}·${r.lab.tick} | ${r.core.win}·${r.core.dA}/${r.core.dB}·${r.core.tick} |\n`; }
const bad = res.filter(r => !r.ok), flips = bad.filter(r => r.lab.win !== r.core.win);
md += `\n* 불일치 ${bad.length}/${res.length} · 승패 뒤집힘 ${flips.length}/${bad.length}\n`;
fs.writeFileSync(OUT + '.md', md);

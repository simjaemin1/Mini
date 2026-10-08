#!/usr/bin/env node
// === scripts/t677-witness.js — T677 ② 어부 드리움 자리 판정 칸마다 한 번 — 바이트 같음 증인 (러너 밖 · 서버 0) ======================
//   ⓐ `fishing.spotAt` 은 같은 입력에 같은 답 · 지형을 안 바꾼다(한반도 강 55 · 호수 14 둘레 칸 전수 + 고른 표본 — 두 번 불러 깊은 같음 · 지형 지문 전후 같음)
//   ⓑ 기억한 답 ↔ 새로 잰 답 — 깊은 같음(`Object.is` 필드마다) · 같은 칸 두 번째는 **같은 객체**(실제로 기억을 탔다)
//   ⓒ 돌려받은 자리 객체를 읽는 쪽(`plan` · `spotScore`)이 그 객체를 **안 고친다**(부른 뒤 지문 같음)
//   ⓓ `_t340Try` 종전 ↔ 지금(켬) — 같은 바깥 대역 · 실제 fishing·terrain 모듈 · 어부 몸 64 × 던짐 수천 번: 돌려준 값 · 몸 · 마을 장부 `Object.is`
//   ⓔ 판본 — 지형 객체가 바뀌면(다시 지음) 기억을 비운다 · 존이 바뀌어도
//   ⓕ 미끼 — 판본 확인을 빼고 지형을 갈아끼우면 문다
// 실행: node scripts/t677-witness.js [ref=origin/main]
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const REF = process.argv[2] || 'origin/main';
const OLD = execFileSync('git', ['show', `${REF}:server/villages.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const NEW = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const F = require(path.join(ROOT, 'server', 'fishing'));
const T = require(path.join(ROOT, 'server', 'terrain'));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? '  ' + x : '')); };
const same = (a, b) => { if (a === b) return true; if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return Object.is(a, b) ? true : `${a} ≠ ${b}`;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); if (ka.join() !== kb.join()) return 'keys';
  for (const k of ka) { const r = same(a[k], b[k]); if (r !== true) return k + '.' + r; } return true; };
const fp = (o) => require('crypto').createHash('sha1').update(JSON.stringify(o, (k, v) => (k && k[0] === '_' ? undefined : v))).digest('hex').slice(0, 12);   // `_` 칸은 지형의 게으른 캐시(`_bbox`·`_smoothed`)라 뺀다
const fnSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) throw new Error('없음 ' + name); const j = S.indexOf('\n}\n', i); return S.slice(i, j + 2); };
let x = 0x9e3779b9; const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
const Z = 'hanbando', SZ = 32;
const terr = T.ZONE_TERRAIN[Z];
const fp0 = fp({ r: terr.rivers, l: terr.lakes });

// 강·호수 둘레 칸 + 고른 칸
const cells = [];
for (const r of terr.rivers || []) for (const p of r.path || []) { const q = p.pos || p, px = Array.isArray(q) ? q[0] : q.x, py = Array.isArray(q) ? q[1] : q.y;
  for (let d = 0; d < 6; d++) cells.push([Math.floor((px + (rnd() - 0.5) * 400) / SZ), Math.floor((py + (rnd() - 0.5) * 400) / SZ)]); }
for (const l of terr.lakes || []) for (let d = 0; d < 40; d++) cells.push([Math.floor((l.center[0] + (rnd() - 0.5) * 3 * (l.radius || l.a || 300)) / SZ), Math.floor((l.center[1] + (rnd() - 0.5) * 3 * (l.radius || l.b || 300)) / SZ)]);
for (let d = 0; d < 20000; d++) cells.push([Math.floor(rnd() * 3000), Math.floor(rnd() * 3000)]);

console.log('\n=== T677 ② 어부 드리움 자리 판정 — 바이트 같음 증인 · 종전', REF, '===');
// ⓐ
{
  let bad = 0, water = 0;
  for (const [cx, cy] of cells) { const a = F.spotAt(T, Z, cx * SZ + SZ / 2, cy * SZ + SZ / 2), b = F.spotAt(T, Z, cx * SZ + SZ / 2, cy * SZ + SZ / 2); if (same(a, b) !== true) bad++; if (a.water) water++; }
  ok(cells.length > 20000 && water > 200, 'ⓐ [상황] 칸 수 · 물 칸', `${cells.length} · ${water}`);
  ok(bad === 0 && fp({ r: terr.rivers, l: terr.lakes }) === fp0, 'ⓐ ★`spotAt` 같은 입력 같은 답 · 지형 지문 전후 같음', `다름 ${bad}`);
}
// 지금 글자의 기억 함수를 세운다(실제 모듈 위)
const helperSrc = (S) => { const i = S.indexOf('const T677_LIFE_SCAN'); const j = S.indexOf('function _t340Try(', i); return S.slice(i, j); };
const mkSpot = (S, state) => new Function('state', 'SZ', '_terrainMod', 'process', helperSrc(S) + '\nreturn { spot: _t677Spot, M: _t677SpotM };')(state, SZ, () => T, { env: { T677_LIFE_SCAN: '1' } });
// ⓑ
{
  const st = { zoneId: Z }; const H = mkSpot(NEW, st);
  let bad = 0, hit = 0, inR = 0;
  for (const [cx, cy] of cells) { const a = H.spot(F, cx, cy), b = F.spotAt(T, Z, cx * SZ + SZ / 2, cy * SZ + SZ / 2); if (same(a, b) !== true) bad++; if (cx >= 0 && cy >= 0) { inR++; if (H.spot(F, cx, cy) === a) hit++; } }
  ok(bad === 0, 'ⓑ ★기억한 답 ↔ 새로 잰 답 깊은 같음(필드마다 Object.is)', `다름 ${bad} / ${cells.length}`);
  ok(hit === inR && H.M.size > 1000, 'ⓑ [상황] 같은 칸 두 번째는 같은 객체(기억을 탔다 · 존 밖 음수 칸은 종전대로 새로 잰다)', `${hit} / ${inR} · 기억 ${H.M.size}칸`);
}
// ⓒ
{
  const st = { zoneId: Z }; const H = mkSpot(NEW, st);
  let bad = 0;
  for (let i = 0; i < 3000; i++) { const [cx, cy] = cells[(rnd() * cells.length) | 0]; const sp = H.spot(F, cx, cy); const before = fp(sp);
    F.spotScore(sp); F.plan(sp, rnd(), 1e6, rnd, rnd() < 0.5 ? 0 : 1.2); if (fp(sp) !== before) bad++; }
  ok(bad === 0, 'ⓒ ★읽는 쪽(`plan` · `spotScore`)이 자리 객체를 안 고친다', `바뀜 ${bad}`);
}
// ⓓ `_t340Try` 종전 ↔ 지금(켬)
{
  const env = (S, on) => {
    const st = { zoneId: Z };
    const stubs = { state: st, SZ, _terrainMod: () => T, _fishingMod: () => F, _regionMod: () => null, _t593SeaBank: () => null, _seaTbl: () => null,
      _fresh: () => ({ pick: (w, day, seed) => ((seed >>> 0) % 7 === 0 ? null : { id: ['trout', 'carp', 'pollock'][(seed >>> 0) % 3], kg: 0.3 + ((seed >>> 3) % 50) / 50 }) }),
      _t312Water: () => ({ river: 1 }), _t340Rng: (s) => { let y = s >>> 0 || 1; return () => { y ^= y << 13; y >>>= 0; y ^= y >>> 17; y ^= y << 5; y >>>= 0; return y / 4294967296; }; },
      _lifeAct: (n, a) => { n._lifeAct = a; }, process: { env: { T677_LIFE_SCAN: on ? '1' : '0' } } };
    const K = Object.keys(stubs);
    const body = (on ? helperSrc(S) : '') + fnSrc(S, '_t340Try');
    return new Function(...K, body + '\nreturn _t340Try;')(...K.map((k) => stubs[k]));
  };
  const Fo = env(OLD, false), Fn = env(NEW, true);
  let n = 0, d = null, casts = 0;
  const bodies = [], vo = {}, vn = {};
  for (let i = 0; i < 64; i++) { const [cx, cy] = cells[(i * 97) % 800]; bodies.push([{ pid: 'p' + i, _fishSpotX: cx * SZ + 10, _fishSpotY: cy * SZ + 20 }, { pid: 'p' + i, _fishSpotX: cx * SZ + 10, _fishSpotY: cy * SZ + 20 }]); }
  let now = 1e6, day = 3;
  for (let t = 0; t < 3000 && !d; t++) {
    now += 700 + ((rnd() * 900) | 0); if (t % 700 === 699) day++;
    for (let i = 0; i < 64 && !d; i++) {
      const [a, b] = bodies[i];
      if (rnd() < 0.05) { const [cx, cy] = cells[(rnd() * cells.length) | 0]; a._fishSpotX = b._fishSpotX = cx * SZ + 7; a._fishSpotY = b._fishSpotY = cy * SZ + 9; }   // 자리 옮김
      const h = i * 2654435761 >>> 0, ws = { x: a._fishSpotX, y: a._fishSpotY };
      const ra = Fo({}, a, now, day, h, ws), rb = Fn({}, b, now, day, h, ws); n++;
      Object.assign(vo, {});
      const s1 = same(ra, rb), s2 = same(a, b);
      if (s1 !== true || s2 !== true) d = [t, i, JSON.stringify(ra), JSON.stringify(rb), s1, s2];
      if (a._t340 && a._t340.castAt === now) casts++;
    }
  }
  ok(casts > 1000, 'ⓓ [상황] 던짐 수(자리 판정을 실제로 불렀다)', `${casts} / 부름 ${n}`);
  ok(!d, 'ⓓ ★★`_t340Try` 종전 ↔ 켬 — 돌려준 값 · 어부 몸(`_t340` 안까지) **한 번도 안 다르다**', d ? JSON.stringify(d) : null);
}
// ⓔ 판본
{
  const st = { zoneId: Z }; let TT = T;
  const H = new Function('state', 'SZ', '_terrainMod', 'process', helperSrc(NEW) + '\nreturn { spot: _t677Spot, M: _t677SpotM };')(st, SZ, () => TT, { env: { T677_LIFE_SCAN: '1' } });
  const [cx, cy] = cells[0];
  const a = H.spot(F, cx, cy);
  const fake = { ZONE_TERRAIN: { [Z]: { rivers: [], lakes: [] } }, isWaterCellLocal: () => false };   // 다시 지은 지형(다른 객체)
  TT = fake; const b = H.spot(F, cx, cy);
  ok(a !== b && b.water === false, 'ⓔ 지형 객체가 바뀌면 기억을 비운다(새 지형으로 다시 잰다)');
  TT = T; st.zoneId = 'nippon'; H.spot(F, 1, 1); ok(H.M.size === 1, 'ⓔ 존이 바뀌어도 기억을 비운다', H.M.size);
}
// ⓕ 미끼
{
  const bait = NEW.replace("if (t !== _t677SpotT || z !== _t677SpotZ) { _t677SpotM.clear(); _t677SpotT = t; _t677SpotZ = z; }", '');
  const st = { zoneId: Z }; let TT = T;
  const H = new Function('state', 'SZ', '_terrainMod', 'process', helperSrc(bait) + '\nreturn { spot: _t677Spot };')(st, SZ, () => TT, { env: { T677_LIFE_SCAN: '1' } });
  let bit = 0;
  for (const [cx, cy] of cells.slice(0, 2000)) H.spot(F, cx, cy);
  TT = { ZONE_TERRAIN: { [Z]: { rivers: [], lakes: [] } }, isWaterCellLocal: () => false };
  for (const [cx, cy] of cells.slice(0, 2000)) { const v = H.spot(F, cx, cy), w = F.spotAt(TT, Z, cx * SZ + SZ / 2, cy * SZ + SZ / 2); if (same(v, w) !== true) bit++; }
  ok(bait !== NEW && bit > 0, 'ⓕ ★미끼(판본 확인 뺌) — 지형을 갈아끼우면 증인이 **문다**', `다름 ${bit}`);
}
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);

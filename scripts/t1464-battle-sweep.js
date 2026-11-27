#!/usr/bin/env node
// T1464 — 전투 코어 전수 판 자(코드 손 0 · 판 자만). 병종 × 수 × 수의 비 × 사기 × 대형마다 누가 이기고 · 진 편이 얼마나 죽고 · 언제 달아나나.
//
//   node scripts/t1464-battle-sweep.js --core <battle-core.js 길> [--env K=V …] --out <폴더> [--groups g1,g2,…] [--dt 0.05] [--n <판 수 덮기>] [--only <칸 정규식>] [--cap 600]
//
//   · 코어는 길로 받는다 — 다른 가지의 코어(S6 `batch/morale-1123` 등)를 같은 칸 · 같은 씨로 돌려 표 둘을 `scripts/t1464-diff.js` 로 견준다.
//   · --env 는 코어를 읽기 전에 process.env 에 넣는다(코어의 손잡이는 읽을 때 · 부를 때 env 를 본다).
//   · 결정론: 판마다 씨 하나(1 … n) — `sim/_battle-core-verify.js` 의 `__mr` 꼴을 `createBattle(spec,{rng})` 로 판의 ctx 에 꽂는다(Math.random 무접촉).
//     같은 칸 · 같은 씨 두 번 = 바이트 같은 줄(--selfcheck 가 잰다).
//   · 판 끝: 코어의 `judge` 의 결판 줄(한 편의 안 달아난 산 몸 0) 그대로 — 단 **120초 판정 줄은 쓰지 않는다**(코어 밖에서 끝을 센다):
//     빈 들판 어댑터(ctx.world = 막힘 · 사선 · 은폐 모두 없음)를 달면 stepBattle 은 판 결과를 안 낸다(존 규약 · 걸음은 어댑터 없는 판과 같다 —
//     advance · flee · hold · push 를 안 주므로 독립 실행 길 그대로). 그래서 결판 줄은 아래 `decided()` 가 코어 judge 와 같은 식으로 센다.
//     120초에 아직 결판이 안 났으면 "120초 판정 몫"으로 따로 센다(전투실험실 · 헤드리스는 거기서 수로 이긴 편을 정한다).
//     상한(게임 초 600)을 넘으면 "안 끝남" — 까닭: 서로 안 닿음 · 서로 달아남 · 끝 조건 없음(맞붙는데 아무도 안 꺾임).
//   · 로그는 파일로(<out>/<무리>.csv · 칸 한 줄) — 화면에는 진행 한 줄만. 끝난 칸은 건너뛴다(이어 돌기 · 덮지 않음).
'use strict';
const fs = require('fs'), path = require('path');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const args = (k) => argv.reduce((a, x, i) => (x === k && argv[i + 1] != null ? a.concat(argv[i + 1]) : a), []);
for (const kv of args('--env')) { const j = kv.indexOf('='); if (j > 0) process.env[kv.slice(0, j)] = kv.slice(j + 1); }
const CORE = path.resolve(arg('--core', path.join(__dirname, '..', 'sim', 'battle-core.js')));
const BC = require(CORE);
const OUT = path.resolve(arg('--out', path.join(__dirname, '..', '계측', 'T1464', 'main')));
const DT = +(arg('--dt', '0.05')) || (1 / 30);
const CAP = +arg('--cap', '600');
const NOVR = arg('--n', null) != null ? +arg('--n') : null;
const ONLY = arg('--only', null) ? new RegExp(arg('--only')) : null;
const GROUPS = (arg('--groups', 'g1,g2,g3,g4,g5,g6,g7,g8,g9')).split(',');

// ── 씨(`sim/_battle-core-verify.js` 의 __mr 그대로) ──
const __mr = s => { let a = (s * 2654435761) >>> 0 || 1; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// 빈 들판 어댑터 — 막힘 · 사선 · 은폐 없음(어댑터 없는 판과 같은 걸음 · 판 결과만 안 낸다)
const EMPTY = { blocked: () => false, losBlocked: () => false, coverAt: () => false };

const T8 = ['militia', 'dagger', 'spear', 'pike', 'greataxe', 'champion', 'archer', 'slinger'];
const KO = { militia: '민병', dagger: '석검', spear: '창', pike: '장창', greataxe: '도끼', champion: '정예', archer: '궁', slinger: '투석' };
const M5 = ['militia', 'dagger', 'spear', 'pike', 'greataxe'];
const FORMS = ['line', 'wall', 'open', 'column', 'circle'];
const MRLS = [0.4, 0.55, 0.7, 0.85, 1.0];

// 편 글자 ↔ spec: "spear20+archer10@wall"
const sideStr = (o) => Object.keys(o).filter((k) => k !== 'form' && k !== 'units' && o[k]).map((k) => k + o[k]).join('+') + (o.form && o.form !== 'line' ? '@' + o.form : '') || '0';
const S = (o, form) => Object.assign({}, o, form ? { form } : {});

// ── 칸(격자) ──
function cells() {
  const L = [];
  const add = (g, A, B, n, extra) => L.push(Object.assign({ g, A, B, n, mA: 1, mB: 1, dt: DT, inj: false }, extra || {}));
  if (GROUPS.includes('g1')) for (const a of T8) for (const b of T8) for (const k of [1, 2, 3, 5, 10, 20, 40]) add('g1', { [a]: k }, { [b]: k }, 100);   // ㉠ 같은 수 맞대결
  if (GROUPS.includes('g2')) for (const a of M5) for (const b of M5) for (const k of [5, 20]) for (const r of [1, 1.5, 2, 3]) add('g2', { [a]: k }, { [b]: Math.round(k * r) }, 60);   // ㉡ 수의 비(A = 적은 쪽)
  if (GROUPS.includes('g3')) {   // ㉢ 원정 사기 5 × 5 × 꼴 여섯
    const shapes = [[{ militia: 1 }, { dagger: 1 }], [{ militia: 3 }, { dagger: 3 }], [{ militia: 20 }, { dagger: 20 }], [{ spear: 20 }, { spear: 20 }], [{ spear: 40 }, { spear: 20 }],
      [{ spear: 30, archer: 10, champion: 3 }, { spear: 20, dagger: 15, archer: 10 }]];
    for (const [A, B] of shapes) for (const mA of MRLS) for (const mB of MRLS) add('g3', A, B, 100, { mA, mB });
  }
  if (GROUPS.includes('g4')) {   // ㉣ 대형 5 × 5 × 꼴 셋
    const shapes = [[{ spear: 20 }, { spear: 20 }], [{ spear: 20 }, { dagger: 20 }], [{ spear: 20, archer: 10 }, { dagger: 30 }]];
    for (const [A, B] of shapes) for (const fa of FORMS) for (const fb of FORMS) add('g4', S(A, fa), S(B, fb), 60);
  }
  if (GROUPS.includes('g5')) for (const c of [0, 1, 3]) for (const B of [{ dagger: 20 }, { spear: 20 }]) add('g5', c ? { militia: 20, champion: c } : { militia: 20 }, B, 100);   // ㉤ 정예 곁
  if (GROUPS.includes('g6')) for (const r of ['archer', 'slinger']) for (const nr of [10, 20]) for (const b of T8) for (const nb of [10, 20]) add('g6', { [r]: nr }, { [b]: nb }, 60);   // ㉥ 원거리(서로끼리 포함)
  if (GROUPS.includes('g7')) {   // 코너: 한쪽 0명 · 80 ↔ 1 · 1 ↔ 80 · 큰 판(판당 ms 80)
    add('g7', { spear: 0 }, { spear: 20 }, 20); add('g7', { spear: 20 }, { spear: 0 }, 20);
    add('g7', { spear: 80 }, { spear: 1 }, 40); add('g7', { spear: 1 }, { spear: 80 }, 40);
    add('g7', { militia: 80 }, { champion: 1 }, 40); add('g7', { champion: 1 }, { militia: 80 }, 40);
    add('g7', { spear: 80 }, { spear: 80 }, 20); add('g7', { militia: 80 }, { dagger: 80 }, 20);
  }
  if (GROUPS.includes('g8')) for (const a of T8) for (const b of T8) for (const k of [1, 2, 3]) add('g8', { [a]: k }, { [b]: k }, 100, { inj: true });   // 자리로 주는 꼴(units:[{type,x,y}]) — g1 수 1 ~ 3 과 견줌
  if (GROUPS.includes('g9')) for (const a of T8) for (const b of T8) for (const k of [1, 3, 20]) add('g9', { [a]: k }, { [b]: k }, 100, { dt: 1 / 30 });   // 서버 존 틱(1/30) — g1 과 견줌
  for (const c of L) c.key = [c.g, sideStr(c.A), sideStr(c.B), 'm' + c.mA + '/' + c.mB, 'dt' + (+c.dt.toFixed(4)), c.inj ? 'inj' : 'cnt'].join('|');
  return L.filter((c) => !ONLY || ONLY.test(c.key));
}

// 자리로 주는 꼴: 수로 준 꼴을 한 번 지어 자리를 읽고(씨 같음) units:[{type,x,y}] 로 다시 준다
function injSpec(spec, seed) {
  const h = BC.createBattle(spec, { rng: __mr(seed) });
  const side = (s) => { const o = { form: (spec[s] || {}).form || 'line', units: h.ctx.units.filter((u) => u.side === s).map((u) => ({ type: u.type, x: u.x, y: u.y })) }; return o.units.length ? o : Object.assign({}, spec[s]); };
  return { A: side('A'), B: side('B') };
}

// ── 판 하나 ──
function decided(ctx) {   // 코어 judge 의 결판 줄 그대로(120초 줄 뺌)
  let la = 0, lb = 0, fa = 0, fb = 0;
  for (const u of ctx.units) { if (u.hp <= 0) continue; if (u.side === 'A') { la++; if (!u.routing) fa++; } else { lb++; if (!u.routing) fb++; } }
  if (fa === 0 && fb > 0) return 'B';
  if (fb === 0 && fa > 0) return 'A';
  if (fa === 0 && fb === 0) return la > lb ? 'A' : lb > la ? 'B' : '무';
  return null;
}
function runBattle(c, seed) {
  const spec = { A: c.A, B: c.B };
  const sp = c.inj ? injSpec(spec, seed) : spec;
  const h = BC.createBattle(sp, { rng: __mr(seed) });
  const ctx = h.ctx; ctx.world = EMPTY;
  ctx.sides.A.armyMrl = c.mA; ctx.sides.B.armyMrl = c.mB;
  const N = ctx.units.length, start = { A: ctx.sides.A.start, B: ctx.sides.B.start };
  const pr = new Array(N).fill(false), pst = new Array(N).fill('adv'), php = ctx.units.map((u) => u.hp), deadAt = new Array(N).fill(-1), everR = new Array(N).fill(false);
  const R = { win: null, t: 0, contact: -1, firstHit: -1, firstDeath: -1, firstRout: -1, preRout: { A: 0, B: 0 }, routFight: 0, routIdle: 0, rally: 0, chasedDead: 0, everRouted: 0, at120: null, nan: 0, mrlOut: 0, sum: 0, reason: '' };
  let w = decided(ctx), decAt = -1;
  const fin = () => {   // 결판 뒤 추격 꼬리: 진 편의 산 몸이 모두 죽었거나 · 달아나 안 달아난 적이 25 m 안에 없을 때(코어가 목표를 붙드는 거리) 끝
    if (!w) return false; if (w === '무') return true;
    const lo = w === 'A' ? 'B' : 'A';
    for (const u of ctx.units) { if (u.side !== lo || u.hp <= 0) continue; if (!u.routing) return false;
      for (const e of ctx.units) { if (e.side === lo || e.hp <= 0 || e.routing) continue; const dx = e.x - u.x, dy = e.y - u.y; if (dx * dx + dy * dy < 625) return false; } }
    return true;
  };
  const markDec = () => { if (w && decAt < 0) { decAt = ctx.tick; R.decWin = w; R.deadDec = { A: ctx.units.filter((u) => u.side === 'A' && u.hp <= 0).length, B: ctx.units.filter((u) => u.side === 'B' && u.hp <= 0).length }; } };
  markDec();
  let steps = 0; const maxSteps = Math.ceil(CAP / c.dt - 1e-9);
  while (!fin() && steps < maxSteps) {
    BC._trackVel(ctx, c.dt); BC._stepBattle(ctx, c.dt); steps++;
    const t = ctx.tick;
    for (let i = 0; i < N; i++) {
      const u = ctx.units[i];
      if (!(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp) && Number.isFinite(u.mrl))) R.nan++;
      if (u.mrl < 0 || u.mrl > 1) R.mrlOut++;
      if (u.hp < php[i]) { if (R.firstHit < 0) R.firstHit = t; php[i] = u.hp; }
      if (u.hp <= 0) { if (deadAt[i] < 0) { deadAt[i] = t; if (R.firstDeath < 0) R.firstDeath = t; if (pr[i] || u.routing) { R.chasedDead++; everR[i] = true; } } continue; }
      if (u.st === 'melee' && R.contact < 0) R.contact = t;
      if (u.routing && !pr[i]) { if (R.firstRout < 0) R.firstRout = t; if (R.contact < 0) R.preRout[u.side] = 1; if (pst[i] === 'melee') R.routFight++; else R.routIdle++; everR[i] = true; }
      else if (!u.routing && pr[i]) R.rally++;
      pr[i] = u.routing; pst[i] = u.st;
    }
    w = decided(ctx); markDec();
    if (R.at120 === null && t >= 120 - 1e-9) R.at120 = decAt >= 0 ? 'done' : 'open';
  }
  if (!fin()) { R.reason = decAt >= 0 ? '추격안끝남' : ''; if (decAt >= 0) w = null; }
  R.t = ctx.tick; R.dec = decAt; R.win = w || '안끝남'; if (R.at120 === null) R.at120 = 'done';
  R.everRouted = everR.filter(Boolean).length;
  const cnt = (s, f) => ctx.units.filter((u) => u.side === s && f(u)).length;
  R.dead = { A: cnt('A', (u) => u.hp <= 0), B: cnt('B', (u) => u.hp <= 0) };
  R.flee = { A: cnt('A', (u) => u.hp > 0 && u.routing), B: cnt('B', (u) => u.hp > 0 && u.routing) };
  R.alive = { A: cnt('A', (u) => u.hp > 0), B: cnt('B', (u) => u.hp > 0) };
  R.sum = (R.dead.A + R.alive.A !== start.A ? 1 : 0) + (R.dead.B + R.alive.B !== start.B ? 1 : 0) + (ctx.sides.A.dead !== R.dead.A || ctx.sides.B.dead !== R.dead.B ? 1 : 0);
  R.broken = cnt('A', (u) => u.broken) + cnt('B', (u) => u.broken);
  R.start = start;
  if (w === 'A' || w === 'B') { const al = ctx.units.filter((u) => u.side === w && u.hp > 0); R.winHp = al.length ? al.reduce((s, u) => s + u.hp / u.maxHp, 0) / al.length : 0; }
  if (!w && !R.reason) {   // 안 끝남 까닭
    const routing = { A: cnt('A', (u) => u.hp > 0 && u.routing), B: cnt('B', (u) => u.hp > 0 && u.routing) };
    R.reason = R.firstHit < 0 ? '서로안닿음' : (routing.A && routing.B ? '서로달아남' : '끝조건없음');
  }
  // 들판 끝 꼴(어댑터 없는 독립 실행의 끝 — 달아난 몸은 x = −40 · 130 + 40 에서 맴돌고 이긴 편은 적 무게중심으로 걸어간다):
  //   위 끝 뒤에도 진 편이 다 죽거나 상한까지 그대로 더 돌려 진 편 죽음을 따로 센다(PM 200판 표의 "죽음"이 이 꼴로 보인다 — 보고 §).
  R.steps = steps; R.deadEdge = 0; R.edgeT = 0; R.edgeOpen = 0;
  if (w === 'A' || w === 'B') { const lo = w === 'A' ? 'B' : 'A'; const t1 = ctx.tick; let al = ctx.units.filter((u) => u.side === lo && u.hp > 0).length;
    while (al > 0 && steps < maxSteps) { BC._trackVel(ctx, c.dt); BC._stepBattle(ctx, c.dt); steps++; al = 0; for (const u of ctx.units) if (u.side === lo && u.hp > 0) al++; }
    R.deadEdge = ctx.units.filter((u) => u.side === lo && u.hp <= 0).length; R.edgeT = ctx.tick - t1; R.edgeOpen = al > 0 ? 1 : 0; }
  return R;
}

// ── 칸 하나 → 줄 하나 ──
const COLS = ['key', 'g', 'A', 'B', 'mA', 'mB', 'dt', 'inj', 'n', 'winA', 'winB', 'draw', 'open', 'openWhy', 'loserDead', 'loserDeadAtDec', 'loserDeadEdge', 'edgeMed', 'edgeOpen', 'loserFled', 'winnerDead', 'preContactRout', 'preRoutA', 'preRoutB', 'deadA', 'deadB', 'fledA', 'fledB',
  'routFight', 'routIdle', 'rally', 'chasedShare', 'lenMed', 'lenP90', 'chaseMed', 'hitToDeathMed', 'broken', 'winHp', 'open120', 'nan', 'mrlOut', 'sumBad', 'msPerBattle', 'digest'];
const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : '');
const q = (arr, p) => { if (!arr.length) return ''; const s = arr.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };
const mean = (arr) => (arr.length ? +(arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(3) : '');
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
function runCell(c) {
  const n = NOVR != null ? NOVR : c.n; const rs = []; const t0 = process.hrtime.bigint();
  for (let i = 1; i <= n; i++) rs.push(runBattle(c, i));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const dec = rs.filter((r) => r.win === 'A' || r.win === 'B');
  const lose = (r) => (r.win === 'A' ? 'B' : 'A');
  const ld = dec.filter((r) => r.start[lose(r)] > 0), wd = dec.filter((r) => r.start[r.win] > 0);
  const why = {}; for (const r of rs) if (r.reason) why[r.reason] = (why[r.reason] || 0) + 1;
  const er = rs.reduce((s, r) => s + r.everRouted, 0), cd = rs.reduce((s, r) => s + r.chasedDead, 0);
  const row = {
    key: c.key, g: c.g, A: sideStr(c.A), B: sideStr(c.B), mA: c.mA, mB: c.mB, dt: +c.dt.toFixed(4), inj: c.inj ? 1 : 0, n,
    winA: pct(rs.filter((r) => r.win === 'A').length, n), winB: pct(rs.filter((r) => r.win === 'B').length, n), draw: pct(rs.filter((r) => r.win === '무').length, n), open: pct(rs.filter((r) => r.win === '안끝남').length, n),
    openWhy: Object.keys(why).sort().map((k) => k + ':' + why[k]).join(' '),
    loserDead: ld.length ? +(100 * mean(ld.map((r) => r.dead[lose(r)] / r.start[lose(r)]))).toFixed(1) : '',
    loserDeadAtDec: ld.length ? +(100 * mean(ld.map((r) => r.deadDec[lose(r)] / r.start[lose(r)]))).toFixed(1) : '',
    loserDeadEdge: ld.length ? +(100 * mean(ld.map((r) => r.deadEdge / r.start[lose(r)]))).toFixed(1) : '',
    edgeMed: q(dec.map((r) => r.edgeT), 0.5), edgeOpen: pct(dec.filter((r) => r.edgeOpen).length, dec.length || 1),
    loserFled: ld.length ? +(100 * mean(ld.map((r) => r.flee[lose(r)] / r.start[lose(r)]))).toFixed(1) : '',
    winnerDead: wd.length ? +(100 * mean(wd.map((r) => r.dead[r.win] / r.start[r.win]))).toFixed(1) : '',
    preContactRout: pct(rs.filter((r) => r.firstRout >= 0 && (r.contact < 0 || r.firstRout < r.contact)).length, n),
    preRoutA: pct(rs.filter((r) => r.preRout.A).length, n), preRoutB: pct(rs.filter((r) => r.preRout.B).length, n),
    deadA: c.A && rs[0].start.A ? +(100 * mean(rs.map((r) => r.dead.A / r.start.A))).toFixed(1) : '', deadB: rs[0].start.B ? +(100 * mean(rs.map((r) => r.dead.B / r.start.B))).toFixed(1) : '',
    fledA: rs[0].start.A ? +(100 * mean(rs.map((r) => r.flee.A / r.start.A))).toFixed(1) : '', fledB: rs[0].start.B ? +(100 * mean(rs.map((r) => r.flee.B / r.start.B))).toFixed(1) : '',
    routFight: mean(rs.map((r) => r.routFight)), routIdle: mean(rs.map((r) => r.routIdle)), rally: mean(rs.map((r) => r.rally)),
    chasedShare: pct(cd, er),
    lenMed: q(dec.map((r) => r.dec), 0.5), lenP90: q(dec.map((r) => r.dec), 0.9), chaseMed: q(dec.map((r) => r.t - r.dec), 0.5),
    hitToDeathMed: q(rs.filter((r) => r.firstDeath >= 0 && r.firstHit >= 0).map((r) => r.firstDeath - r.firstHit), 0.5),
    broken: mean(rs.map((r) => r.broken)), winHp: dec.length ? +(100 * mean(dec.map((r) => r.winHp || 0))).toFixed(1) : '',
    open120: pct(rs.filter((r) => r.at120 === 'open').length, n),
    nan: rs.reduce((s, r) => s + r.nan, 0), mrlOut: rs.reduce((s, r) => s + r.mrlOut, 0), sumBad: rs.reduce((s, r) => s + r.sum, 0),
    msPerBattle: +(ms / n).toFixed(2),
    digest: fnv(rs.map((r) => [r.win, r.t.toFixed(4), r.dead.A, r.dead.B, r.flee.A, r.flee.B, r.steps, r.deadEdge, r.edgeT.toFixed(4), r.routFight, r.routIdle, r.rally, r.chasedDead, r.broken].join(',')).join(';')),
  };
  return row;
}
const csvLine = (row) => COLS.map((k) => { const v = row[k] == null ? '' : String(row[k]); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');

if (require.main === module) {
  if (argv.includes('--selfcheck')) {   // 결정론: 같은 칸 · 같은 씨 두 번 = 같은 줄(ms 뺌)
    const cs = cells(); let bad = 0;
    for (const c of cs) { const a = runCell(c), b = runCell(c); delete a.msPerBattle; delete b.msPerBattle; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('다름 ' + c.key); } }
    console.log(`결정론 ${cs.length - bad}/${cs.length} 같음`); process.exitCode = bad ? 1 : 0; return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const meta = path.join(OUT, 'meta.txt');
  if (!fs.existsSync(meta)) fs.writeFileSync(meta, `core=${CORE}\nenv=${args('--env').join(' ')}\ncap=${CAP}\nstarted=${new Date().toISOString()}\n`);
  const cs = cells(); const done = new Set(); const files = {};
  for (const g of new Set(cs.map((c) => c.g))) { const f = path.join(OUT, g + '.csv'); files[g] = f;
    if (fs.existsSync(f)) { for (const l of fs.readFileSync(f, 'utf8').split('\n').slice(1)) if (l) done.add(l.split(',')[0]); }
    else fs.writeFileSync(f, COLS.join(',') + '\n'); }
  const todo = cs.filter((c) => !done.has(c.key)); const T0 = Date.now(); let k = 0, lastP = -1;
  console.log(`칸 ${cs.length} · 끝난 칸 ${cs.length - todo.length} · 남은 칸 ${todo.length} · dt ${DT} · 상한 ${CAP}초 · 코어 ${path.relative(process.cwd(), CORE)}`);
  for (const c of todo) {
    fs.appendFileSync(files[c.g], csvLine(runCell(c)) + '\n'); k++;
    const p = Math.floor(100 * k / todo.length / 5) * 5;
    if (p !== lastP) { lastP = p; console.log(`진행 ${p}% · ${k}/${todo.length}칸 · ${((Date.now() - T0) / 60000).toFixed(1)}분`); }
  }
  fs.appendFileSync(meta, `finished=${new Date().toISOString()} cells=${todo.length} wallMs=${Date.now() - T0}\n`);
}
module.exports = { cells, runBattle, runCell, COLS };

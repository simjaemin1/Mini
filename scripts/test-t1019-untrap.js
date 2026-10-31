#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-t1019-untrap.js — 갇힌 방어 몸(ⓒ · `T1019_UNTRAP` 켬 기본 후보) · 상대 hp 를 못 깎은 돌격(ⓓ · `T1019_ASSAULT_HP` 끔 기본) ==========
//
// ★왜 [지시 T1019 · T1008 회부 1 · 2]
//   ⓒ 판 자 `~raid3` 시드 7 전쟁 9(농촌3 → 어촌6 · 401날 끝없는 전쟁): 방어 포진(war-live `_muDefHold`)이 원점을 포진점에서 공격 쪽으로 8칸 마중하는데
//     그 걸음이 막힌 칸인지 안 본다(랩 `_muTickDefHold` 는 본다) → 원점이 집 발자국 칸에 서고 지휘 몸이 거기 놓인다(T790 끔) → 풀린 뒤 battle-core 몸 클램프가
//     "새 자리 막힘 · 이전 자리도 막힘 → 이전 자리" 라 그 칸을 영원히 못 나온다. 집 안에 있던 몸이 긴급 소집으로 그 자리에서 풀려도 같은 덫이다.
//   ⓓ 사거리 끝 화살 한 대(접촉 1 ~ 2 걸음) · 아무도 안 다친 돌격이 날마다 되풀이 — T956 칸은 접촉 0 인 돌격만 본다.
//   지키는 것:
//     ⓐ 정적 — 손잡이 둘의 문(ⓒ 세 파일 · 같은 이름 · 켬 기본 · ⓓ `=== '1'` 하나) · T956 줄 글자 그대로 · 새 수 0
//     ⓑ battle-core 클램프(war-live 정본 · 아이 판) — 집 발자국 6×5칸 안의 단검병 ↔ 밖의 단검병:
//        ★끔(`=0`) = 안의 몸은 1분 내내 그 칸(걸음 0 · hp 그대로 — 자명 통과 금지의 증인) · ★켬(미설정 = 기본 · `'1'` 도 같은 걸음) = 걸어 나와 붙는다(hp 가 준다) ·
//        두 판 다 밖의 몸은 한 번도 안 든다(들어가는 걸음은 여전히 막힌다) · 나온 몸은 다시 안 든다
//     ⓒ war-live 마중(`_muDefHold`) — 포진점에서 8칸 앞이 집 발자국 칸: ★끔 = 원점 · 지휘 몸이 그 칸에 선다(증인) · ★켬 = 한 번도 안 든다 · 축 미끄럼으로 마중은 이어진다
//     ⓓ villages 대치(`_warToStandoff` — `__p3Bind`) — 켬(`'1'`): 접촉이 늘어도 방어 hp 합이 그대로면 칸이 선다 · 줄었으면(다침 · 죽음 · 든 병사 다침) 안 선다 ·
//        출격 대치(몸 칸 없음)는 안 본다 · T956 끔(`=0`)이면 안 돈다 · ★끔(미설정 — 기본) = 종전(접촉이 늘면 칸 0)
// ⚠존을 부팅하지 않는다 — 정본(battle-core · war-live · villages `__p3Bind`)을 그대로 부른다(규칙 사본 0). 손잡이는 모듈을 싣는 순간 읽는다 ⇒ 판마다 아이 프로세스.
// 실행: node scripts/test-t1019-untrap.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const KNOBS = ['T1019_UNTRAP', 'T1019_ASSAULT_HP', 'T956_ASSAULT_MISS', 'T771_SORTIE_MISS', 'T790_NO_SNAP', 'T1019_AHOLD', 'T1019_HIN'];
const r3 = (x) => Number.isFinite(x) ? +x.toFixed(3) : null;

// ── 아이 판 ① battle-core 클램프 — 집 발자국(칸 97..102 × 99..103 · 셀 = m) 안의 단검병(B) ↔ 밖 6.5m 의 단검병(A) · 1분(1,800걸음) ──
if (process.env.T1019_SUB === 'clamp') {
  const WLM = require(path.join(ROOT, 'server', 'war-live.js'));
  const live = WLM.createWarLive({ cellPx: 32, pxPerM: 32, tickHz: 30 });
  const R = { x0: 97, y0: 99, x1: 102, y1: 103 }, AH = process.env.T1019_AHOLD === '1';   //   AH = 밖의 몸이 지키는 쪽(제자리 · 안 쫓음) — 안의 몸이 다 나와야 닿는다
  const inR = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y); return ix >= R.x0 && ix <= R.x1 && iy >= R.y0 && iy <= R.y1; };
  const dirTo = (ux, uy, tx, ty) => { const dx = tx - ux, dy = ty - uy, d = Math.hypot(dx, dy); return d > 1e-6 ? { dx: dx / d, dy: dy / d, d } : null; };
  const world = {   //   villages `_warWorld` 꼴의 최소 어댑터(막힘 = 그 직사각 하나 · 시야 · 엄폐 없음 · 적 본대로 곧게 · 지키는 쪽 없음)
    blocked: (x, y) => inR(x, y), losBlocked: () => false, coverAt: () => false,
    advance: (ctx, u) => { if (AH && u.side === 'A') return null; const c = ctx._cen[u.side === 'A' ? 'B' : 'A']; return (c && c.n) ? dirTo(u.x, u.y, c.x, c.y) : null; },
    hold: (ctx, u) => AH && u.side === 'A', flee: (ctx, u) => ({ dx: u.side === 'A' ? 1 : -1, dy: 0 }),
  };
  const f = live.makeFight({ id: 9, born: 400, atk: { name: '농촌3' }, def: { name: '어촌6' }, _heading: 0 }, world, { A: null, B: null });
  const pa = { pid: 'pa', x: 106 * 32, y: 101.5 * 32 }, pb = { pid: 'pb', x: 99.5 * 32, y: 101.5 * 32 };
  const ga = { type: 'dagger', pid: 'pa' }, gb = { type: 'dagger', pid: 'pb' };
  live.bindGroupUnit(ga, pa); live.bindGroupUnit(gb, pb);
  const ua = live.enlist(f, 'A', ga, pa), ub = live.enlist(f, 'B', gb, pb);
  live.orderAdvance(f, 'A'); live.orderAdvance(f, 'B');
  const hp0 = [ua.hp, ub.hp], b0 = [ub.x, ub.y];
  let bIn = 0, exitAt = null, reIn = false, aIn = 0, minD = Infinity, cSteps = 0, so = 0, rout = null, bMove = 0;
  for (let t = 0; t < 1800; t++) {
    const bx = ub.x, by = ub.y;
    const ev = live.stepFight(f);
    if (ev.contact) cSteps++;
    if (ev.standoff) { so++; live.orderAdvance(f, 'A'); live.orderAdvance(f, 'B'); }
    if (ev.rout) { rout = ev.rout; break; }
    if (Math.hypot(ub.x - bx, ub.y - by) > 1e-9) bMove++;
    const bi = inR(ub.x, ub.y); if (bi) bIn++; if (!bi && exitAt == null) exitAt = t + 1; if (bi && exitAt != null) reIn = true;
    if (inR(ua.x, ua.y)) aIn++;
    if (ua.hp > 0 && ub.hp > 0) minD = Math.min(minD, Math.hypot(ua.x - ub.x, ua.y - ub.y));
  }
  process.stdout.write(JSON.stringify({ knob: process.env.T1019_UNTRAP == null ? null : process.env.T1019_UNTRAP, hp0, hp1: [r3(ua.hp), r3(ub.hp)], b0, b1: [r3(ub.x), r3(ub.y)],
    bIn, exitAt, reIn, aIn, bMove, minD: r3(minD), cSteps, so, rout }));
  process.exit(0);
}
// ── 아이 판 ② war-live 마중 — 포진점 (100, 110) · 공격 원점 (98.71, 37.6)(어촌6 판의 그 기울기) · 집 발자국 칸 98..101 × 101..103(8칸 마중 끝이 그 안) · 400번 ──
if (process.env.T1019_SUB === 'hold') {
  const WLM = require(path.join(ROOT, 'server', 'war-live.js'));
  const R = { x0: 98, y0: 101, x1: 101, y1: 103 };
  const inR = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y); return ix >= R.x0 && ix <= R.x1 && iy >= R.y0 && iy <= R.y1; };
  const live = WLM.createWarLive({ cellPx: 32, pxPerM: 32, tickHz: 30, blockedCell: (cx, cy) => inR(cx, cy) });
  const IN = process.env.T1019_HIN === '1';   //   IN = 포진점(= 원점)이 처음부터 발자국 칸 안(나선이 못 찾은 판 · 재편 원점 꼴) — 나오는 걸음이 막히면 안 된다
  const h0 = IN ? { cx: 99.5, cy: 103.5 } : { cx: 100, cy: 110 };
  const u = { type: 'archer', x: h0.cx, y: h0.cy };
  const g = live.buildGroup([u], 'wall', { cx: h0.cx, cy: h0.cy }, -Math.PI / 2, 29);
  g.holdPt = { cx: h0.cx, cy: h0.cy };
  const atk = { cx: 98.71, cy: 37.6 };
  let cIn = 0, uIn = 0, firstIn = null, lastIn = null;
  for (let i = 0; i < 400; i++) {
    live._muDefHold(g, atk, live.MU.FOLLOW_CAP);
    if (inR(g.cmd.cx, g.cmd.cy)) { cIn++; if (firstIn == null) firstIn = i + 1; lastIn = i + 1; }
    if (inR(u.x, u.y)) uIn++;
  }
  const adv = Math.hypot(g.cmd.cx - g.holdPt.cx, g.cmd.cy - g.holdPt.cy);
  process.stdout.write(JSON.stringify({ knob: process.env.T1019_UNTRAP == null ? null : process.env.T1019_UNTRAP, cmd: [r3(g.cmd.cx), r3(g.cmd.cy)], u: [r3(u.x), r3(u.y)], adv: r3(adv), cIn, uIn, firstIn, lastIn, max: live.MU.DEF_ADVANCE_MAX }));
  process.exit(0);
}
// ── 아이 판 ③ villages 대치 — 몸 칸(`_t956C0` · `_t1019H0`)과 교전 접촉 수 · 방어 병사 hp 를 꾸며 `_warToStandoff` 를 부른다 ──
if (process.env.T1019_SUB === 'standoff') {
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const H = V.__p3Bind({ world: { day: 12 }, _warStat: { standoff: 0 } });
  const P = JSON.parse(process.env.T1019_P);
  const units = P.units.map((x) => ({ side: x.side || 'B', hp: x.h0, maxHp: x.maxHp, type: 'spear' }));
  const f = { contacts: P.c0 == null ? 0 : P.c0, ctx: { units } };
  const H0 = H._t1019HpRef(f);   //   돌격 시작(운영 `_warEngage` 와 같은 문) — 그때 없던 병사는 지운다(뒤에 든 병사)
  P.units.forEach((x, i) => { if (x.late) H0.delete(units[i]); });
  P.units.forEach((x, i) => { units[i].hp = x.h1; });
  f.contacts = P.cNow;
  const w = { phase: 'battle', op: 'assault', _sortie: false };
  const b = { w, fight: f, _t956C0: P.c0, _t1019H0: P.c0 == null ? null : H0, _t771C0: P.s771 == null ? null : P.s771 };
  H._warToStandoff(b);
  process.stdout.write(JSON.stringify({ miss: w._assaultMiss === undefined ? null : w._assaultMiss, smiss: w._sortieMiss === undefined ? null : w._sortieMiss,
    c0: b._t956C0 === undefined ? 'undef' : b._t956C0, h0: b._t1019H0 === undefined ? 'undef' : (b._t1019H0 === null ? null : 'map'), phase: w.phase, op: w.op, st: H.state._warStat.standoff,
    knobs: { UNTRAP: H.T1019_UNTRAP, AHP: H.T1019_ASSAULT_HP } }));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const CB = codeOf(fs.readFileSync(path.join(ROOT, 'sim', 'battle-core.js'), 'utf8'));
const CW = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'war-live.js'), 'utf8'));
const CV = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
const fnBody = (C, name) => { const i = C.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = C.indexOf('{', i); for (let k = j; k < C.length; k++) { if (C[k] === '{') d++; else if (C[k] === '}') { d--; if (!d) return C.slice(i, k + 1); } } return ''; };
const sub = (mode, env, P) => { const E = Object.assign({}, process.env, { T1019_SUB: mode }); for (const k of KNOBS) delete E[k]; delete E.T1019_P; Object.assign(E, env || {}); if (P) E.T1019_P = JSON.stringify(P);
  const out = execFileSync(process.execPath, [__filename], { cwd: ROOT, env: E, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); return JSON.parse(out.slice(out.indexOf('{'))); };
const strip = (o) => JSON.stringify(Object.assign({}, o, { knob: null, knobs: null }));
console.log('\n=== 갇힌 방어 몸(ⓒ) · 상대 hp 를 못 깎은 돌격(ⓓ) — T1019 ===');

// ── ⓐ 정적 ──────────────────────────────────────────────────────────────────
console.log('\n[ⓐ] 정적 — 손잡이 둘 · 문 · 새 수 0');
ok(/const T1019_UNTRAP=!\(typeof process!=='undefined'&&process\.env&&process\.env\.T1019_UNTRAP==='0'\);/.test(CB) && (CB.match(/T1019_UNTRAP/g) || []).length === 3,
  "ⓐ ⓒ battle-core — `!(… === '0')` 한 자리(켬 기본 · 되돌림 `=0` · 브라우저 = 켬) · 읽는 줄 하나(클램프)", (CB.match(/T1019_UNTRAP/g) || []).length);
ok(/if\(ctx\.world&&u\._ox!=null&&ctx\.world\.blocked\(u\.x,u\.y\)&&!\(T1019_UNTRAP&&ctx\.world\.blocked\(u\._ox,u\._oy\)\)\)\{\s*\n\s+const nx=u\.x, ny=u\.y;/.test(CB),
  'ⓐ ⓒ battle-core 클램프 — 켬이면 이전 자리도 막힌 몸만 안 묶는다(그 밖은 종전 축 미끄럼 · 제자리 그대로)');
ok(/const T1019_UNTRAP = typeof process !== 'undefined' && !!process\.env && process\.env\.T1019_UNTRAP !== '0';/.test(CW) && (CW.match(/process\.env\.T1019_UNTRAP/g) || []).length === 1,
  "ⓐ ⓒ war-live — `!== '0'` 한 자리(켬 기본)");
const dh = fnBody(CW, '_muDefHold');
ok(/if \(!T1019_UNTRAP \|\| !blockedCell\) \{ g\.cmd\.cx \+= ax \/ ad \* step; g\.cmd\.cy \+= ay \/ ad \* step; \}/.test(dh)
  && /if \(!blockedCell\(nx, ny\) \|\| blockedCell\(g\.cmd\.cx, g\.cmd\.cy\)\) \{ g\.cmd\.cx = nx; g\.cmd\.cy = ny; \} else if \(!blockedCell\(nx, g\.cmd\.cy\)\) g\.cmd\.cx = nx; else if \(!blockedCell\(g\.cmd\.cx, ny\)\) g\.cmd\.cy = ny;/.test(dh),
  'ⓐ ⓒ war-live 마중 — 끔 = 종전 두 덧셈 글자 · 켬 = 막힌 칸으로 드는 걸음이면 축 미끄럼 · 둘 다 막히면 그 자리 · 원점이 이미 막힌 칸 안이면 안 막는다(나오는 걸음)');
ok(/const T1019_UNTRAP = process\.env\.T1019_UNTRAP !== '0';/.test(CV) && (CV.match(/process\.env\.T1019_UNTRAP/g) || []).length === 1, "ⓐ ⓒ villages — `!== '0'` 한 자리");
const ed = fnBody(CV, '_warEnsureDefense');
ok(/if \(T1019_UNTRAP\) \{ const c = _warStandNear\(rally\.cx, rally\.cy\); if \(c\) \{ rally\.cx = c\.cx; rally\.cy = c\.cy; \} \}/.test(ed) && ed.indexOf('_warStandNear(rally') < ed.indexOf('WL.buildGroup(d.units'),
  'ⓐ ⓒ villages 포진점 — 막힌 칸이면 설 수 있는 가장 가까운 칸(대형을 짓기 전 · 못 찾으면 그 자리)');
ok(/const T1019_ASSAULT_HP = process\.env\.T1019_ASSAULT_HP === '1';/.test(CV) && (CV.match(/process\.env\.T1019_ASSAULT_HP/g) || []).length === 1, "ⓐ ⓓ villages — `=== '1'` 한 자리(끔 기본)");
const eng = fnBody(CV, '_warEngage'), so = fnBody(CV, '_warToStandoff');
ok(/if \(T956_ASSAULT_MISS && T1019_ASSAULT_HP\) body\._t1019H0 = side === 'A' \? _t1019HpRef\(f\) : null;/.test(eng) && eng.indexOf('_t1019HpRef(f)') > eng.indexOf('body._t956C0 = side'),
  'ⓐ ⓓ 돌격 시작 — 공격이 나설 때(쪽 A)만 방어 병사 hp 를 몸에 적는다(T956 줄 다음 · 손잡이 문 안)');
ok(/if \(T1019_ASSAULT_HP && T956_ASSAULT_MISS && body\._t956C0 != null && _t1019NoHurt\(f, body\._t1019H0\)\) w\._assaultMiss = state\.world\.day;/.test(so)
  && /if \(T956_ASSAULT_MISS && body\._t956C0 != null\) \{ if \(!f \|\| \(f\.contacts \| 0\) === body\._t956C0\) w\._assaultMiss = state\.world\.day; body\._t956C0 = null; \}/.test(so)
  && so.indexOf('_t1019NoHurt(f') < so.indexOf('if (T956_ASSAULT_MISS && body._t956C0 != null) {') && /if \(T1019_ASSAULT_HP\) body\._t1019H0 = null;/.test(so),
  'ⓐ ⓓ 대치 — 넓힌 줄은 T956 줄 앞 한 줄(T956 줄 글자 그대로) · 몸 칸은 지운다');
{
  const nh = fnBody(CV, '_t1019NoHurt'), hr = fnBody(CV, '_t1019HpRef');
  ok(/s0 \+= H0\.has\(u\) \? H0\.get\(u\) : \(u\.maxHp \|\| 0\); s1 \+= Math\.max\(0, u\.hp\);/.test(nh) && /return s1 >= s0;/.test(nh) && /H\.set\(u, Math\.max\(0, u\.hp\)\)/.test(hr),
    'ⓐ ⓓ hp 합 — 시작 hp(그 뒤 든 병사 = 다 찬 hp) ≤ 지금 hp(죽은 몸 0)면 못 깎았다(문턱 없음)');
  //   손잡이가 더한 글자에 새 수가 없다(0 · 1 뿐 — 이름의 1019 는 글자다)
  const add = [dh, ed.slice(ed.indexOf('if (T1019_UNTRAP)'), ed.indexOf('WL.buildGroup(d.units')), nh, hr,
    (CB.match(/if\(ctx\.world&&u\._ox!=null[^\n]*/) || [''])[0], (eng.match(/if \(T956_ASSAULT_MISS && T1019_ASSAULT_HP\)[^\n]*/) || [''])[0],
    (so.match(/if \(T1019_ASSAULT_HP && T956_ASSAULT_MISS[^\n]*/) || [''])[0]].join(' ').replace(/'[^']*'/g, "''").replace(/T1019|_t1019/g, '');
  ok(!/[^\w.'](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w'])/.test(add), 'ⓐ 새 수 0 — 더한 글자엔 0 · 1 만(마중 상한 · 걸음 · 술어 · 나선은 종전 것)', add.length + '자');
}

// ── ⓑ battle-core 클램프(아이 판) ──────────────────────────────────────────────
console.log('\n[ⓑ] battle-core 클램프 — 집 발자국(6×5칸) 안 단검병 ↔ 밖 6.5m 단검병 · 1분');
{
  //   ⓑ1 밖의 몸이 지키는 쪽(제자리) — 안의 몸이 다 나와야 손이 닿는다
  const OFF = sub('clamp', { T1019_UNTRAP: '0', T1019_AHOLD: '1' }), ON = sub('clamp', { T1019_AHOLD: '1' }), ON1 = sub('clamp', { T1019_UNTRAP: '1', T1019_AHOLD: '1' });
  ok(OFF.bIn === 1800 && OFF.bMove === 0 && OFF.exitAt == null && OFF.b1[0] === OFF.b0[0] && OFF.b1[1] === OFF.b0[1] && OFF.hp1[0] === OFF.hp0[0] && OFF.hp1[1] === OFF.hp0[1],
    '★ⓑ1 끔(`=0`) — 안의 몸은 1분 내내 그 칸 · 한 걸음도 못 뗀다 · hp 그대로(자명 통과 금지의 증인)', JSON.stringify({ bIn: OFF.bIn, mv: OFF.bMove, d: OFF.minD, hp: OFF.hp1, c: OFF.cSteps, so: OFF.so }));
  ok(ON.exitAt != null && ON.exitAt < 600 && !ON.reIn && (ON.hp1[0] < ON.hp0[0] || ON.hp1[1] < ON.hp0[1]) && ON.minD < 1.35,
    '★ⓑ1 켬(미설정 = 기본) — 안의 몸이 걸어 나와(20초 안) 손이 닿게 붙는다 · hp 가 준다 · 나온 몸은 다시 안 든다', JSON.stringify({ exit: ON.exitAt, reIn: ON.reIn, d: ON.minD, hp: ON.hp1, rout: ON.rout }));
  ok(strip(ON1) === strip(ON) && strip(ON) !== strip(OFF), "ⓑ1 켬 `'1'` = 미설정과 같은 걸음 · 끔(`=0`)과는 다른 걸음(끄는 값은 `'0'` 하나)");
  //   ⓑ2 둘 다 다가선다 — 밖의 몸은 발자국 가에서 막힌다(들어가는 걸음은 켬에서도 막힘)
  const OFF2 = sub('clamp', { T1019_UNTRAP: '0' }), ON2 = sub('clamp', {});
  ok(OFF2.aIn === 0 && OFF2.bMove === 0 && OFF2.minD > 2 && OFF2.hp1[0] === OFF2.hp0[0] && OFF2.hp1[1] === OFF2.hp0[1],
    'ⓑ2 끔 — 밖의 몸은 가에서 서고 안의 몸은 못 움직여 끝내 안 닿는다(증인)', JSON.stringify({ aIn: OFF2.aIn, d: OFF2.minD, hp: OFF2.hp1 }));
  ok(ON2.aIn === 0 && ON2.bMove > 0 && ON2.minD < 1.35 && (ON2.hp1[0] < ON2.hp0[0] || ON2.hp1[1] < ON2.hp0[1]),
    'ⓑ2 켬 — 밖의 몸은 한 걸음도 발자국에 안 든다 · 안의 몸이 가까이 와 닿는다', JSON.stringify({ aIn: ON2.aIn, mv: ON2.bMove, d: ON2.minD, hp: ON2.hp1, rout: ON2.rout }));
}

// ── ⓒ war-live 마중(아이 판) ───────────────────────────────────────────────────
console.log('\n[ⓒ] war-live 마중 — 포진점 8칸 앞이 집 발자국 칸');
{
  const OFF = sub('hold', { T1019_UNTRAP: '0' }), ON = sub('hold', {});
  ok(OFF.cIn > 0 && OFF.uIn > 0 && Math.abs(OFF.adv - OFF.max) < 1e-6 && OFF.u[0] === OFF.cmd[0] && OFF.u[1] === OFF.cmd[1],
    '★끔(`=0`) — 원점이 8칸 마중 끝(집 발자국 칸)에 서고 지휘 몸이 그 자리에 놓인다(어촌6 판의 그 꼴 — 증인)', JSON.stringify({ cmd: OFF.cmd, adv: OFF.adv, cIn: OFF.cIn, first: OFF.firstIn }));
  ok(ON.cIn === 0 && ON.uIn === 0 && ON.adv > 6 && ON.adv <= ON.max + 1e-9,
    '★켬(미설정 = 기본) — 원점 · 지휘 몸이 한 번도 발자국 칸에 안 든다 · 축 미끄럼으로 마중은 이어진다(상한 그대로)', JSON.stringify({ cmd: ON.cmd, adv: ON.adv, cIn: ON.cIn }));
  const IN = sub('hold', { T1019_HIN: '1' });
  ok(IN.lastIn != null && IN.lastIn <= 3 && IN.cIn === IN.lastIn && IN.adv > 6 && !(IN.cmd[1] >= 101 && IN.cmd[1] < 104),
    '켬 — 원점이 처음부터 발자국 칸 안이면 막지 않는다: 첫 걸음들에 나와(3번 안) 다시 안 든다 · 마중은 상한까지', JSON.stringify({ cmd: IN.cmd, adv: IN.adv, cIn: IN.cIn, last: IN.lastIn }));
}

// ── ⓓ villages 대치(아이 판) ───────────────────────────────────────────────────
console.log('\n[ⓓ] villages 대치 — 방어 hp 합을 못 줄인 돌격');
{
  const U = (h0, h1, maxHp, late) => ({ h0, h1, maxHp: maxHp || 120, late: !!late });
  const ON = { T1019_ASSAULT_HP: '1' };
  const a = sub('standoff', ON, { c0: 3, cNow: 5, units: [U(120, 120), U(80, 80)] });
  ok(a.miss === 12 && a.c0 === null && a.h0 === null && a.phase === 'march' && a.op === 'camp' && a.st === 1,
    "ⓓ ★켬(`'1'`) — 접촉이 늘어도(3 → 5) 방어 hp 합 그대로 → 그날(12)이 선다 · 몸 칸 둘 지움 · 대치 전이 종전 그대로", JSON.stringify(a));
  const b = sub('standoff', ON, { c0: 3, cNow: 5, units: [U(120, 119.5), U(80, 80)] });
  ok(b.miss === null && b.c0 === null, 'ⓓ 켬 — 한 몸이라도 다쳤으면(120 → 119.5) 안 선다', JSON.stringify(b));
  const c = sub('standoff', ON, { c0: 3, cNow: 5, units: [U(120, -3), U(80, 80)] });
  ok(c.miss === null, 'ⓓ 켬 — 죽은 몸(hp ≤ 0 = 0)은 준 것이다', JSON.stringify(c));
  const d = sub('standoff', ON, { c0: 3, cNow: 5, units: [U(120, 120), U(115, 115, 115, true)] });
  const d2 = sub('standoff', ON, { c0: 3, cNow: 5, units: [U(120, 120), U(115, 100, 115, true)] });
  ok(d.miss === 12 && d2.miss === null, 'ⓓ 켬 — 돌격 뒤에 든 병사는 다 찬 hp(spawn) 로 본다: 그대로면 선다 · 다쳤으면 안 선다', JSON.stringify({ full: d.miss, hurt: d2.miss }));
  const e = sub('standoff', ON, { c0: 3, cNow: 3, units: [U(120, 100)] });
  ok(e.miss === 12, 'ⓓ 켬 — 접촉 0 인 돌격은 T956 줄이 그대로 세운다', JSON.stringify(e));
  const f = sub('standoff', ON, { c0: null, cNow: 5, s771: 5, units: [U(120, 120)] });
  ok(f.miss === null && f.smiss === 12, 'ⓓ 켬 — 출격 대치(몸 칸 없음)는 안 본다 · 그 판은 T771 칸', JSON.stringify(f));
  const g = sub('standoff', { T1019_ASSAULT_HP: '1', T956_ASSAULT_MISS: '0' }, { c0: 3, cNow: 5, units: [U(120, 120)] });
  ok(g.miss === null && g.c0 === 3, 'ⓓ 켬이어도 T956 끔(`=0`)이면 안 돈다(넓히는 줄 — T956 칸이 없다)', JSON.stringify(g));
  const h = sub('standoff', {}, { c0: 3, cNow: 5, units: [U(120, 120), U(80, 80)] }), h0 = sub('standoff', { T1019_ASSAULT_HP: '0' }, { c0: 3, cNow: 5, units: [U(120, 120), U(80, 80)] });
  ok(h.miss === null && h.c0 === null && h0.miss === null && h.knobs.AHP === false && h.knobs.UNTRAP === true,
    '★끔(미설정 — 기본 · `=0` 도) — 종전: 접촉이 늘었으면 hp 와 무관하게 칸 0(자명 통과 금지의 증인 — 같은 몸이 켬에선 선다)', JSON.stringify({ miss: h.miss, k: h.knobs }));
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);

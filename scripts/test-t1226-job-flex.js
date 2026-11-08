#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1226-job-flex.js — 직업 바꾸기를 유연하게(T1226 · 손잡이 `T1226_JOB_FLEX` 끔 기본) — 코너 열넷 ===========
//
// ★무엇을 보나(카드 표 차례 · 판 수치는 보고/T1226 표 — 여기는 규칙이 코드에 그대로 서 있는지)
//   ① 철 따라 통째로 바꿔도 숙련 · 특성 · 경험치가 남고, 돌아오면 옛 숙련으로 바로 제 몫(값)을 낸다
//   ② 처음 해 보는 일 — 값 = 그 사람 숙련 몫 + D 날 배워 늘 몫(경험치 곡선 80 + 숙련 × 30 · 하루 1 xp)
//   ③ 마지막 한 사람 — 떠날 값 = 그 일 1인당 몫(한 명이면 그 일 전체) · 숙련은 마을에 남아 장인 이어받기가 그대로
//   ④ 사람 없는 일 — 첫 한 명은 종전 폴백 값으로 가고, 그 사람의 실현이 설 때까지 둘째는 기다린다
//   ⑤ 몰림 — 엇갈린 날(7날에 한 번씩 꼭 한 번) · 이미 옮긴 수가 갈 일 값을 깎는다 · 최근에 바꾼 사람 문턱
//   ⑥ 굶을 때 — 노동 목표 안 장인(석공)은 식량직으로 안 빠진다
//   ⑦ 작은 마을 — 같은 값이면 사람이 적을수록 문턱이 높다
//   ⑧ 촌장이 맡긴 사람 — 맡긴 30날 동안 빠진다
//   ⑨ 징발 — 보는 사람에서 빠지고 직업이 그대로(돌아오면 비용 0)
//   ⑩ 몸 — 직업이 바뀌면 몸 직업이 따라가고, 몸은 제자리(순간이동 0) · 손짐은 그대로 · 곳간 내리기는 직업을 안 묻는다
//   ⑪ 멈춤 규칙 — 켬 값은 잠재 산출(그날 낼 수 있었던 양)을 접는다(일찍 쉰 몫이 값을 안 깎는다)
//   ⑫ 결정론 · 마을 차례 — 이웃 농부 수는 그날 틱 머리 값 · 두 차례로 돌린 결과가 같다 · 두 판이 같다
//   ⑬ 성능 — 마을 하루 µs(표만 · 단정은 느슨하지 않게: 종전 전환일 하루 값의 50배 밑)
//   ⑭ 끔 = 종전 — 끔이면 7) 전환일 줄이 그대로(같은 마을 같은 날 끔 판 = 손잡이 없는 판 바이트)
//
// 실행: node scripts/test-t1226-job-flex.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
// 자연사(T1206)는 사람 id(프로세스 전역 마을 계수기)를 해시해 한 프로세스 두 판 비교를 깬다(보고/T1216_K3 ①) — 이 하네스가 재는 것(직업 바꾸기) 밖이라 끈다.
if (process.env.T1206_NAT_DEATH == null) process.env.T1206_NAT_DEATH = '0';
delete process.env.T1226_JOB_FLEX;

const E = R('sim/economy-sim');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const ON = () => { process.env.T1226_JOB_FLEX = '1'; };
const OFF = () => { delete process.env.T1226_JOB_FLEX; };
const quiet = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };

function mk(n, land, name) {
  const v = E.createVillage(Object.assign({ fertility: 1, water: 1, stone: 1, ore: 0.2, wood: 1, game: 1, size: 200, arable: 1, initialPop: n, name: name || '유촌' }, land || {}));
  const W = { villages: [v], picker: 'rational', day: 0, tradeLog: [], events: [], caravans: [] };
  v._world = W;
  return { v, W };
}
function run(T, d0, d1) { quiet(() => { for (let d = d0; d <= d1; d++) { T.W.day = d; for (const v of T.W.villages) E.tickVillage(v, d); } }); }
const jobsOf = (v) => v.npcs.map((p) => p.id + ':' + p.currentJob).join(',');

console.log('\n=== T1226 손잡이 · 이름 ===');
ok(E.t1226On() === false, '끔 기본(미설정)');
process.env.T1226_JOB_FLEX = '0'; ok(E.t1226On() === false, '`=0` = 끔');
process.env.T1226_JOB_FLEX = ''; ok(E.t1226On() === false, '빈 글자 = 끔');
ON(); ok(E.t1226On() === true, '`=1` = 켬'); OFF();
for (const k of ['t1226Flex', '_t1226Table', '_t1226V', '_t1226Sk', '_t1226Net', '_t1226LookDay', '_t1226FarmersOf', 'opportunityCost', 'villageMasterSkill', 'apprenticeInherit'])
  ok(typeof E[k] === 'function', `내보냄 ${k}`);

console.log('\n=== ① 철 따라 통째로 바꾸기 — 숙련은 남는다 ===');
{
  const T = mk(8);
  const p = T.v.npcs.find((x) => x.currentJob === 'farmer') || T.v.npcs[0];
  if (p.currentJob !== 'farmer') E._switchNPCJobForTest(p, 'farmer', 1, T.v);
  p.skills.farming = 5; p.skillXp.farming = 37; const tr = JSON.stringify(p.traits);
  const w = () => 1;
  const oc0 = E.opportunityCost(p, T.v, w);
  E._switchNPCJobForTest(p, 'hunter', 10, T.v);
  ok(p.skills.farming === 5 && p.skillXp.farming === 37 && JSON.stringify(p.traits) === tr, '겨울에 사냥꾼 — 농사 숙련 5 · 경험치 37 · 특성 그대로', `${p.skills.farming}/${p.skillXp.farming}`);
  E._switchNPCJobForTest(p, 'farmer', 100, T.v);
  ok(E.opportunityCost(p, T.v, w) === oc0, '봄에 농부로 — 옛 숙련으로 바로 같은 값(배수 1 + 5 × 0.05)', `${oc0}`);
  ok(E._t1226Sk(p, 'farmer', 0) === 1 + 0.05 * 5, '켬 값의 숙련 배수 = opportunityCost 의 배수(D 0)');
  // 켬 판에서 철로 직업을 막는 문이 없다 — 7) 줄 · 피커 · 값 어디에도 철 글자가 없다
  const src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
  const fx = src.slice(src.indexOf('function t1226Flex('), src.indexOf('// ★[T1226] 전환 보류 문의 가치표'));
  ok(fx.length > 500 && !/season|seasonOf|winter|겨울/.test(fx.replace(/\/\/.*$/gm, '')), '켬 전환 몸통에 철 막기 없음(통째로 바꾸기 허용)');
}

console.log('\n=== ② 처음 해 보는 일 — 값에 배워 늘 몫 ===');
{
  const p = { skills: { farming: 0, hunting: 0, archery: 0 } };
  const D = 100, s = 0;
  ok(Math.abs(E._t1226Sk(p, 'farmer', D) - (1 + 0.05 * (s + 0.5 * D / (80 + 30 * s)))) < 1e-12, '숙련 0 · D 100 — 1 + 0.05 × (0 + ½ × 100 ÷ 80)(경험치 곡선 그대로)', E._t1226Sk(p, 'farmer', D).toFixed(5));
  ok(E._t1226Sk(p, 'farmer', 30) < E._t1226Sk(p, 'farmer', 100), '이어질 날이 길수록 배워 늘 몫이 크다');
  const q = { skills: { farming: 6 } };
  ok(E._t1226Sk(q, 'farmer', 100) > E._t1226Sk(p, 'farmer', 100), '숙련 있는 사람의 값 > 처음 하는 사람');
  ok(E._t1226Sk({ skills: { farming: 10 } }, 'farmer', 1000) === 1.5, '숙련 상한 10(더 안 는다)');
}

console.log('\n=== ③ 마지막 한 사람 · 장인 이어받기 ===');
{
  const T = mk(8, { ore: 0.6 });
  run(T, 1, 3); ON(); run(T, 4, 12);
  const v0 = T.v, lone = v0.npcs[0], j0 = lone.currentJob === 'hunter' ? 'farmer' : 'hunter';
  for (const p of v0.npcs) if (p !== lone && p.currentJob === j0) E._switchNPCJobForTest(p, lone.currentJob, 12, v0);
  E._switchNPCJobForTest(lone, j0, 12, v0);
  const Tb = E._t1226Table(v0, T.W);
  ok(v0.counts[j0] === 1 && Tb.val[j0] !== undefined, `${j0} 에 한 명`, `${v0.counts[j0]}`);
  ok(Math.abs(E._t1226V(Tb, lone, j0, 0) - Tb.val[j0] * E._t1226Sk(lone, j0, 0) / (Tb.fb[j0] ? 1 : Tb.skm[j0])) < 1e-12, '떠날 값 = 그 일 1인당 몫(한 명 = 그 일 전체 · 접은 산출 ÷ 접은 일꾼) × 그 사람 숙련 ÷ 평균', Tb.val[j0].toFixed(3));
  OFF();
  const v = T.v, m = v.npcs[0];
  for (const p of v.npcs) if (p !== m && p.currentJob === 'smith') E._switchNPCJobForTest(p, 'farmer', 20, v);
  E._switchNPCJobForTest(m, 'smith', 20, v);
  m.skills[E.JOBS.smith.field] = 8;
  const before = JSON.stringify(E.apprenticeInherit(v, 'smith')), msk = E.villageMasterSkill(v, 'smith');
  E._switchNPCJobForTest(m, 'farmer', 21, v);   // 마지막 대장장이가 떠남
  ok((v.counts.smith || 0) === 0, '대장장이 0명');
  ok(E.villageMasterSkill(v, 'smith') === msk && JSON.stringify(E.apprenticeInherit(v, 'smith')) === before, '그래도 명장 숙련 8 이 마을에 남아 새로 난 아이 이어받기가 같다', before);
}

console.log('\n=== ④ 사람 없는 일 — 첫 한 명만 ===');
{
  // 실현 없는 직업: 값 표에서 폴백 · 한 명이 들어간 뒤 실현이 0 이면 기다림 표지
  ON();
  const T = mk(10);
  run(T, 1, 20);
  const v = T.v;
  const empty = ['lumberjack', 'miner', 'hunter', 'fisher', 'forager'].find((j) => !(v.counts[j] > 0));
  if (empty) {
    const T0 = E._t1226Table(v, T.W);
    ok(T0.fb[empty] === 1, `${empty}(0명) — 값은 종전 폴백(땅 상수식)`, T0.val[empty] != null ? T0.val[empty].toFixed(3) : 'null');
    ok(!T0.wait[empty], '0명일 땐 기다림 아님(첫 한 명은 간다)');
    const p = v.npcs.find((x) => x.currentJob !== empty);
    E._switchNPCJobForTest(p, empty, T.W.day, v);
    v._allocDay = T.W.day - 1;   // 다음 정산이 접게(하루 뒤)
    const sv = JSON.stringify(v._allocEma || {});
    const T1 = E._t1226Table(v, T.W);
    ok(T1.wait[empty] === 1 && (T1.counts[empty] || 0) === 1, `한 명 들어간 ${empty} — 실현 0 이면 둘째는 기다림`, JSON.stringify({ wait: T1.wait[empty], n: T1.counts[empty] }));
    v._allocEma = JSON.parse(sv);
  } else ok(false, '0명 직업을 못 만듦');
  OFF();
}

console.log('\n=== ⑤ 몰림 — 엇갈린 날 · 이미 옮긴 수 · 최근 전환 문턱 ===');
{
  const ids = []; for (let i = 0; i < 400; i++) ids.push('n' + (i % 37) + '.' + i);
  const P = 7;
  let each = true; const per = new Array(P).fill(0);
  for (const id of ids) { let c = 0; for (let d = 0; d < P; d++) if (E._t1226LookDay(id, P) === d % P) c++; if (c !== 1) each = false; per[E._t1226LookDay(id, P)]++; }
  ok(each, '사람마다 7날에 꼭 한 번 본다');
  ok(Math.max(...per) < ids.length / P * 1.4 && Math.min(...per) > ids.length / P * 0.6, '보는 날이 한날에 몰리지 않는다(날마다 400 ÷ 7 ± 40%)', per.join(','));
  ok(E._t1226Net(2, 1, 30, 30, 0) < E._t1226Net(2, 1, 30, 30, 30) && E._t1226Net(2, 1, 30, 30, 30) < E._t1226Net(2, 1, 30, 30, 300), '막 바꾼 사람일수록 문턱이 높고 시간이 지나며 낮아진다(반감기 30날)');
  ok(Math.abs(E._t1226Net(2, 1, 1e20, 10, 30) - ((2 - 1) * 10 * 0.5 - 1 * E.T1226_SWITCH_DAYS)) < 1e-6 && E._t1226Net(9, 1, 1e20, 100, 0) === -1 * E.T1226_SWITCH_DAYS, '30날 지난 사람 — 얻는 것 × ½ − 지금 값 × 하루 · 막 바꾼 사람은 얻는 것 0(곧바로 못 되돌아간다)');
  ok(E._t1226Net(2, 1, 30, 1, 1e9) < 0 && E._t1226Net(2, 1, 30, 100, 1e9) > 0, '값이 이어진 날이 짧으면(D 1) 못 넘고 길면(D 100) 넘는다');
  ok(E._t1226In(2, 4, 1) === 2 * 4 / 5 && E._t1226Out(2, 4, 1) === 2 * 4 / 3 && E._t1226In(2, 4, 0) === 2, '이미 옮긴 수 — 갈 일 1인당 몫 × n ÷ (n + 들어옴) · 떠난 일 × n ÷ (n − 나감)');
  {
    const src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
    const fx = src.slice(src.indexOf('function t1226Flex('), src.indexOf('// ★[T1226] 전환 보류 문의 가치표'));
    ok(/_t1226In\(vt0, ne1\(t\), mvIn\[t\]\)/.test(fx) && /_t1226Out\(vc0, ne1\(c\), mvOut\[c\]\)/.test(fx) && /mvOut\[c\] = \(mvOut\[c\] \|\| 0\) \+ 1; mvIn\[pickJob\] = \(mvIn\[pickJob\] \|\| 0\) \+ 1;/.test(fx), '켬 전환이 옮길 때마다 그 수를 적고 다음 사람 값에 쓴다');
  }
  // 이미 옮긴 수 — 켬 판 실제 하루: 보는 사람 전원(간격 1)이어도 다 옮기지 않는다
  ON();
  const T = mk(40, { fertility: 2.5, water: 0.2, game: 0.2 });
  T.W.autoSwitchInterval = 1;
  run(T, 1, 60);
  const st = T.v._t1226 || {};
  const pin = Object.values(st.pin || {}).reduce((a, b) => a + b, 0);
  ok(st.pin != null && pin > 0 && pin < 40, '옮긴 수 장부가 서고 반감기 30날로 줄며 센다(60날 · 40명)', pin.toFixed(2));
  OFF();
}

console.log('\n=== ⑥ 굶을 때 — 노동 목표 안 장인은 안 빠진다 ===');
{
  ON();
  const T = mk(20, { fertility: 1.5 });
  run(T, 1, 5);
  const v = T.v;
  const m = v.npcs.find((x) => x.currentJob !== 'farmer');
  E._switchNPCJobForTest(m, 'mason', -100, v);
  for (const k of Object.keys(v.storage)) if (/food|fish|meat|grain|wheat|rice|barley|vegetable|cooked/.test(k)) v.storage[k] = 0;
  T.W.autoSwitchInterval = 1;
  const w1 = () => 1;
  const inTarget = (v.counts.mason || 0) <= E.masonTarget(v);
  run(T, 6, 12);
  ok(!inTarget || m.currentJob === 'mason', '석공(노동 목표 안 · 값 50 × 숙련) — 굶주린 7날 동안 그대로', `${m.currentJob} · 목표 ${E.masonTarget(v)} · 지금 ${v.counts.mason || 0}`);
  ok(E.opportunityCost(m, v, w1) >= 50 || !inTarget, '그 사람의 지금 값(opportunityCost) = 50 × 숙련 배수');
  OFF();
}

console.log('\n=== ⑦ 작은 마을 — 문턱이 높다 ===');
{
  ok(E._t1226Net(2, 1, 4, 30, 1e9) < E._t1226Net(2, 1, 36, 30, 1e9), '같은 값 · 같은 D — 4명 마을의 몫 < 36명 마을(불확실 몫 = 두 값 합 ÷ √N)');
  ok(E._t1226Net(2.5, 1, 4, 100, 1e9) < 0 && E._t1226Net(2.5, 1, 100, 100, 1e9) > 0, '값 2.5 배 차이 — 4명은 못 넘고 100명은 넘는다');
}

console.log('\n=== ⑧ 촌장이 맡긴 사람 · ⑨ 징발 ===');
{
  ON();
  const T = mk(24, { fertility: 2.5, water: 0.1, game: 0.1, wood: 0.1 });
  T.W.autoSwitchInterval = 1;
  run(T, 1, 3);
  const v = T.v;
  const a = v.npcs.find((x) => x.currentJob !== 'farmer');
  const b = v.npcs.find((x) => x !== a && x.currentJob !== 'farmer');
  const r = E.assignNPCJob(v, a, 'miner', 3);
  const aj = a.currentJob;
  b._warDraft = 1; v.counts[b.currentJob]--; const bj = b.currentJob;
  const d0 = E._t1226Stat.draft;
  run(T, 4, 20);
  ok(r.ok && a.currentJob === aj && a._chiefAssignDay === 3, '맡긴 사람(광부) — 17날 동안 자율 전환에서 빠짐', `${r.ok} ${aj}→${a.currentJob}`);
  ok(b.currentJob === bj && E._t1226Stat.draft > d0, '징발된 사람 — 보는 사람에서 빠지고 직업 그대로', `${bj}→${b.currentJob} · 빠진 날 ${E._t1226Stat.draft - d0}`);
  delete b._warDraft; v.counts[b.currentJob]++;
  ok(b.currentJob === bj && b.lastJobChangeDay !== T.W.day, '돌아오면 원래 직업 — 바꾼 적 없음(비용 0)');
  OFF();
}

console.log('\n=== ⑩ 몸 — 직업만 바뀌고 몸은 제자리 · 짐은 곳간 길에서 ===');
{
  const V = R('server/villages');
  const players = new Map(), bcast = []; let pid = 1;
  const deps = { players, npcs: new Set(), broadcast: (m) => bcast.push(m),
    spawnNpc: (q) => { const id = 'b' + (pid++); const p = { pid: id, x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, inventory: {}, npcHomeX: q.npcHomeX, npcHomeY: q.npcHomeY }; players.set(id, p); return p; },
    isTerrainBlockedLocal: () => false, moveSpeed: 64, corpseMs: 300000, deathDrop: () => 0 };
  const e = E.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 4, name: '몸촌' });
  const SZ = 32;
  const vil = { dbId: 1, name: '몸촌', ccx: 200, ccy: 200, econ: e, npcPids: [], housesPx: [0, 1, 2, 3].map((i) => ({ x: (194 + i * 4) * SZ + 16, y: 208 * SZ + 16 })), _maxRPx: 40 * SZ };
  let H = null;
  try { H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: [vil], byDbId: new Map([[1, vil]]), byEcon: new Map([[e, vil]]), world: { day: 400, seed: 7 }, routeCache: new Map(), _route: null, _distCtx: null }); } catch (er) { H = null; }
  if (H && H.syncVillagePop) {
    quiet(() => { H.syncVillagePop(vil, Infinity); H.syncVillageJobs(vil); });
    const bodies = vil.npcPids.map((id) => players.get(id)).filter(Boolean);
    for (const b of bodies) b.inventory.wood = 3;
    const was = new Map(bodies.map((b) => [b.pid, [b.simJob, b.x, b.y]]));
    const q = e.npcs[0], from = q.currentJob, to = from === 'farmer' ? 'fisher' : 'farmer';
    const nTo = bodies.filter((b) => b.simJob === to).length;
    E._switchNPCJobForTest(q, to, 401, e);
    quiet(() => H.syncVillageJobs(vil));
    const ch = bodies.filter((b) => was.get(b.pid)[0] !== b.simJob);
    ok(bodies.length === e.npcs.length && ch.length === 1 && ch[0].simJob === to && bodies.filter((b) => b.simJob === to).length === nTo + 1, `한 사람이 ${from} → ${to} — 몸 하나의 직업이 그날 따라간다`, `${ch.length} · ${ch[0] && ch[0].simJob}`);
    ok(ch.length === 1 && ch[0].x === was.get(ch[0].pid)[1] && ch[0].y === was.get(ch[0].pid)[2], '그 몸은 제자리(순간이동 0 — 새 일터로는 걸어간다)');
    ok(ch.length === 1 && ch[0].inventory.wood === 3, '손짐(옛 일 통나무)은 그대로 — 곳간 길에서 내린다');
  } else ok(false, '호스트 묶기 실패');
  const src = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const gs = src.indexOf('function _lifeGranStep('), g = src.slice(gs, src.indexOf('\n}\n', gs));
  ok(g.length > 200 && !/simJob|currentJob/.test(g) && /_handSet\(npc, 0\)/.test(g) && /inventory\.wood/.test(g), '곳간 내리기(`_lifeGranStep`)는 직업을 안 묻고 손 · 통나무 · 원석 · 돌을 다 내린다(바꾼 날 땅거미 길 = 바꾸는 시간 하루)');
}

console.log('\n=== ⑪ 멈춤 규칙 — 켬 값은 잠재 산출을 접는다 ===');
{
  const mkv = () => { const v = { dailyProductionBuf: { food: 1 }, _t1226Pot: { food: 4 }, _allocEma: { food: 4 }, _allocDay: 9 }; return v; };
  const ctx = (n) => ({ period: 100, counts: { farmer: n }, w: () => 1, JOBS: E.JOBS, forageYields: () => null });
  ON();
  const a = mkv(); const ra = E.allocRealCandidates(a, { day: 10 }, [['farmer', 1]], ctx(2));
  const b = mkv(); b.dailyProductionBuf = { food: 0.25 }; const rb = E.allocRealCandidates(b, { day: 10 }, [['farmer', 1]], ctx(2));
  ok(ra && rb && Math.abs(ra[0][1] - rb[0][1]) < 1e-12 && Math.abs(a._allocEma.food - 4) < 1e-12, '실현이 1 → 0.25(일찍 쉼)여도 켬 값 같음 — 잠재 4 를 접는다', ra && ra[0][1].toFixed(3));
  const c = mkv(); E.allocRealCandidates(c, { day: 10 }, [['farmer', 1]], ctx(2)); const e1 = c._allocEma.food; E.allocRealCandidates(c, { day: 10 }, [['farmer', 1]], ctx(2));
  ok(c._allocEma.food === e1, '같은 날 두 번 불러도 한 번만 접는다(값 표 · 피커가 같은 EMA)');
  OFF();
  const d = mkv(); E.allocRealCandidates(d, { day: 10 }, [['farmer', 1]], ctx(2));
  ok(Math.abs(d._allocEma.food - (4 * (1 - 1 / 100) + 1 * (1 / 100))) < 1e-12, '끔 = 종전(실현 버퍼를 접는다)', d._allocEma.food.toFixed(4));
}

console.log('\n=== ⑫ 결정론 · 마을 차례 ===');
{
  const o = { counts: { farmer: 5 }, _t1226F0: 3, _t1226F0d: 50 };
  ok(E._t1226FarmersOf(o, 50) === 3 && E._t1226FarmersOf(o, 51) === 5, '이웃 농부 수 — 그날 틱을 돈 마을은 틱 머리 값 · 아직 안 돈 마을은 지금 값(= 그날 머리)');
  ON();
  const A = mk(18, { fertility: 2, water: 0.3 }, '차촌가'), B = mk(18, { fertility: 0.3, water: 2.5 }, '차촌나');
  // 옮김이 생기게 — 두 마을 다 땅과 거꾸로 시작(A 는 어부 · B 는 농부로 몰아 둔다 · 식량 일끼리라 곳간 길 문은 안 막는다)
  for (const p of A.v.npcs) if (p.currentJob === 'farmer') E._switchNPCJobForTest(p, 'fisher', -100, A.v);
  for (const p of B.v.npcs) if (p.currentJob === 'fisher') E._switchNPCJobForTest(p, 'farmer', -100, B.v);
  const W = { villages: [A.v, B.v], picker: 'rational', day: 0, tradeLog: [], events: [], caravans: [], infoRange: 1e9 };
  A.v._world = W; B.v._world = W; W.autoSwitchInterval = 1;
  const T = { W };
  run(T, 1, 30);
  const keys = ['_t1226', '_allocEma', '_allocDay', '_t1226NE', 'counts'];
  const save = () => W.villages.map((v) => ({ k: JSON.stringify(keys.map((k) => v[k])), p: v.npcs.map((p) => [p.currentJob, p.lastJobChangeDay]) }));
  const load = (s) => W.villages.forEach((v, i) => { const x = JSON.parse(s[i].k); keys.forEach((k, j) => { v[k] = x[j]; }); v.npcs.forEach((p, j) => { p.currentJob = s[i].p[j][0]; p.lastJobChangeDay = s[i].p[j][1]; }); });
  let same = 0, moved = 0;
  for (let d = 31; d <= 60; d++) {
    // 그날 틱(생산 · 시세 · 출생)은 한 번 · 7) 전환만 빼고(종전 간격을 못 닿게) — 그다음 켬 전환만 두 차례로
    W.day = d; OFF(); W.autoSwitchInterval = 1e9;
    const f0 = W.villages.map((v) => v.counts.farmer || 0);
    quiet(() => { for (const v of W.villages) E.tickVillage(v, d); });
    W.autoSwitchInterval = 1; ON();
    W.villages.forEach((v, i) => { v._t1226F0 = f0[i]; v._t1226F0d = d; });   // 틱 머리(tickVillage 첫 줄) 그대로
    const s0 = save(), before = jobsOf(A.v) + '|' + jobsOf(B.v);
    quiet(() => { E.t1226Flex(A.v, d, W, 1, 1); E.t1226Flex(B.v, d, W, 1, 1); });
    const r1 = jobsOf(A.v) + '|' + jobsOf(B.v); const s1 = save();
    load(s0);
    quiet(() => { E.t1226Flex(B.v, d, W, 1, 1); E.t1226Flex(A.v, d, W, 1, 1); });
    const r2 = jobsOf(A.v) + '|' + jobsOf(B.v);
    if (r1 === r2) same++;
    if (r1 !== before) moved++;
    load(s1);
  }
  ok(same === 30 && moved > 0, '마을 차례를 뒤집어도 같은 사람이 같은 일로(30날 · 옮김이 있던 날이 있어야 자명 통과 아님)', `${same}/30 · 옮김 있던 날 ${moved}`);
  OFF();
}

console.log('\n=== ⑬ 성능 — 마을 하루 µs ===');
{
  ON();
  const T = mk(60, { fertility: 1.5 });
  run(T, 1, 40);
  const v = T.v, W = T.W;
  const t0 = process.hrtime.bigint(); let k = 0;
  quiet(() => { for (let d = 41; d <= 140; d++) { W.day = d; E.t1226Flex(v, d, W, 7, 1); k++; } });
  const us = Number(process.hrtime.bigint() - t0) / 1e3 / k;
  OFF();
  const t1 = process.hrtime.bigint(); let m = 0;
  quiet(() => { for (let d = 141; d <= 240; d++) { W.day = d; E._autoSwitchJobForTest(v, d, W); m++; } });
  const us0 = Number(process.hrtime.bigint() - t1) / 1e3 / m;
  console.log(`    표: 켬 마을 하루 ${us.toFixed(1)} µs(60명 · 피커 + 값 표 · 보는 사람 ≈ 60 ÷ 7) · 종전 전환일 하루 ${us0.toFixed(1)} µs(7날에 한 번)`);
  ok(us < Math.max(2000, us0 * 50), '켬 마을 하루 < 2 ms(또는 종전 전환일의 50배)', `${us.toFixed(1)} µs`);
}

console.log('\n=== ⑭ 끔 = 종전 ===');
{
  const src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
  ok(/if \(t1226On\(\)\) t1226Flex\(v, day, v\._world, switchInterval, multiSwitch\);[^\n]*\n  else if \(day % switchInterval === 0\) \{\n    for \(let i = 0; i < multiSwitch; i\+\+\) autoSwitchJob\(v, day, v\._world\);/.test(src), '7) 줄 — 끔이면 종전 전환일 줄 그대로');
  OFF();
  const a = mk(16, { fertility: 1.3 }, '끔촌'); run(a, 1, 80); const ja = jobsOf(a.v);
  process.env.T1226_JOB_FLEX = '0';
  const b = mk(16, { fertility: 1.3 }, '끔촌');
  run(b, 1, 80);
  const jb = b.v.npcs.map((p) => p.currentJob).join(), ja2 = a.v.npcs.map((p) => p.currentJob).join();
  ok(ja2 === jb && !b.v._t1226 && !b.v._t1226NE && !b.v._t1226Pot, '미설정 판 = `=0` 판(같은 직업 열 · 켬 칸 0)', `${ja2 === jb}`);
  OFF();
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);

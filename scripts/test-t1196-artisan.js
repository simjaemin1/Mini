#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1196-artisan.js — 장인 작업장(`T1196_ARTISAN_ACT` · T1196 · 2026-11-06 · 추상 걷기 B) ==========================
//
// 판정 사본 0: econ 은 `sim/economy-sim.js` · `sim/economy-sim-v2.js` 를 그대로 부르고, 몸 문은 `server/villages.js` `__p3Bind` 가 내보낸 운영 함수(`_t1196Step` · `_t1196Seats`)를 부른다.
// 지키는 것:
//   ⓪ 글자 — 손잡이 한 줄 · 장인 다섯 표 = 몸 쪽 창 표 · 갈래 감싸기(try/finally) 하나 · 하루 머리 한 줄 · 곳간 문(`artisanTake` · `artisanGive`)을 부르는 곳은 몸 걸음 하나 ·
//      무기장 갈래에 곳간 · 산출 글자 0(걷었다 · 빈 갈래) · 몸 칸 둘이 `_t671Shape` 에
//   ① 작업표 — 갈래가 곳간 · 금고에 낸 차가 작업표가 되고 곳간은 바이트 그대로 되돌아간다 · 예약(같은 날 다음 갈래는 예약을 뺀 곳간을 본다) ·
//      자리 하나 = 작업표 하나 · 만들 것 없는 갈래는 자리를 돌려준다 · 꺼내기(있는 만큼 · 비율) · 넣기(든 비율 그대로 · 금고 몫) · 하루 머리 일괄 · 늦음 · 로트 장부 멈춤 짝
//   ② 랩(호스트 없음) — 켬 · 끔 120날 곳간 바이트 같음 · 서버 호스트 + 빈 몸 자리 0 = 호스트 없음(종전 수식 · T1180 셋 끔)
//   ③ 서버 호스트 + 빈 몸 자리(몸이 날마다 바로 꺼내 넣는 판) — 작업표가 서고 몸이 다 넣는다 · 산출 다섯이 수식 판과 같은 자릿수
//   ④ 몸 걸음 — 곳간 사다리(인출 · 머묾) → 작업 자리(시설 있으면 그 앞 · 없으면 회관 앵커) → 제작(정본 시간) → 곳간(저장) · 곳간은 꺼낼 때 · 넣을 때만 움직인다
//   ⑤ 명부 — 빈 몸만 자리 · 손에 든 몸은 자리 밖 · 몸을 잃은 작업표는 주인을 지운다(다른 몸이 잇는다)
'use strict';
const path = require('path'), fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const ROLE = process.argv[2];
const mute = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };

// ── 자식: econ 판(②③) ─────────────────────────────────────────────────────────
if (ROLE === '--econ') {
  const E = require(path.join(ROOT, 'sim', 'economy-sim')), V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const mode = process.argv[3], days = +process.argv[4] || 120;
  const w = mute(() => V2.createWorldV2({ seed: 7, villageCount: 8, picker: 'rational' }));
  if (mode !== 'lab') E.bindProductionActs(w);
  const ART = ['mason', 'smith', 'armorsmith', 'tailor', 'cook'], OUT = ['tool', 'weapon', 'armor', 'clothes', 'cooked_food'];
  let made = 0, give = 0;
  for (let d = 0; d < days; d++) {
    if (mode === 'body') for (const v of w.villages) { const S = {}; for (const j of ART) S[j] = (v.counts && v.counts[j]) || 0; v._t1196Seats = S; }
    mute(() => V2.tickWorldV2(w));
    if (mode === 'body') for (const v of w.villages) for (const t of (v._t1196Q || []).slice()) { if (t.st === 0) { made++; E.artisanTake(v, t.id); } if (E.artisanGive(v, t.id)) give++; }
  }
  const out = {}; for (const k of OUT) out[k] = 0; let pop = 0, q = 0, C = { made: 0, body: 0, batch: 0, late: 0, short: 0 };
  for (const v of w.villages) { pop += v.npcs.length; for (const k of OUT) out[k] += v.storage[k] || 0; q += (v._t1196Q || []).length; if (v._t1196C) for (const k in C) C[k] += v._t1196C[k] || 0; }
  const fp = require('crypto').createHash('sha1').update(JSON.stringify(w.villages.map((v) => [v.npcs.length, v.storage, v.treasury]))).digest('hex').slice(0, 16);
  process.stdout.write('@@' + JSON.stringify({ fp, pop, out, made, give, q, C }) + '\n');
  process.exit(0);
}

// ── 부모 ──────────────────────────────────────────────────────────────────────
const child = (args, env) => {
  const r = spawnSync(process.execPath, [__filename, ...args], { encoding: 'utf8', env: Object.assign({}, process.env, env || {}), timeout: 600000, maxBuffer: 1 << 26 });
  const line = ((r.stdout || '') + '').split('\n').find((l) => l.startsWith('@@'));
  return line ? JSON.parse(line.slice(2)) : { err: ((r.stderr || '') + (r.stdout || '')).slice(-800) };
};
console.log('\n=== T1196 장인 작업장 — sim/economy-sim.js `T1196_ARTISAN_ACT` · server/villages.js `_t1196Step` ===');
const Ssrc = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const Vsrc = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const Zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
{
  const knob = Ssrc.match(/^const T1196_ARTISAN_ACT = \(typeof process !== 'undefined' && process\.env && process\.env\.T1196_ARTISAN_ACT !== '0'\);$/gm) || [];
  const set = (Ssrc.match(/^const T1196_SET = \{ ([^}]*) \};$/m) || [])[1] || '';
  const kind = (Vsrc.match(/^const T1196_KIND = \{ ([^}]*) \};/m) || [])[1] || '';
  const keys = (t) => [...t.matchAll(/([a-z]+):/g)].map((m) => m[1]).sort().join(',');
  const wrap = (Ssrc.match(/\n    try \{\n    if \(jdef\.produceSpecial === 'forager'\) \{/g) || []).length, fin = (Ssrc.match(/\} finally \{ if \(_t1196S\) _t1196End\(v, npc, _t1196S, day\); \}/g) || []).length;
  const head = (Ssrc.match(/if \(T1196_ARTISAN_ACT && v\._t1196Q && v\._t1196Q\.length\) \{ _t1196Day\(v, day\); _t1196Hide\(v\); \}/g) || []).length, V2src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8'), tail = (V2src.match(/tickSubsistence\(v, world\.day\);\n      if \(v1\.T1196_ARTISAN_ACT && v\._t1196H\) v1\.t1196Unhide\(v\);/g) || []).length;
  ok(knob.length === 1 && keys(set) === 'armorsmith,cook,mason,smith,tailor' && keys(set) === keys(kind) && wrap === 1 && fin === 1 && head === 1 && tail === 1,
    '⓪ 손잡이 한 줄(`!== \'0\'` · 번들 안전) · 장인 다섯 = 몸 창 표 · 갈래 감싸기 하나 · 마을 틱 머리(일괄 · 비켜 둠) 한 줄 · 마을 하루 꼬리(되돌림 · 먹기 뒤 썩기 앞) 한 줄', `다섯 ${keys(set)} · 창 ${keys(kind)} · 감싸기 ${wrap}/${fin} · 머리 ${head} · 꼬리 ${tail}`);
  const callers = [...Vsrc.matchAll(/\.artisan(Take|Give)\(/g)].map((m) => Vsrc.slice(0, m.index).lastIndexOf('\nfunction ')).map((i) => Vsrc.slice(i + 10, Vsrc.indexOf('(', i + 10)));
  const zoneUse = (Zsrc.match(/artisan(Take|Give)\(/g) || []).length;
  ok(callers.length >= 3 && callers.every((f) => f === '_t1196Step') && zoneUse === 0, '⓪ 곳간 문(`artisanTake` · `artisanGive`)을 부르는 곳 = 몸 걸음 하나(`_t1196Step`)', `${callers.length}곳 · ${[...new Set(callers)].join(',')}`);
  const i = Ssrc.indexOf("    } else if (jdef.produceSpecial === 'weaponsmith') {"), j = Ssrc.indexOf("    } else if (jdef.produceSpecial === 'tailor') {", i);
  const wb = i > 0 && j > i ? Ssrc.slice(i, j).replace(/\/\/.*$/gm, '') : null;
  ok(wb != null && !/addProduce|v\.storage|workNPC/.test(wb.split('\n').slice(1).join('\n')), '⓪ 무기장 갈래 — 곳간 · 산출 · 숙련 글자 0(셈 밖 잔존 코드를 걷었다 · 빈 갈래로 남아 범용 갈래가 공짜 무기를 안 낸다)', wb ? `${wb.split('\n').length}줄` : '못 찾음');
  const shape = Zsrc.indexOf('function _t671Shape(p) {'), shapeEnd = Zsrc.indexOf('\n}\n', shape), sh = Zsrc.slice(shape, shapeEnd);
  ok(/p\._t1196J = undefined/.test(sh) && /p\._t1196W = undefined/.test(sh) && /facilityNear: \(kind, x, y, r\) => \{ const ty = Facility\.KIND_TYPES\[kind\]/.test(Zsrc), '⓪ 몸 칸 둘(`_t1196J` · `_t1196W`)이 `_t671Shape` 에 · 작업 자리 = 존 시설 목록(`Facility.KIND_TYPES` · 정본 창 표)');
  ok(/function _lifeHandsIn\(vil\) \{\n(?:  _t1195HuntIn\(vil\);[^\n]*\n)?  _t1196Seats\(vil\);/.test(Vsrc),   /* ★[PM land1049] T1195 사냥 입고 줄이 맨 앞에 설 수 있다(두 가지 합침 · 둘 다 econ 틱 앞) */ '⓪ 명부는 econ 틱 앞(`_lifeHandsIn` 머리) 한 줄');
}

// ① 작업표 — 운영 문 그대로(`__t1196`)
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim')), T = E.__t1196;
  let pauses = [];
  const W = { lotsPause: (on) => pauses.push(on) };
  E.bindProductionActs(W);
  const v = { storage: { stone: 10, food: 5 }, treasury: { food: 1 }, _world: W, _t1196Seats: { mason: 1, cook: 1 } };
  const st0 = JSON.stringify(v.storage), tr0 = JSON.stringify(v.treasury);
  const S = T.begin(v, 'mason', 7);
  v.storage.stone -= 2; v.storage.tool = 0.9; v.treasury.tool = 0.1;          // 갈래 흉내 — 돌 2 → 도구 0.9(+ 세금 0.1)
  T.end(v, { currentJob: 'mason' }, S, 7);
  const t = (v._t1196Q || [])[0];
  const hid = JSON.stringify(v._t1196H), mid = v.storage.stone;
  ok(S && mid === 8 && hid === '{"stone":2}' && !('tool' in v.storage) && JSON.stringify(v.treasury) === tr0 && t && t.take.stone === 2 && t.give.tool === 0.9 && t.tre.tool === 0.1 && v._t1196R.stone === 2,
    '① 갈래가 낸 차 = 작업표(돌 2 · 도구 0.9 · 금고 0.1) · 산출 · 금고는 바로 되돌아가고 재료(돌 2)는 그날 틱 동안 비켜 둔다 · 예약 돌 2', `틱 안 ${JSON.stringify(v.storage)} · 비켜 둠 ${hid}`);
  ok(T.begin(v, 'mason', 7) === null, '① 자리 하나 = 작업표 하나(석공 자리 1 이 찼다 — 둘째 석공은 종전 수식 = 일괄)');
  const S2 = T.begin(v, 'cook', 7), seen = v.storage.stone;
  T.end(v, { currentJob: 'cook' }, S2, 7);
  E.t1196Unhide(v);
  ok(seen === 8 && JSON.stringify(v.storage) === st0 && !v._t1196H && (v._t1196Used.cook | 0) === 0 && v._t1196Q.length === 1, '① 같은 날 다음 갈래(그날 틱의 다른 쓰임도)는 비켜 둔 곳간을 본다(돌 8) · 만들 것 없는 갈래는 자리를 돌려준다 · 마을 하루 꼬리에 곳간은 바이트 그대로', `본 돌 ${seen} · 꼬리 ${JSON.stringify(v.storage)}`);
  ok(pauses.length === 6 && pauses.join() === 'true,false,true,false,true,false', '① 로트 장부 멈춤 짝(떼기 · 비켜 둠 · 되돌림 동안만 · 열고 닫음)', pauses.join());
  v.storage.stone = 1;
  const f = E.artisanTake(v, t.id);
  ok(f === 0.5 && v.storage.stone === 0 && !('stone' in (v._t1196R || {})) && t.st === 1, '① 꺼내기 — 있는 만큼(돌 1 / 2 = 비율 0.5) · 곳간에서 그만큼 · 예약 풀림', `비율 ${f}`);
  const g = E.artisanGive(v, t.id);
  ok(g && v.storage.tool === 0.45 && Math.abs(v.treasury.tool - 0.05) < 1e-12 && v._t1196Q.length === 0 && v._t1196C.body === 1 && v._t1196C.short === 1, '① 넣기 — 든 비율 그대로(도구 0.45 · 금고 0.05) · 작업표 지움 · 몸 1 · 모자람 1', `도구 ${v.storage.tool}`);
  ok(E.artisanGive(v, t.id) === false && E.artisanTake(v, 999) === -1, '① 없는 작업표 · 두 번 넣기는 아무것도 안 한다');
  // 하루 머리 — 안 집어 간 작업표 = 일괄 · 손에 든 지 사흘 넘음 = 늦음
  v.storage.stone = 10; v._t1196UsedDay = -1;
  const S3 = T.begin(v, 'mason', 8); v.storage.stone -= 2; v.storage.tool = (v.storage.tool || 0) + 0.9; T.end(v, { currentJob: 'mason' }, S3, 8);
  T.day(v, 8);
  const keep = v._t1196Q.length;
  T.day(v, 9);
  ok(keep === 1 && v._t1196Q.length === 0 && v.storage.stone === 8 && Math.abs(v.storage.tool - 1.35) < 1e-12 && v._t1196C.batch === 1, '① 하루 머리 — 그날은 기다리고 · 이튿날 몸이 안 집어 간 작업표는 일괄로(곳간 돌 8 · 도구 +0.9)', `돌 ${v.storage.stone} · 도구 ${v.storage.tool}`);
  v._t1196UsedDay = -1; const S4 = T.begin(v, 'mason', 9); v.storage.stone -= 2; v.storage.tool += 0.9; T.end(v, { currentJob: 'mason' }, S4, 9);
  const t4 = v._t1196Q[0]; E.artisanTake(v, t4.id); T.day(v, 12); const k12 = v._t1196Q.length; T.day(v, 13);
  ok(k12 === 1 && v._t1196Q.length === 0 && v._t1196C.late === 1 && v.storage.stone === 6, '① 손에 든 작업표는 사흘 기다린다 · 넘으면 손의 재료로 마친다(늦음 1 — 몸을 잃었을 때)', `늦음 ${v._t1196C.late}`);
}

// ①′ 꺼내기 비율 — 레시피마다 "없으면 못 만드는" 재료로 잰다(요리 곁재료 · 갑옷 보조 = 있는 만큼 · 재봉 옷감 = 보온 합)
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  const mk = (job, take, storage) => { const v = { storage: Object.assign({}, storage), treasury: {}, _t1196Q: [{ id: 1, job, day: 1, take, give: { x: 1 }, tre: {}, st: 0, f: 0, pid: null }] }; const f = E.artisanTake(v, 1); return { f, v }; };
  const c = mk('cook', { food: 1, fruit: 0.5, meat: 0.5 }, { food: 1, fruit: 0, meat: 0.5 });
  const a1 = mk('armorsmith', { stone: 0.5, hide: 0.4, ore: 0.2, hemp: 0.1, fur: 0.1 }, { stone: 1, hide: 1, ore: 1, hemp: 1, fur: 0 });
  const a2 = mk('armorsmith', { stone: 0.5, hide: 0.4, ore: 0.2 }, { stone: 1, hide: 0.2, ore: 1 });
  const t = mk('tailor', { hemp: 2, fur: 1 }, { hemp: 2, fur: 0 });
  const m = mk('mason', { stone: 2 }, { stone: 0.5 });
  ok(c.f === 1 && c.v.storage.food === 0 && c.v.storage.meat === 0 && a1.f === 1 && a1.v.storage.fur === 0 && a2.f === 0.5 && Math.abs(t.f - 1.2 / 2.7) < 1e-12 && t.v.storage.hemp === 0 && m.f === 0.25,
    '①′ 비율 — 요리 곁재료 없어도 1 · 갑옷 보조(모피) 없어도 1 · 갑옷 본재료(가죽 반) 0.5 · 재봉 = 있는 보온 ÷ 든 보온(0.444) · 석공 = 가장 모자란 재료(0.25)', `요리 ${c.f} · 갑옷 ${a1.f}/${a2.f} · 재봉 ${t.f.toFixed(3)} · 석공 ${m.f}`);
}
// ② 랩 · 끔 바이트
{
  const lab1 = child(['--econ', 'lab', '120'], { T1196_ARTISAN_ACT: '1' }), lab0 = child(['--econ', 'lab', '120'], { T1196_ARTISAN_ACT: '0' });
  ok(!lab1.err && !lab0.err && lab1.fp === lab0.fp && lab1.made === 0 && lab1.q === 0, '② 랩(호스트 없음) — 켬 · 끔 120날 곳간 · 금고 · 인구 바이트 같음 · 작업표 0', lab1.err || lab0.err || `${lab1.fp} · 인구 ${lab1.pop}`);
  const off = { T312_FISH_ACT: '0', T325_WOOD_ACT: '0', T347_FORAGE_ACT: '0', T1188_ORE_SPLIT: '0', T1192_FISH_SPECIES: '0' };
  const host = child(['--econ', 'host', '120'], Object.assign({ T1196_ARTISAN_ACT: '1' }, off)), labOff = child(['--econ', 'lab', '120'], Object.assign({ T1196_ARTISAN_ACT: '1' }, off));
  ok(!host.err && !labOff.err && host.fp === labOff.fp && host.q === 0, '② 서버 호스트 + 빈 몸 자리 없음 = 호스트 없음(종전 수식 그대로 · 생산 셋 끔 판)', host.err || labOff.err || `${host.fp} · ${labOff.fp}`);
  // ③ 서버 호스트 + 빈 몸 자리 = 장인 수(몸이 날마다 바로 꺼내 넣는다)
  const body = child(['--econ', 'body', '120'], Object.assign({ T1196_ARTISAN_ACT: '1' }, off));
  const ratio = (k) => (labOff.out[k] > 0 ? body.out[k] / labOff.out[k] : (body.out[k] > 0 ? Infinity : 1));
  const R = ['tool', 'weapon', 'clothes'].map((k) => ratio(k));
  ok(!body.err && body.made > 50 && body.give === body.made && body.q === 0 && body.C.body === body.made, '③ 작업표가 선다 · 몸이 다 넣는다(꺼낸 수 = 넣은 수 · 남은 작업표 0)', body.err || `작업표 ${body.made} · 넣음 ${body.give} · 모자람 ${body.C.short}`);
  ok(!body.err && R.every((r) => r > 0.5 && r < 2) && body.pop / labOff.pop > 0.75 && body.pop / labOff.pop < 1.33, '③ 산출(도구 · 무기 · 옷) ×0.5 ~ 2 · 인구 ×0.75 ~ 1.33 — 수식 판과 같은 자릿수(8마을 한 시드 판의 잡음 폭 · 곳간이 몸 손을 거쳐 든다)',
    body.err || `도구 ${body.out.tool.toFixed(1)}/${labOff.out.tool.toFixed(1)} · 무기 ${body.out.weapon.toFixed(1)}/${labOff.out.weapon.toFixed(1)} · 옷 ${body.out.clothes.toFixed(1)}/${labOff.out.clothes.toFixed(1)} · 인구 ${body.pop}/${labOff.pop}`);
}

// ④ ⑤ 몸 걸음 · 명부 — 운영 문(`__p3Bind`)
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const players = new Map();
  let fac = null;
  const H = V.__p3Bind({ deps: { players, broadcast: () => {}, facilityNear: () => fac }, world: { day: 3 } });
  const W = {}; E.bindProductionActs(W);
  const SZ = 32;
  const mkVil = () => ({ dbId: 5, name: '시험', ccx: 20, ccy: 20, npcPids: ['b1', 'b2'], _granList: [{ cx: 24, cy: 20 }], econ: { storage: { stone: 10 }, treasury: {}, _world: W, counts: { mason: 2 } } });
  const run = (vil, b, steps) => {
    let now = 1e6; const lab = [], st = [];
    for (let i = 0; i < steps; i++) {
      const r = H._t1196Step(vil, b, now, 'mason');
      if (r === null) break;
      if (b._lifeAct && lab[lab.length - 1] !== b._lifeAct) lab.push(b._lifeAct);
      st.push(vil.econ.storage.stone);
      if (b.targetX != null) { b.x = b.targetX; b.y = b.targetY; }
      now += 1000;
    }
    return { lab, st, now };
  };
  const vil = mkVil();
  const b1 = { pid: 'b1', simJob: 'mason', simVillageId: 5, x: 0, y: 0 }, b2 = { pid: 'b2', simJob: 'mason', simVillageId: 5, x: 0, y: 0 };
  players.set('b1', b1); players.set('b2', b2);
  vil.econ._t1196Q = [{ id: 1, job: 'mason', day: 3, take: { stone: 2 }, give: { tool: 0.9 }, tre: { tool: 0.1 }, st: 0, f: 0, pid: null }];
  vil.econ._t1196R = { stone: 2 };
  H._t1196Seats(vil);
  const seats0 = JSON.stringify(vil.econ._t1196Seats);
  const r1 = run(vil, b1, 400);
  const tool = vil.econ.storage.tool;
  const firstDrop = r1.st.findIndex((x) => x === 8);
  ok(seats0 === '{"mason":2}' && r1.lab.join('>') === '인출>운반>제작>운반>저장' && tool === 0.9 && vil.econ.storage.stone === 8 && !vil.econ._t1196Q.length,
    '④ 몸 걸음 — 인출(사다리 머묾) > 운반 > 제작 > 운반 > 저장 · 곳간은 꺼낼 때(돌 −2) · 넣을 때(도구 +0.9)만', `${r1.lab.join('>')} · 돌 ${vil.econ.storage.stone} · 도구 ${tool} · 첫 감소 ${firstDrop}초`);
  const F = require(path.join(ROOT, 'server', 'facility.js'));
  const span = r1.st.length;
  ok(span >= (F.CRAFT_MS.tool + 5000 + 6000) / 1000 && firstDrop >= 5 && H._t1196Stat.hall >= 1, '④ 걸린 시간 ≥ 인출 5초 + 작업대 제작 정본 시간(`CRAFT_MS.tool`) + 저장 6초 · 시설 없는 마을 = 회관 앵커', `${span}초 · 회관 ${H._t1196Stat.hall}`);
  // 시설이 있으면 그 앞
  fac = { x: 22 * SZ + 16, y: 21 * SZ + 16, type: 'workbench' };
  vil.econ._t1196Q = [{ id: 2, job: 'mason', day: 3, take: { stone: 1 }, give: { tool: 0.5 }, tre: {}, st: 0, f: 0, pid: null }];
  let seenAt = null; { let now = 2e6; for (let i = 0; i < 400; i++) { const r = H._t1196Step(vil, b1, now, 'mason'); if (r === null) break; if (b1._lifeAct === '제작' && !seenAt) seenAt = [b1.x, b1.y]; if (b1.targetX != null) { b1.x = b1.targetX; b1.y = b1.targetY; } now += 1000; } }
  ok(seenAt && seenAt[0] === fac.x && seenAt[1] === fac.y && H._t1196Stat.fac >= 1, '④ 그 창을 여는 시설(작업대)이 마을에 있으면 그 앞에서 만든다', seenAt ? seenAt.join(',') : '없음');
  // 요리 — 시설 목록이 비어도(안 켜진 청크) 움집 마당 화덕(hut-hearth 정본 자리) 앞에서
  fac = null;
  const HH = require(path.join(ROOT, 'server', 'hut-hearth.js'));
  vil._houseCells = [{ cx: 26, cy: 24 }];
  const want = HH.hearthsOf([26 - 5, 24 - 5, 26, 24 - 2], SZ).find((e) => e.key === 'yard');
  const b3 = { pid: 'b3', simJob: 'cook', simVillageId: 5, x: 0, y: 0 }; players.set('b3', b3); vil.npcPids.push('b3');
  vil.econ._t1196Q = [{ id: 4, job: 'cook', day: 3, take: { food: 1 }, give: { cooked_food: 1.5 }, tre: {}, st: 0, f: 0, pid: null }]; vil.econ.storage.food = 3;
  let cookAt = null; { let now = 3e6; for (let i = 0; i < 200; i++) { const r = H._t1196Step(vil, b3, now, 'cook'); if (r === null) break; if (b3._lifeAct === '제작' && !cookAt) cookAt = [b3.x, b3.y]; if (b3.targetX != null) { b3.x = b3.targetX; b3.y = b3.targetY; } now += 1000; } }
  ok(cookAt && want && cookAt[0] === want.x && cookAt[1] === want.y && vil.econ.storage.cooked_food === 1.5 && vil.econ.storage.food === 2, '④ 요리 — 시설 목록이 비어도 움집 마당 화덕(`hut-hearth.js` 자리 · 움집 발자국 [cx−5..cx]×[cy−5..cy−2]) 앞에서 · 요리 정본 시간', cookAt ? `${cookAt.join(',')} · 화덕 ${want.x},${want.y}` : '없음');
  // ⑤ 명부 — 손에 든 몸은 자리 밖 · 몸을 잃은 작업표는 주인을 지운다
  vil.econ._t1196Q = [{ id: 3, job: 'mason', day: 3, take: { stone: 1 }, give: { tool: 0.5 }, tre: {}, st: 1, f: 1, pid: 'b2' }];
  b2._t1196J = 3;
  H._t1196Seats(vil);
  const s1 = JSON.stringify(vil.econ._t1196Seats);
  players.delete('b2');
  H._t1196Seats(vil);
  const orphan = vil.econ._t1196Q[0].pid;
  const r3 = run(vil, b1, 400);
  ok(s1 === '{"mason":1,"cook":1}' && orphan === null && r3.lab[0] === '운반' && !vil.econ._t1196Q.length, '⑤ 명부 — 손에 든 몸은 자리 밖(자리 1) · 몸을 잃은 작업표는 주인을 지운다 → 다른 몸이 손의 재료째 이어서 만든다(인출 없이 운반부터)', `${s1} · ${r3.lab.join('>')}`);
}
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);

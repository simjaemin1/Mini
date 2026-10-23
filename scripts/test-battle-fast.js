#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-battle-fast.js — T874: 교전 병사 · 대형 병사 · battle-core 핸들을 사전 모드로 내리지 않는다(`T874_BATTLE_FAST`) = 종전 값 ===
//
// ★[T874 ②] 사전 모드의 뿌리는 셋 다 "있던 칸 위에 접근자를 덮는다"(V8 `AccessorsOverwritingNonLast`) · "몸마다 다른 접근자"(`TransitionToDifferentAccessor`)다:
//   ⓐ 교전 병사 — war-live enlist 가 battle-core spawn 리터럴의 데이터 칸 x/y 위에 몸 접근자를 덮는다
//   ⓑ 대형 병사 — war-live bindGroupUnit 이 몸마다 새 닫힘 접근자를 단다(둘째 몸부터)
//   ⓒ 핸들 — battle-core _makeHandle 리터럴의 접근자 열둘
//   켬(★[T900] 기본 · 끔 탐침 `T874_BATTLE_FAST=0`): 접근자를 모두가 같이 쓰는 함수로 · 몸은 숨은 칸(사설 필드)에 · 교전 병사는 같은 칸 · 같은 값으로 다시 지어 그 자리에(늦게 붙던 칸 열아홉은
//   같은 이름으로 미리 `undefined` — 지도 하나) · 핸들은 같은 칸 · 같은 함수로 옮긴다.
//   ① 글자 — 손잡이 켬 기본(`=0` 만 끔 · T900) · 끔 갈래 = 종전 줄 · 켬 식 = 종전 식(같은 곱셈 · 나눗셈 차례) · 아는 칸 꼴 = battle-core spawn 리터럴 · 미리 둔 칸 열아홉 ·
//      그 칸을 '있나' 로 묻는 자리 0(미끼 문다) · 교전 병사를 칸 목록으로 훑는 자리 0
//   ② 꼴 — 끔은 셋 다 사전(자명 통과 금지) · 켬은 셋 다 빠른 꼴 · 교전 병사 새 이름 0 · 값 같음 · 지도 하나 · 대형 병사 · 핸들은 칸 이름 · 차례 · 속성까지 끔과 같다
//   ③ 값 — 아이 판 둘(끔 · 켬): 대형 행군 → 교전 900틱(존 꼴 — 몸 묶기 · 대형 · 화살 · 정산 입력) · battle-core 독립 판(핸들 접근자로 읽는다) 의 모든 값이 한 글자 같다
//      (병사 칸은 값만 견준다 — undefined 칸 = 없던 칸)
// 실행: node scripts/test-battle-fast.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
require('v8').setFlagsFromString('--allow-natives-syntax');
const HFP = new Function('o', 'return %HasFastProperties(o)');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };

console.log('\n=== T874 교전 병사 · 대형 병사 · 핸들 빠른 꼴 = 종전 값 ===');
// ── ① 글자 ─────────────────────────────────────────────────────────────────────────────
console.log('\n① 글자');
const BCS = fs.readFileSync(path.join(ROOT, 'sim', 'battle-core.js'), 'utf8');
const WLS = fs.readFileSync(path.join(ROOT, 'server', 'war-live.js'), 'utf8');
ok(/return _bcKnob\('T874_BATTLE_FAST'\)!=='0'\?_t874Handle\(h0\):h0;/.test(BCS) && (BCS.replace(/\/\/.*$/gm, '').match(/T874_BATTLE_FAST/g) || []).length === 1, "battle-core 손잡이 — 켬 기본 · `=0` 만 끔(T900) · 읽는 자리 하나(_makeHandle)");
ok(/function _t874On\(\) \{ return typeof process !== 'undefined' && !!process\.env && process\.env\.T874_BATTLE_FAST !== '0'; \}/.test(WLS)
  && (WLS.replace(/\/\/.*$/gm, '').match(/T874_BATTLE_FAST/g) || []).length === 1 && (WLS.replace(/\/\/.*$/gm, '').match(/_t874On\(\)/g) || []).length === 3, "war-live 손잡이 — 켬 기본 · `=0` 만 끔(T900) · 술어 하나를 두 자리(enlist · bindGroupUnit)가 묻는다");
{
  const lit = BCS.slice(BCS.indexOf('function _makeHandleLit(ctx){'), BCS.indexOf('// createBattle(spec,opts)'));
  const gets = (lit.match(/get (\w+)\(\)\{return ctx\.(\w+);\}/g) || []).map((s) => s.match(/get (\w+)/)[1]);
  const hg = BCS.slice(BCS.indexOf('const _T874_HG='), BCS.indexOf('const _T874_HD='));
  const gets2 = (hg.match(/get (\w+)\(\)\{return this\.ctx\.(\w+);\}/g) || []).map((s) => s.match(/get (\w+)/)[1]);
  ok(gets.length === 12 && JSON.stringify(gets) === JSON.stringify(gets2) && /return \{\n\s+ctx,\n\s+step\(dt\)\{ trackVel\(ctx,dt\); stepBattle\(ctx,dt\); \},/.test(lit),
    '끔 핸들 = 종전 리터럴 그대로(접근자 열둘 · step) · 켬 접근자 = 같은 열둘 · 같은 차례 · 같은 몸통(ctx → this.ctx)', gets.join(','));
}
ok(/    if \(!uf\) \{   \/\/ 끔\(종전\)[^\n]*\n      Object\.defineProperty\(u, 'x', \{ get\(\) \{ return p\.x \/ PX_PER_M; \}, set\(v\) \{ p\.x = v \* PX_PER_M; \}, enumerable: true, configurable: true \}\);\n      Object\.defineProperty\(u, 'y', \{ get\(\) \{ return p\.y \/ PX_PER_M; \}, set\(v\) \{ p\.y = v \* PX_PER_M; \}, enumerable: true, configurable: true \}\);\n    \}/.test(WLS),
  'enlist 끔 갈래 = 종전 두 줄(몸 접근자 x · y)');
ok(/if \(_t874On\(\) && _t874Group\(gu, p, PX_PER_M, M_PER_CELL\)\) return;[^\n]*\n    Object\.defineProperty\(gu, 'x', \{ get\(\) \{ return p\.x \/ PX_PER_M \/ M_PER_CELL; \}, set\(v\) \{ p\.x = v \* M_PER_CELL \* PX_PER_M; \}/.test(WLS),
  'bindGroupUnit 끔 갈래 = 종전 줄(켬 갈래는 앞에서 돌아선다)');
ok(/ux: \{ get\(\) \{ return this\.#p\.x \/ this\.#k; \}, set\(v\) \{ this\.#p\.x = v \* this\.#k; \}/.test(WLS) && /uy: \{ get\(\) \{ return this\.#p\.y \/ this\.#k; \}, set\(v\) \{ this\.#p\.y = v \* this\.#k; \}/.test(WLS)
  && /gx: \{ get\(\) \{ return this\.#p\.x \/ this\.#k \/ this\.#m; \}, set\(v\) \{ this\.#p\.x = v \* this\.#m \* this\.#k; \}/.test(WLS) && /gy: \{ get\(\) \{ return this\.#p\.y \/ this\.#k \/ this\.#m; \}, set\(v\) \{ this\.#p\.y = v \* this\.#m \* this\.#k; \}/.test(WLS),
  '켬 접근자 식 = 종전 식(`p.x / k` · `v * k` · `p.x / k / m` · `v * m * k` — 같은 연산 · 같은 차례)');
{
  const m = BCS.match(/function spawn\(ctx,side,type,x,y,form,quality\)\{const D=UNITS\[type\];\n  const u=\{([^\n]*)\};/);
  const keys = m ? m[1].replace(/\(([^()]|\([^()]*\))*\)/g, '').split(',').map((s) => s.split(':')[0].trim()).filter(Boolean) : [];
  const uk = (WLS.match(/const _T874_UK = '([^']*)';/) || [])[1];
  ok(keys.length === 17 && uk === keys.join(','), '아는 칸 꼴(`_T874_UK`) = battle-core spawn 리터럴 17칸 그대로(어긋나면 켬도 종전 길로 간다)', keys.join(','));
}
// 미리 두는 칸 열아홉(켬 — 늦게 붙던 칸 · 같은 이름 · 값 undefined)
const PRE = ['atk', 'agent', 'ctl', 'gu', '_vx', '_vy', '_px', '_py', '_rPrev', '_ox', '_oy', '_detCd', 'broken', '_dead', '_cpT', '_clear', '_rk', '_wpBlk', '_wpth'];
const PRE_G = ['slx', 'sly', 'cmd', 'jx', 'jy', 'bu', 'dead', '_dk', '_wpth'];   // 대형 병사(gu) — 늦게 붙던 칸 아홉
{
  const gk = (WLS.match(/const _T874_GK = \[([^\]]*)\];/) || [])[1];
  const gbody = WLS.slice(WLS.indexOf('function _t874Group('), WLS.indexOf('// ═══', WLS.indexOf('function _t874Group(')));
  const gset = (gbody.replace(/\/\/.*$/gm, '').match(/\bgu\.(\w+) = undefined;/g) || []).map((x) => x.match(/gu\.(\w+)/)[1]);
  ok(gk && JSON.stringify(gk.split(',').map((x) => x.trim().replace(/'/g, ''))) === JSON.stringify(PRE_G) && JSON.stringify(gset) === JSON.stringify(PRE_G),
    '켬 대형 병사가 미리 두는 칸 = 늦게 붙던 칸 아홉(buildGroup 다섯 · enlist · 죽음 · 우회 메모 둘) — 같은 이름 · 같은 차례', gset.join(','));
}
{
  const body = WLS.slice(WLS.indexOf('function _t874Unit(u0, p, k) {'), WLS.indexOf('function _t874Group('));
  const got = (body.replace(/\/\/.*$/gm, '').match(/\bu\.(\w+) = (?:undefined|hasAtk \? u0\.atk : undefined|ks\.endsWith\(',agent'\) \? u0\.agent : undefined);/g) || []).map((x) => x.match(/u\.(\w+)/)[1]);
  ok(JSON.stringify(got) === JSON.stringify(PRE), '켬 다시 짓기가 미리 두는 칸 = 늦게 붙던 칸 열아홉(battle-core 열넷 · 존 세계 어댑터 다섯) — 같은 이름 · 같은 차례', got.join(','));
  const SRC = [['sim', 'battle-core.js'], ['sim', 'war-core.js'], ['server', 'war-live.js'], ['server', 'villages.js'], ['server', 'zone.js']].map(([d, f]) => [f, fs.readFileSync(path.join(ROOT, d, f), 'utf8')]);
  const NAMES = [...new Set(PRE.concat(PRE_G))].join('|');
  const presRe = new RegExp("(['\"](" + NAMES + ")['\"]\\s+in\\b|hasOwnProperty(?:\\.call)?\\([^)]*['\"](" + NAMES + ")['\"]|Object\\.hasOwn\\([^)]*['\"](" + NAMES + ")['\"]|Reflect\\.has\\([^)]*['\"](" + NAMES + ")['\"])");
  const hits = (srcs) => { const o = []; for (const [f, t] of srcs) t.split('\n').forEach((l, i) => { const c = l.replace(/\/\/.*$/, ''); if (presRe.test(c)) o.push(f + ':' + (i + 1)); }); return o; };
  const h0 = hits(SRC);
  ok(h0.length === 0, "★미리 둔 칸(병사 열아홉 · 대형 병사 아홉)을 '있나' 로 묻는 자리 0(`'칸' in` · hasOwnProperty · Object.hasOwn · Reflect.has) — 읽는 자리는 값 꼴뿐이라 undefined = 없던 칸", h0.join(' · ') || 'server · sim 다섯 파일');
  ok(hits(SRC.concat([['미끼.js', "if ('_dead' in u) x(); if (u.hasOwnProperty('broken')) y();"]])).length === 1, "★미끼 — `'_dead' in u` · `hasOwnProperty('broken')` 꼴을 심으면 문다");
  const enumRe = /(Object\.(keys|entries|getOwnPropertyNames)\(|JSON\.stringify\(|for \(const \w+ in )[^;]*(ctx\.units|byPid|\bbu\b|\.handle\.units|fight\.ctx|g\.units|\bgu\b|retGroup|atkGroup|defGroup)/;
  const en = []; for (const [f, t] of SRC) t.split('\n').forEach((l, i) => { const c = l.replace(/\/\/.*$/, ''); if (enumRe.test(c)) en.push(f + ':' + (i + 1)); });
  ok(en.length === 0, '★교전 병사 · 대형 병사를 칸 목록으로 훑는 자리 0(Object.keys · entries · JSON · for…in — 병사 · 교전 명부 · 핸들 · 대형)', en.join(' · ') || '0');
}

// ── ② 꼴 ────────────────────────────────────────────────────────────────────────────────
console.log('\n② 꼴 — 끔(`=0`) · 켬(기본 — 손잡이 없음)(같은 프로세스 · 손잡이는 부를 때마다 읽는다)');
const BC = require(path.join(ROOT, 'sim', 'battle-core.js'));
const WLM = require(path.join(ROOT, 'server', 'war-live.js'));
const build = (on) => {
  if (on) delete process.env.T874_BATTLE_FAST; else process.env.T874_BATTLE_FAST = '0';   // ★[T900] 켬 = 빈 값(기본) · 끔 = '0'
  const live = WLM.createWarLive({ cellPx: 32, pxPerM: 32, tickHz: 30 });
  const f = live.makeFight({ id: 4, born: 9, atk: { name: 'A' }, def: { name: 'B' }, _heading: 0.3 }, null, { A: { weapQ: 0.7 }, B: null });
  const out = { f, gus: [], us: [] };
  for (let i = 0; i < 6; i++) {
    const p = { pid: 'p' + i, x: (100 + i * 3) * 32 + 5, y: (200 + (i % 2) * 40) * 32 + 7 };
    const gu = { type: i % 3 === 0 ? 'archer' : 'spear', pid: p.pid };
    live.bindGroupUnit(gu, p); out.gus.push(gu);
    out.us.push(live.enlist(f, i % 2 ? 'B' : 'A', gu, p));
  }
  live.orderAdvance(f, 'A'); live.orderAdvance(f, 'B');
  for (let t = 0; t < 60; t++) live.stepFight(f);
  delete process.env.T874_BATTLE_FAST;
  return out;
};
const OFF = build(false), ON = build(true);
{
  // ★[T900] 손잡이 뜻 — 빈 값 · '1' · 다른 글자는 켬 · '0' 만 끔(핸들 꼴로 본다 — 끔이면 사전 · 켬이면 빠른 꼴)
  const hfp = (v) => { if (v === undefined) delete process.env.T874_BATTLE_FAST; else process.env.T874_BATTLE_FAST = v;
    const f = WLM.createWarLive({ cellPx: 32, pxPerM: 32, tickHz: 30 }).makeFight({ id: 1, born: 1, atk: { name: 'A' }, def: { name: 'B' }, _heading: 0 }, null, { A: null, B: null });
    delete process.env.T874_BATTLE_FAST; return HFP(f.handle) ? 1 : 0; };
  const got = [undefined, '1', 'true', '', '0'].map(hfp);
  ok(JSON.stringify(got) === '[1,1,1,1,0]', "★손잡이 뜻 — 없음 · '1' · 'true' · '' = 켬(빠른 꼴) · '0' 만 끔(사전) — 켬 기본(T900)", got.join(','));
}
const cnt = (arr) => arr.reduce((a, o) => a + (HFP(o) ? 1 : 0), 0);
ok(!HFP(OFF.f.handle) && cnt(OFF.us) === 0 && OFF.gus.slice(1).every((g) => !HFP(g)), '[자명 통과 금지] 끔 — 핸들 · 교전 병사 6 이 다 사전 모드 · 대형 병사는 둘째부터 사전(첫 몸만 새 길을 낸다 — `TransitionToDifferentAccessor`)', `빠른 꼴 ${+HFP(OFF.f.handle)} · ${cnt(OFF.us)}/6 · ${cnt(OFF.gus)}/6`);
ok(HFP(ON.f.handle) && cnt(ON.us) === 6 && cnt(ON.gus) === 6 && HFP(ON.f.ctx) && HFP(ON.f), '★켬 — 핸들 · 교전 병사 6(품질 칸 atk 갈래 포함) · 대형 병사 6 이 다 빠른 꼴(교전 60틱 뒤)', `빠른 꼴 ${+HFP(ON.f.handle)} · ${cnt(ON.us)}/6 · ${cnt(ON.gus)}/6`);
const shape = (o) => JSON.stringify({ keys: Object.keys(o), own: Reflect.ownKeys(o).map(String), names: Object.getOwnPropertyNames(o),
  desc: Object.keys(o).map((k) => { const d = Object.getOwnPropertyDescriptor(o, k); return [k, 'get' in d, 'set' in d && d.set !== undefined, !!d.enumerable, !!d.configurable, d.writable === undefined ? null : d.writable]; }),
  proto: Object.getPrototypeOf(o) === Object.prototype, ext: Object.isExtensible(o) });
{
  const SPAWN = (WLS.match(/const _T874_UK = '([^']*)';/) || [])[1].split(','), ALLOW = new Set(SPAWN.concat(PRE));
  let bad = []; for (let i = 0; i < 6; i++) { const a = OFF.us[i], b = ON.us[i];
    const ka = Object.keys(a), kb = Object.keys(b);
    if (!kb.every((k) => ALLOW.has(k))) bad.push(i + ':새 이름');
    if (!ka.every((k) => kb.includes(k))) bad.push(i + ':끔 칸 빠짐');
    if (JSON.stringify(kb) !== JSON.stringify(SPAWN.concat(PRE))) bad.push(i + ':켬 차례');
    const rf = (v) => (v && typeof v === 'object') ? '@' + (v.agent != null ? v.agent : v.pid) : v;   // 다른 판의 객체 = 같은 몸 이름
    for (const k of kb) if (!Object.is(rf(a[k]), rf(b[k]))) bad.push(i + ':' + k);
    for (const k of ka) { const da = Object.getOwnPropertyDescriptor(a, k), db = Object.getOwnPropertyDescriptor(b, k); if (('get' in da) !== ('get' in db) || da.enumerable !== db.enumerable || da.configurable !== db.configurable || da.writable !== db.writable) bad.push(i + ':속성 ' + k); }
    if (Reflect.ownKeys(b).some((k) => typeof k !== 'string') || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b) || Object.getOwnPropertyNames(b).length !== kb.length) bad.push(i + ':반사'); }
  ok(bad.length === 0, '★교전 병사 — 새 이름 0(켬 칸 = spawn 17 + 늦게 붙던 열아홉) · 끔 칸은 다 있다 · 모든 칸 값이 같다(끔에 없던 칸 = undefined) · 속성(접근자 x · y · 열거 · 고칠 수 있음) · 프로토타입 · 반사 키(숨은 칸 안 보임)', bad.slice(0, 6).join(' · ') || `켬 ${Object.keys(ON.us[0]).length}칸 · 끔 ${Object.keys(OFF.us[0]).length}칸`);
  const SM = new Function('a', 'b', 'return %HaveSameMap(a, b)');
  ok(ON.us.every((u) => SM(u, ON.us[0])) && !OFF.us.every((u) => HFP(u)), '★켬 교전 병사 여섯이 지도 하나를 같이 쓴다(품질 갈래 · 파손 · 죽음 차례와 무관 — 교전 스텝 읽기 자리가 한 꼴)');
}
{
  const GSP = ['type', 'pid', 'x', 'y', '_bound'], GALL = new Set(GSP.concat(PRE_G)), SM2 = new Function('a', 'b', 'return %HaveSameMap(a, b)');
  const rf = (v) => (v && typeof v === 'object') ? '@' + (v.agent != null ? v.agent : v.pid) : v;
  const bad = []; for (let i = 0; i < 6; i++) { const a = OFF.gus[i], b = ON.gus[i], ka = Object.keys(a), kb = Object.keys(b);
    if (!kb.every((k) => GALL.has(k))) bad.push(i + ':새 이름');
    if (!ka.every((k) => kb.includes(k))) bad.push(i + ':끔 칸 빠짐');
    if (JSON.stringify(kb) !== JSON.stringify(GSP.concat(PRE_G))) bad.push(i + ':켬 차례');
    for (const k of kb) if (!Object.is(rf(a[k]), rf(b[k]))) bad.push(i + ':' + k);
    for (const k of ka) { const da = Object.getOwnPropertyDescriptor(a, k), db = Object.getOwnPropertyDescriptor(b, k); if (('get' in da) !== ('get' in db) || da.enumerable !== db.enumerable || da.configurable !== db.configurable || da.writable !== db.writable) bad.push(i + ':속성 ' + k); }
    if (Reflect.ownKeys(b).some((k) => typeof k !== 'string') || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) bad.push(i + ':반사'); }
  ok(bad.length === 0 && ON.gus.every((g) => SM2(g, ON.gus[0])), '★대형 병사 — 새 이름 0(켬 칸 = 다섯 + 늦게 붙던 아홉) · 끔 칸 다 있음 · 모든 칸 값 같음 · 속성 · 프로토타입 · 반사 키 · 켬 여섯이 지도 하나', bad.slice(0, 6).join(' · ') || `켬 ${Object.keys(ON.gus[0]).length}칸 · 끔 ${Object.keys(OFF.gus[0]).length}칸`);
}
ok(shape(OFF.f.handle) === shape(ON.f.handle) && ['step', 'setKeys', 'setCmdHeading', 'setPlayerMode', 'addUnits'].every((k) => typeof ON.f.handle[k] === 'function' && !('prototype' in ON.f.handle[k]) === !('prototype' in OFF.f.handle[k])),
  '핸들 — 칸 이름 · 차례 · 속성(접근자 열둘 읽기만 · 메서드 다섯) · 메서드 꼴이 끔과 같다');
{
  const u = ON.us[0], d = Object.getOwnPropertyDescriptor(u, 'x'), d2 = Object.getOwnPropertyDescriptor(ON.us[1], 'x');
  ok(d.get === d2.get && d.set === d2.set && Object.getOwnPropertyDescriptor(OFF.us[0], 'x').get !== Object.getOwnPropertyDescriptor(OFF.us[1], 'x').get, '켬 접근자는 몸 사이에 같은 함수(끔은 몸마다 새 닫힘 — 사전 모드의 뿌리)');
  let bad = 0; for (const [a, b] of [[OFF, ON]]) for (let i = 0; i < 6; i++) { if (a.us[i].x !== b.us[i].x || a.us[i].y !== b.us[i].y || a.gus[i].x !== b.gus[i].x || a.gus[i].y !== b.gus[i].y) bad++; }
  ok(bad === 0, '같은 무대 60틱 뒤 교전 병사 · 대형 병사 자리(몸 자리 / 비)가 끔 · 켬 비트까지 같다', `다른 몸 ${bad}`);
}

// ── ③ 값 — 아이 판 둘 ────────────────────────────────────────────────────────────────────
console.log('\n③ 값 — 아이 판 둘(끔 `=0` · 켬 기본): 존 꼴 교전 · battle-core 독립 판');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't874-'));
const KID = path.join(TMP, 'kid.js');
fs.writeFileSync(KID, `'use strict';
const ROOT = ${JSON.stringify(ROOT)};
require('v8').setFlagsFromString('--allow-natives-syntax'); const HFP = new Function('o', 'return %HasFastProperties(o)');
const crypto = require('crypto');
const BC = require(ROOT + '/sim/battle-core.js'), WLM = require(ROOT + '/server/war-live.js');
const H = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const ref = (v) => (v && typeof v === 'object') ? ('@' + (v.agent != null ? v.agent : v.pid != null ? v.pid : v.id != null ? v.id : 'o')) : (typeof v === 'number' ? (Object.is(v, -0) ? '-0' : String(v)) : v);
const dump = (o) => Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => k + '=' + ref(o[k])).join(',');   // 값만(undefined 칸 = 없던 칸) · 이름 차례
const out = {};
// (가) 존 꼴 — 대형 행군 → 교전(몸 묶기 · 대형 · 화살 · 사기 · 정산 입력)
{
  const blocked = (cx, cy) => ((cx * 7 + cy * 13) % 97) === 0;
  const live = WLM.createWarLive({ cellPx: 32, pxPerM: 32, tickHz: 30, blockedCell: blocked, arrowOut: () => {}, arrowNear: () => true });
  const players = new Map();
  const mk = (side, n, x0, y0) => { const us = []; const T = ['spear', 'archer', 'champion', 'militia', 'slinger', 'pike', 'dagger', 'greataxe'];
    for (let i = 0; i < n; i++) { const p = { pid: side + i, x: (x0 + (i % 5) * 2) * 32 + (i * 7) % 11, y: (y0 + ((i / 5) | 0) * 2) * 32 + (i * 5) % 13 }; players.set(p.pid, p);
      const gu = { type: T[(i + (side === 'B' ? 3 : 0)) % T.length], pid: p.pid }; live.bindGroupUnit(gu, p); us.push(gu); } return us; };
  const UA = mk('A', 14, 100, 200), UB = mk('B', 12, 160, 204);
  const gA = live.buildGroup(UA, 'line', { cx: 104, cy: 202 }, 0, 11), gB = live.buildGroup(UB, 'wall', { cx: 164, cy: 205 }, Math.PI, 23);
  const trail = [];
  for (let t = 0; t < 120; t++) { gA.cmd.cx += 0.12; live._muStepFollow(gA, live.MU.FOLLOW_CAP); live._muDefHold(gB, gA.cmd, live.MU.FOLLOW_CAP);
    if (t % 10 === 9) trail.push(H([...players.values()].map((p) => p.pid + ':' + p.x + ',' + p.y).join(';'))); }
  const world = { blocked: (x, y) => blocked(Math.floor(x), Math.floor(y)), losBlocked: (x1, y1, x2, y2) => ((Math.floor(x1 + x2) * 3 + Math.floor(y1 + y2)) % 41) === 0,
    coverAt: (x, y) => ((Math.floor(x) + Math.floor(y)) % 17) === 0, hold: (ctx, u, e) => u.side === 'B' && Math.hypot(e.x - u.x, e.y - u.y) > 6,
    advance: (ctx, u) => { const c = ctx._cen[u.side === 'A' ? 'B' : 'A']; const dx = c.x - u.x, dy = c.y - u.y, d = Math.hypot(dx, dy) || 1; return c.n ? { dx: dx / d, dy: dy / d } : null; },
    flee: (ctx, u) => { const c = ctx._cen[u.side === 'A' ? 'B' : 'A']; const dx = u.x - c.x, dy = u.y - c.y, d = Math.hypot(dx, dy) || 1; return { dx: dx / d, dy: dy / d }; } };
  const f = live.makeFight({ id: 7, born: 3, atk: { name: 'A' }, def: { name: 'B' }, _heading: 0.2 }, world, { A: { weapQ: 0.8 }, B: null });
  f.ctx.sides.A.ration = 0.7; f.ctx.sides.B.ration = 1;
  for (const gu of gA.units) live.enlist(f, 'A', gu, players.get(gu.pid));
  for (const gu of gB.units) live.enlist(f, 'B', gu, players.get(gu.pid));
  live.orderAdvance(f, 'A'); live.orderAdvance(f, 'B');
  const evs = [];
  for (let t = 0; t < 900; t++) { const ev = live.stepFight(f); if (ev.contact || ev.standoff || ev.rout) evs.push(t + ':' + (+ev.contact) + (+ev.standoff) + (ev.rout || '-'));
    if (ev.standoff && t % 3 === 0) { live.orderAdvance(f, 'A'); live.orderAdvance(f, 'B'); }
    if (t % 30 === 29) trail.push(H(f.ctx.units.map(dump).join('|'))); }
  out.zone = { trail, evs: H(evs.join(';')), nEv: evs.length, units: f.ctx.units.map(dump), gus: [...gA.units, ...gB.units].map(dump), players: [...players.values()].map((p) => p.pid + ':' + p.x + ',' + p.y),
    sides: JSON.stringify(f.ctx.sides), res: JSON.stringify(live.buildRes(f, 'A')), arrows: f.ctx.arrows.length, corpses: f.ctx.corpses.length, arrowStat: JSON.stringify(live.arrowStat), t: f.t,
    handle: [f.handle.units === f.ctx.units, f.handle.tick, f.handle.result, f.handle.terrain, f.handle.playerMode, Object.keys(f.handle).join(',')].join('|') };
  out.fast = { units: f.ctx.units.filter((u) => HFP(u)).length, n: f.ctx.units.length, gus: [...gA.units, ...gB.units].filter((g) => HFP(g)).length, handle: HFP(f.handle) };
}
// (나) battle-core 독립 판 — createBattle · 핸들 접근자로 읽는다(war-core 헤드리스 전투 꼴)
{
  let s = 99; const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const h = BC.createBattle({ A: { spear: 8, archer: 4, champion: 1, form: 'wall' }, B: { militia: 10, slinger: 3, greataxe: 2 }, quality: { A: { weapQ: 0.6 }, B: { weapQ: 0.4 } } }, { rng });
  let t = 0; const seen = [];
  while (!h.result && t++ < 3000) { h.step(0.05); if (t % 100 === 0) seen.push(H(h.units.map(dump).join('|') + JSON.stringify(h.sides) + h.tick)); }
  out.alone = { t, result: JSON.stringify(h.result), sides: JSON.stringify(h.sides), seen, units: h.units.map(dump), corpses: h.corpses.length, arrows: h.arrows.length, keys: Object.keys(h).join(',') };
  out.fastAlone = { handle: HFP(h), units: h.units.filter((u) => HFP(u)).length };
}
process.stdout.write(JSON.stringify(out));
`);
const kid = (on) => { const env = Object.assign({}, process.env); if (on) delete env.T874_BATTLE_FAST; else env.T874_BATTLE_FAST = '0';   // ★[T900] 켬 = 기본 · 끔 = '0'
  return JSON.parse(execFileSync(process.execPath, [KID], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 }).toString()); };
const K0 = kid(false), K1 = kid(true);
ok(K0.zone.nEv > 20 && K0.zone.res && K0.zone.arrows + K0.zone.corpses >= 0 && K0.alone.t > 50, '[상황] 두 판이 다 돌았다(교전 사건 · 정산 입력 · 독립 판 끝)', `사건 ${K0.zone.nEv} · 시체 ${K0.zone.corpses} · 독립 ${K0.alone.t}스텝 ${K0.alone.result}`);
ok(K0.fast.units === 0 && K0.fast.gus <= 1 && !K0.fast.handle && K1.fast.units === K1.fast.n && K1.fast.gus === 26 && K1.fast.handle,
  '★아이 판 꼴 — 끔 사전(병사 0 · 대형 첫 몸 밖 0 · 핸들 ✗) · 켬 빠른 꼴(병사 다 · 대형 26 · 핸들 ✓)', `끔 ${K0.fast.units}/${K0.fast.n} · ${K0.fast.gus}/26 · 켬 ${K1.fast.units}/${K1.fast.n} · ${K1.fast.gus}/26`);
ok(JSON.stringify(K0.zone) === JSON.stringify(K1.zone), '★존 꼴 — 대형 행군 120틱 · 교전 900틱의 자취 · 사건 · 병사 모든 칸 · 대형 병사 · 몸 자리 · 편 장부 · 정산 입력 · 화살 셈 · 핸들 읽기가 한 글자 같다',
  `자취 ${K0.zone.trail.length} · 병사 ${K0.zone.units.length} · 몸 ${K0.zone.players.length}`);
ok(JSON.stringify(K0.alone) === JSON.stringify(K1.alone) && !K0.fastAlone.handle && K1.fastAlone.handle && K0.fastAlone.units === K1.fastAlone.units,
  '★battle-core 독립 판 — 핸들 접근자로 읽은 병사 · 편 · 결과 · 자취가 한 글자 같다(병사는 끔도 빠른 꼴 · 핸들만 다르다)', `${K0.alone.t}스텝 · 병사 빠른 꼴 ${K0.fastAlone.units}/${K0.alone.units.length}`);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);

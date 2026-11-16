#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1334-bundle.js — T1334: 켬 기본 묶음 손잡이 하나(`T1334_BUNDLE`)가 낱 일곱(아홉 글자)과 같다 [T1319 회부 3] ======
//   ① 기본 갈래(`DEFAULT_ON`) · 끔이면 env 무변 · 켬 글자는 `'1'` 하나(켬 기본 가지에선 빈 값 = 켬 · `'0'` = 끔)
//   ② 켬 = T1319 권고표의 "목표 넷 다 넘는 줄"(묶음 세계 줄)의 손잡이 칸 그대로 — 권고표 JSON(줄 · 칸 표지)과 md 머리(칸 이름 차례)를 읽는다(사본 0)
//   ③ 되돌림 — 준 값이 먼저(`'0'` 그대로 · 빈 글자는 안 준 것으로 채운다)
//   ④ 서버 입구 차례(정적) — `server/zone.js` 묶음 블록이 villages · econ 을 읽는 첫 require 보다 앞 · 판 자 아이 env(`kidEnv`)가 채운다 · 기준선 `cond` 에 묶음이 적힌다
//   ⑤ 지문 같음(모듈이 실제로 선 값) — 아이 프로세스에서 zone.js 묶음 블록을 **글자 그대로** 컴파일해 돌린 뒤 econ · villages 를 읽어 선 값 열다섯:
//      묶음 켬 = 낱 아홉 · 끔과 다름 · 묶음 켬 + 낱 `'0'` 하나(K 문) = 그 갈래만 꺼짐
//   ⑥ 짧은 판 지문 같음 — 판 자(`server-baseline-check --make` · 가상 시계 · 시드 1020 · 5날): 묶음 켬 = 낱 아홉(날 지문 · 판 JSON 지문 · 마을 칸) · 끔과 다름
//   ⑦ 반쪽 묶음 지킴 — econ 을 먼저 읽은 프로세스에서 zone.js 묶음 블록이 채울 글자가 남으면 멈춘다(반쪽으로 안 돈다) · 다 준 env 면 안 멈춘다(판 자 길)
//   ★미끼 — 묶음이 K 문만 켜고 가을 문을 뺀 `t1334-bundle` 사본: ② 빨강(권고 줄과 다르다) · ⑤ 빨강(이주 문 날 수 9월 1일 30 ≠ 181 · 가을 문 꺼짐)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ZONE = path.join(ROOT, 'server', 'zone.js');
const BUNDLE = path.join(ROOT, 'server', 't1334-bundle.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };

// zone.js 의 묶음 블록(맨 위 · villages · econ 앞) — 글자 그대로 잘라 낸다
function zoneBlock() {
  const src = fs.readFileSync(ZONE, 'utf8');
  const a = src.indexOf("{ const _t1334Set = require('./t1334-bundle').fill(process.env);");
  const b = a < 0 ? -1 : src.indexOf('\n  } }\n', a);
  return { src, a, b, block: (a >= 0 && b > a) ? src.slice(a, b + 6) : null };
}

if (process.argv[2] === '--child') {
  const mode = process.argv[3], BAIT = process.env.__T1334_BAIT || null;
  const out = {};
  const _l = console.log; console.log = () => {};   // 묶음 블록 · 모듈 기동 줄은 판정 밖
  const m = new Module(ZONE, null); m.filename = ZONE; m.paths = Module._nodeModulePaths(path.dirname(ZONE));
  const req0 = Module.prototype.require;
  m.require = function (id) { if (BAIT && id === './t1334-bundle') return req0.call(this, BAIT); return req0.call(this, id); };
  try {
    if (mode === 'late') m.require('../sim/economy-sim');   // ⑦ econ 을 먼저 읽은 프로세스(프리로드 꼴)
    const { block } = zoneBlock();
    try { m._compile(block, ZONE); out.threw = false; } catch (e) { out.threw = true; out.msg = String(e.message).slice(0, 160); }
    if (mode !== 'late') {
      const E = m.require('../sim/economy-sim'), V = m.require('./villages');
      const st = V.__t740(); st.econ = E;   // villages 갈래 술어(`_t1306On` …)는 econ 손잡이를 읽는다 — 존 init 이 하는 그 한 칸만
      Object.assign(out, {
        T325: !!E.T325_WOOD_ACT, T1213: !!E.T1213_ON, T1283: !!E.T1283_WOOD_DEMAND, T1297: !!E.T1297_BIRTH_FOOD, T1306G: !!E.T1306_BIRTH_GRADE,
        AUT1: !!E.T1319_AUTUMN_LOOK, MIG: !!E.T1319_AUTUMN_MIG, need184: E.t1297NeedDays(184), mig184: E.t1319MigNeedDays(184),
        T1207: !!V.T1207_TERR_REAL, T1238: !!V.T1238_TERR_V2, T1302: !!V.T1302_TERR_BODY, m1306: !!V._t1306On(), m1312: !!V._t1312On(), m1319K: !!V._t1319KOn(),
      });
    }
  } catch (e) { out.err = String(e && e.stack || e).slice(0, 300); }
  console.log = _l;
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

const B = require(BUNDLE);
const NINE = B.KNOBS.map(([k, v]) => [k, v]);
const OFF0 = { T1334_BUNDLE: '0' };   // 두 가지 어느 쪽에서나 끔(켬 기본 가지 = 빈 값이 켬)
const ON1 = { T1334_BUNDLE: '1' };
const strip = (env) => { const e = Object.assign({}, env); for (const [k] of NINE) delete e[k]; delete e.T1334_BUNDLE; delete e.__T1334_BAIT; return e; };
const BASEENV = strip(process.env);
const child = (mode, env) => {
  try { return JSON.parse(execFileSync(process.execPath, ['--experimental-sqlite', __filename, '--child', mode], { env: Object.assign({}, BASEENV, env), encoding: 'utf8', maxBuffer: 1 << 24, timeout: 180000 }).trim().split('\n').pop()); }
  catch (e) { return { err: String(e.message).slice(0, 200) }; }
};
// 미끼 사본 — 가을 문 줄 하나를 뺀 묶음(K 문만)
const baitSrc = fs.readFileSync(BUNDLE, 'utf8').split('\n').filter((l) => !/\['T1319_AUTUMN_LOOK',\s*'mig'/.test(l)).join('\n');
const BAIT = path.join(os.tmpdir(), `t1334-bait-${process.pid}.js`);
fs.writeFileSync(BAIT, baitSrc);
const Bb = require(BAIT);

(async () => {
  console.log('\n=== T1334 켬 기본 묶음 손잡이 — 하나 = 낱 일곱(아홉 글자) ===\n');

  // ① 기본 갈래
  {
    const e0 = {}, s0 = B.fill(e0), eT = { T1334_BUNDLE: 'true' }, e1 = { T1334_BUNDLE: '1' }, eZ = { T1334_BUNDLE: '0' };
    if (!B.DEFAULT_ON) {
      ok(!B.active({}) && !B.active(eT) && B.active(e1) && !B.active(eZ) && s0.length === 0 && Object.keys(e0).length === 0,
        '① 끔 기본 — 빈 env 는 끔 · env 무변 · 켬 글자는 `1` 하나(`true` 는 끔)', { DEFAULT_ON: B.DEFAULT_ON, filledEmpty: s0 });
    } else {
      const eE = { T1334_BUNDLE: '' };
      ok(B.active({}) && B.active(eE) && B.active(e1) && !B.active(eZ) && s0.length === NINE.length && B.fill(Object.assign({}, eZ)).length === 0,
        '① 켬 기본(이 가지) — 빈 env 가 켬 · `0` 만 끔', { DEFAULT_ON: B.DEFAULT_ON, filledEmpty: s0.length });
    }
  }

  // ② 켬 = T1319 권고표 "목표 넷 다 넘는 줄"(묶음 세계)
  {
    const RJ = JSON.parse(fs.readFileSync(path.join(ROOT, '계측', 'T1319_2026-11-15', 't1319-reco.json'), 'utf8'));
    const md = fs.readFileSync(path.join(ROOT, '계측', 'T1319_2026-11-15', 't1319-reco.md'), 'utf8');
    const head = md.split('\n').find((l) => l.startsWith('| 조합 |') && l.includes('단계 문'));
    const cols = head ? head.split('|')[2].trim().split(' · ') : [];
    const MAP = { 'T1283': [['T1283_WOOD_DEMAND', '1']], 'T1297': [['T1297_BIRTH_FOOD', '1']], '단계 문': [['T1306_BIRTH_GRADE', '1']], '이주 문': [['T1306_MIGRATE_FOOD', '1']],
      '무리 셈': [['T1312_HERD', '1']], 'K 문': [['T1319_RECV_K', '1']], '가을 문': null, 'v2': [['T1207_TERR_REAL', '1'], ['T1238_TERR_V2', '1']], '나무꾼 몸': [['T325_WOOD_ACT', '1']] };
    const rows = RJ.filter((r) => r.all4 && /^묶음/.test(r.name));
    ok(cols.length === 9 && cols.every((c) => c in MAP) && rows.length === 1, '② 전제 — 권고표 칸 아홉(이름 차례는 md 머리) · 묶음 세계 "넷 다 넘는 줄"이 하나', { cols, rows: rows.map((r) => r.name) });
    const want = {};
    if (rows.length === 1) {
      const marks = rows[0].on.split(' ');
      cols.forEach((c, i) => { const mk = marks[i]; if (mk !== '○' && mk !== '◐') return; const L = c === '가을 문' ? [['T1319_AUTUMN_LOOK', mk === '◐' ? 'mig' : '1']] : MAP[c]; for (const [k, v] of L) want[k] = v; });
    }
    const got = (mod) => { const e = { T1334_BUNDLE: '1' }; mod.fill(e); delete e.T1334_BUNDLE; return e; };
    const g = got(B), gb = got(Bb);
    const same = (a, b) => JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]]));
    ok(Object.keys(want).length === 9 && same(g, want), '② 묶음 켬이 채우는 글자 = 권고 줄의 손잡이 칸 그대로(아홉 · 값까지 · 가을 문 `mig` · 단계 문 끔)', g);
    ok(baitSrc !== fs.readFileSync(BUNDLE, 'utf8') && !same(gb, want), '★미끼 ② — 가을 문을 뺀 묶음 사본은 권고 줄과 다르다(빨강)', gb);
  }

  // ③ 되돌림
  {
    const e = { T1334_BUNDLE: '1', T1319_RECV_K: '0', T325_WOOD_ACT: '' }, s = B.fill(e);
    ok(e.T1319_RECV_K === '0' && e.T325_WOOD_ACT === '1' && !s.includes('T1319_RECV_K') && s.includes('T325_WOOD_ACT') && s.length === 8,
      '③ 되돌림 — 준 `0` 은 그대로(K 문만 끔) · 빈 글자는 안 준 것으로 채운다', { filled: s.length, K: e.T1319_RECV_K });
  }

  // ④ 서버 입구 차례(정적)
  {
    const { src, a, block } = zoneBlock();
    const iV = src.indexOf("require('./villages')"), iS = src.search(/require\((?:'|")\.\.\/sim\//);
    ok(!!block && a > 0 && a < iV && (iS < 0 || a < iS), '④ zone.js 묶음 블록이 villages · econ 을 읽는 첫 require 보다 앞', { block: a, villages: iV, sim: iS });
    const T577 = fs.readFileSync(path.join(__dirname, 't577-server-run.js'), 'utf8');
    const kb = T577.slice(T577.indexOf('function kidEnv('), T577.indexOf('return env;', T577.indexOf('function kidEnv(')));
    ok(/t1334-bundle'\)\)\.fill\(env\)/.test(kb), '④ 판 자 아이 env(`kidEnv`)가 묶음을 채운다(프리로드가 econ 을 먼저 읽는 길)');
    const SBC = fs.readFileSync(path.join(__dirname, 'server-baseline-check.js'), 'utf8');
    ok(/t1334-bundle'\)\)\.active\(process\.env\)/.test(SBC) && /T1334_COND\);/.test(SBC), '④ 기준선 자 `cond` 에 묶음이 적힌다(묶음 판 기준선은 묶음 판으로만 견준다)');
  }

  // ⑤ 지문 같음 — 모듈이 실제로 선 값
  {
    const indiv = Object.assign({}, OFF0); for (const [k, v] of NINE) indiv[k] = v;
    const rB = child('zone', ON1), rI = child('zone', indiv), rO = child('zone', OFF0), rR = child('zone', Object.assign({}, ON1, { T1319_RECV_K: '0' }));
    const rX = child('zone', Object.assign({}, ON1, { __T1334_BAIT: BAIT }));
    const fp = (r) => JSON.stringify(Object.keys(r).filter((k) => k !== 'threw').sort().map((k) => [k, r[k]]));
    ok(!rB.err && !rB.threw && rB.T325 && rB.T1213 && rB.T1283 && rB.T1297 && !rB.T1306G && !rB.AUT1 && rB.MIG && rB.need184 === 30 && rB.mig184 === 181 && rB.T1207 && rB.T1238 && !rB.T1302 && rB.m1306 && rB.m1312 && rB.m1319K,
      '⑤ 묶음 켬 — 선 값 열다섯(econ 손잡이 여섯 · 날 수 둘 · villages 갈래 여섯 · T1302 끔): 출생 문 9월 1일 30 · 이주 문 181', rB);
    ok(!rI.err && fp(rB) === fp(rI), '⑤ 지문 같음 — 묶음 켬 = 낱 아홉 켬(선 값 열다섯 모두)');
    ok(!rO.err && fp(rO) !== fp(rB) && !rO.T325 && !rO.T1297 && !rO.m1306 && rO.mig184 === 30, '⑤ 끔과 다름 — 끔이면 아무 갈래도 안 선다(자명 통과 아님)', rO);
    ok(!rR.err && !rR.m1319K && rR.m1312 && rR.MIG && fp(Object.assign({}, rR, { m1319K: true })) === fp(rB), '⑤ 묶음 켬 + `T1319_RECV_K=0` = K 문만 꺼진다(나머지 열넷 그대로)', { m1319K: rR.m1319K });
    ok(!rX.err && fp(rX) !== fp(rI) && !rX.MIG && rX.mig184 === 30 && rX.m1319K, '★미끼 ⑤ — 가을 문을 뺀 묶음 사본: K 문은 서나 이주 문 날 수 9월 1일 30(≠ 181) → 낱 아홉과 다르다(빨강)', { MIG: rX.MIG, mig184: rX.mig184 });
  }

  // ⑥ 짧은 판 지문 같음 — 판 자(가상 시계 · 1020 · 5날)
  {
    const D = fs.mkdtempSync(path.join(os.tmpdir(), 't1334-sbc-'));
    const run = (tag, env) => {
      const f = path.join(D, `${tag}.json`);
      try { execFileSync(process.execPath, ['--experimental-sqlite', path.join(__dirname, 'server-baseline-check.js'), '--make', f, '--days', '5', '--seeds', '1020', '--vclock', '--par', '1'],
        { cwd: ROOT, env: Object.assign({}, BASEENV, env), stdio: 'ignore', timeout: 600000 }); } catch (e) {}
      try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); return { cond: o.cond, s: o.byseed && o.byseed['1020'] }; } catch (e) { return null; }
    };
    const indiv = Object.assign({}, OFF0); for (const [k, v] of NINE) indiv[k] = v;
    const b = run('bundle', ON1), i = run('indiv', indiv), o = run('off', OFF0);
    const days = (x) => x && x.s && JSON.stringify(x.s.days), side = (x) => x && x.s && JSON.stringify(x.s.side || null);
    ok(!!(b && i && o && b.s && i.s && o.s) && b.s.days.length === 5, '⑥ 전제 — 판 셋(묶음 · 낱 아홉 · 끔)이 5날을 다 돌았다', { b: !!(b && b.s), i: !!(i && i.s), o: !!(o && o.s) });
    ok(!!(b && i && b.s && i.s) && days(b) === days(i) && b.s.runHash === i.s.runHash && side(b) === side(i) && JSON.stringify(b.s.eight) === JSON.stringify(i.s.eight),
      '⑥ 짧은 판 지문 같음 — 묶음 켬 = 낱 아홉(날 지문 · 판 JSON 지문 · 마을 칸 · 여덟 수)', b && b.s ? { runHash: b.s.runHash, pop: b.s.eight && b.s.eight.pop } : null);
    ok(!!(b && o && b.s && o.s) && days(b) !== days(o), '⑥ 끔 판과는 다르다(묶음이 판을 실제로 바꾼다)', o && o.s ? { runHash: o.s.runHash, pop: o.s.eight && o.s.eight.pop } : null);
    ok(!!(b && b.cond) && b.cond.T1334_BUNDLE === '1' && !!(i && i.cond) && i.cond.T1334_BUNDLE === undefined, '⑥ 기준선 `cond` — 묶음 판에만 `T1334_BUNDLE` 칸', { b: b && b.cond, i: i && i.cond });
  }

  // ⑦ 반쪽 묶음 지킴
  {
    const indiv = Object.assign({}, ON1); for (const [k, v] of NINE) indiv[k] = v;
    const rL = child('late', ON1), rK = child('late', indiv);
    ok(rL.threw === true && /T1334/.test(rL.msg || ''), '⑦ econ 을 먼저 읽은 프로세스에서 채울 글자가 남으면 멈춘다(반쪽 묶음 0)', rL);
    ok(rK.threw === false, '⑦ 다 준 env(판 자 `kidEnv` 길)면 안 멈춘다', rK);
  }

  try { fs.unlinkSync(BAIT); } catch (e) {}
  console.log(`\n=== T1334 묶음 손잡이: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();

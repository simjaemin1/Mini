#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-econ-fast.js — T862 ②: 마을 econ 객체를 사전 모드로 내리지 않는다(`T862_ECON_FAST`) = 종전 값 ==========================
//
// ★[T862 ②] 마을 econ 객체(`vil.econ` — 생활층과 econ 하루가 가장 많이 읽는 객체 · 칸 110~135)를 V8 사전 모드로 내리던 `delete` 두 무리:
//   ⓐ 다시 뜬 판의 부팅 복원 — 저장 줄 곁 칸(`_t728*` · `_t740Side` · `_t747Body` · `_t732Lots`)을 제자리로 돌려놓고 `delete` ⇒ 51 마을 전부 사전 모드
//   ⓑ 전쟁 — `_warWriteThreats` 가 걸음마다 `delete e._warThreat`
//   켬(★[T876 ①] 기본 · 끔 탐침 `T862_ECON_FAST=0`)이면 지우지 않고 `undefined`(`_t862Drop`) · `in` 문은 `_t862Has`(켬이면 `undefined` 칸 = 없는 칸) · 저장은 그 칸을 안 싣는다.
//   ① 글자 — 그 칸들을 만지는 자리(server/ · sim/ 정본)가 전부 허용 꼴이다(`_t862Drop` · `_t862Has` · 참거짓 · `|| 0` · `!= null` · 저장 줄 `out.<칸> =`).
//      날 `in` · `=== undefined` · `hasOwnProperty` · 날 `delete` 가 생기면 문다(미끼 둘) · 손잡이 켬 기본(`=0` 만 끔 · T876 ①) · 끔 갈래 = `delete` · `in`(종전 뜻)
//   ② 다시 뜬 판 — 실서버 아이 존 6날(시드 1020)을 저장 → 같은 DB 로 끔 · 켬 다시 띄움:
//      부팅 복원 직후(첫 틱 전) 끔 = econ 객체 사전 모드(자명 통과 금지) · 켬 = 전부 빠른 꼴 · 저장 줄(`serializeEcon`) 51 줄이 **바이트** 같다(칸 차례까지) ·
//      이어 날 40 까지 econ 날 지문(곳간 · 사람 · 집 · 금고) · 여덟 수가 한 글자 같다 · 켬 판은 끝까지 빠른 꼴
//   ③ 전쟁 판 — 새 세계 400날(시드 1020 — 첫 전쟁 날 ≈370) 끔 · 켬 나란히: 끔은 전쟁 뒤 사전 모드로 내려간다 · 켬은 끝까지 빠른 꼴 · 400날 지문 · 여덟 수 같음
//   판 조건 = 서버 기준선 자(`VILLAGE_CARAVAN_MAX=0` · `T400_BUILD_ACT=0` — T650 econ 바이트 결정론이 선 판). 전체 ≈9분.
// 실행: node scripts/test-econ-fast.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };

console.log('\n=== T862 ② 마을 econ 객체 빠른 꼴 = 종전 값 ===');
console.log('\n① 글자');
const KEYS = ['_t728BaseOre', '_t728Game', '_t728HuntWk', '_t728LtdOwn', '_t728LtdSrv', '_t740Side', '_t747Body', '_t732Lots', '_warThreat'];
const KRE = new RegExp('(' + KEYS.join('|') + ')\\b(?!\\()');   // `_t732Lots()` 는 같은 이름의 함수(장부 모듈 문) — 칸이 아니다
const FILES = [];
for (const d of ['server', 'sim']) for (const f of fs.readdirSync(path.join(ROOT, d))) if (f.endsWith('.js') && f !== 'economy-engine.browser.js' && !f.startsWith('_')) FILES.push(path.join(d, f));
const uses = [];
for (const f of FILES) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((l, i) => { const c = l.replace(/\/\/.*$/, ''); if (KRE.test(c.replace(/function _t732Lots\(|_t732Lots\(\)/g, ''))) uses.push({ f, n: i + 1, c: c.trim() }); });
}
//   한 줄 안의 칸 쓰임을 하나씩 허용 꼴로 지우고 남는 쓰임이 없어야 한다(남으면 새 꼴 — 문다)
const OKFORM = [
  /_t862Drop\((e|v|v\.econ|o), '(_t\w+|_warThreat)'\)/g,                  // 지우기 문(켬 `undefined` · 끔 `delete`)
  /_t862Has\((e|v\.econ), '_t\w+'\)/g,                                    // `in` 문(켬이면 `undefined` 칸 = 없는 칸)
  /\bout\._t\w+ = /g,                                                     // 저장 줄 곁 칸 쓰기(새 객체 `out`)
  /new Set\(\[('_\w+'(, )?)+\]\)/g,                                       // `_T862_SIDE` 표
  /const (B|S) = e\.(_t747Body|_t740Side);/g,                             // 복원 문 — `_t862Has` 뒤 값 꺼내기
  /const S = vil\.econ && vil\.econ\._t740Side, P = S && S\.psite;/g,     // 참거짓
  /if \(e\._t728BaseOre != null\) vil\._baseOre = e\._t728BaseOre;/g,     // `!= null`
  /const G = e\._t728Game,/g, /const hw = e\._t728HuntWk,/g,              // 복원 문 — `_t862Has` 뒤
  /if \(e\._t728LtdSrv != null\) _ltd\.set\(e, e\._t728LtdSrv\); e\.lastTradeDay = e\._t728LtdOwn;/g,
  /if \(v\._t732Lots !== undefined\) \{ if \(_T732_ON && v\._t732Lots\) _t732Saved\.set\(v, v\._t732Lots\);/g,   // 갓 읽은 JSON(`undefined` 칸이 없다)
  /t > \(e\._warThreat \|\| 0\)\) \{ e\._warThreat = t;/g,                 // 적기 — 읽기는 `|| 0`
  /const T = \(e && e\._warThreat\) \|\| 0;/g,                             // `_warOutMul`
  /const _ta = a\.v\._warThreat \|\| 0, _tb = b\.v\._warThreat \|\| 0;/g,   // econ v2 캐러밴 기대손실
];
const left = (c) => { let x = c.replace(/function _t732Lots\(|_t732Lots\(\)/g, ''); for (const re of OKFORM) x = x.replace(re, ''); return KRE.test(x); };
const odd = uses.filter((u) => left(u.c));
ok(uses.length >= 20 && odd.length === 0, '★곁 칸 · 위협 자국을 만지는 자리가 전부 허용 꼴(`_t862Drop` · `_t862Has` · 참거짓 · `|| 0` · `!= null` · 저장 줄)', odd.map((u) => `${u.f}:${u.n} ${u.c.slice(0, 90)}`).join(' · ') || `${uses.length} 줄`);
ok(left("if ('_t740Side' in e) x();") && left('if (e._t728Game === undefined) y();') && left('delete e._warThreat;'), "★미끼 — 날 `in` · `=== undefined` · 날 `delete` 를 심으면 문다");
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/const T862_ECON_FAST = process\.env\.T862_ECON_FAST !== '0';/.test(V), "손잡이 — 켬 기본 · `=0` 만 끔(T876 ①)");
ok(V.includes("function _t862Drop(o, k) { if (T862_ECON_FAST) o[k] = undefined; else delete o[k]; }") && V.includes("function _t862Has(o, k) { return (k in o) && !(T862_ECON_FAST && o[k] === undefined); }"),
  '끔 갈래 = 종전 뜻(`delete o[k]` · `k in o`) 그대로');
ok(V.includes("    if (T862_ECON_FAST && v[k] === undefined && _T862_SIDE.has(k)) continue;"), '저장 줄 — 켬이면 `undefined` 곁 칸을 안 싣는다(끔 갈래는 그 줄을 안 탄다)');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't862-'));
const PROBE = path.join(TMP, 'probe.js');
fs.writeFileSync(PROBE, `if (!process.env.T862_PROBE_OUT || !process.env.T577_SEED) return;   // 아이 존에만(t577 러너 자신은 건너뛴다)
const path = require('path'), fs = require('fs'), crypto = require('crypto');
require('v8').setFlagsFromString('--allow-natives-syntax'); const HFP = new Function('o', 'return %HasFastProperties(o)');
const ROOT = ${JSON.stringify(ROOT)}, OUT = process.env.T862_PROBE_OUT;
const R6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const st6 = (o) => { if (!o || typeof o !== 'object') return R6(o); const r = {}; for (const k of Object.keys(o).sort()) r[k] = R6(o[k]); return r; };
const rec = { days: [], dictMax: 0, dictLast: 0, warDays: 0, threatDays: 0, boot: null };
const Vm = require(path.join(ROOT, 'server', 'villages'));
const init0 = Vm.init;
Vm.init = function () { const r = init0.apply(this, arguments);   // 부팅 복원 직후 · 첫 틱 전(관찰만)
  try { const B = Vm.__p3Bind({}); const b = { n: 0, dict: 0, ser: [] };
    for (const vil of B.state.villages || []) { const e = vil.econ; if (!e) continue; b.n++; if (!HFP(e)) b.dict++; b.ser.push(crypto.createHash('sha1').update(B.serializeEcon(e)).digest('hex')); }
    rec.boot = b; } catch (e) { rec.err = String(e && e.message); }
  return r; };
const Ev = require(path.join(ROOT, 'server', 'events'));
const mk = Ev.createLedger;
Ev.createLedger = function () { const L = mk.apply(this, arguments); const sd = L.scanDay;
  L.scanDay = function (world, day) { try {
    const h = crypto.createHash('sha1');
    for (const v of world.villages || []) h.update(JSON.stringify([v.name, st6(v.storage), (v.npcs || []).map((n) => [n.id, R6(n.age), n.currentJob || null, R6(n.hunger), R6(n.hp)]), R6(v.housing), v.expansions || 0, v._banditized ? 1 : 0, st6(v.treasury)]));
    rec.days.push([day | 0, h.digest('hex').slice(0, 12)]);
    let d = 0, thr = 0; for (const v of world.villages || []) { if (!HFP(v)) d++; if (v._warThreat > 0) thr++; }
    rec.dictLast = d; if (d > rec.dictMax) rec.dictMax = d;
    if ((world._warWars || []).length) rec.warDays++;
    if (thr) rec.threatDays++;
    rec.n = (world.villages || []).length;
  } catch (e) { rec.err = String(e && e.message); } return sd.apply(this, arguments); }; return L; };
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
`);
const BASE = { VILLAGE_CARAVAN_MAX: '0', T400_BUILD_ACT: '0' };   // 판 조건 = 서버 기준선 자(T650)
const knob = (env, on) => { if (on) delete env.T862_ECON_FAST; else env.T862_ECON_FAST = '0'; return env; };   // ★[T876 ①] 켬 = 빈 값(기본) · 끔 = '0'
const wait = (c, ms) => new Promise((res) => { const k = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) {} }, ms); c.on('exit', (code) => { clearTimeout(k); res(code); }); });
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
// 새 세계 판(t577 자) — 끝에 DB 가 남는다
async function fresh(tag, days, on, probe) {
  const dir = path.join(TMP, tag), out = path.join(TMP, tag + '.json');
  const env = knob(Object.assign({}, process.env, BASE, { T577_DIR: dir, T577_PAR: '1', T577_TAG: 'run' }, probe ? { T862_PROBE_OUT: out, NODE_OPTIONS: `--require ${PROBE}` } : {}), on);
  const c = spawn(process.execPath, [path.join(ROOT, 'scripts', 't577-server-run.js'), String(days), '1020'], { cwd: ROOT, env, stdio: 'ignore' });
  await wait(c, 1800000);
  return { dir, probe: readJ(out) || { days: [], err: 'probe 없음' }, run: readJ(path.join(dir, 'run-1020.json')) || {}, db: path.join(dir, 'run-1020.db') };
}
// 다시 뜬 판 — 저장된 DB 사본으로 존을 띄운다(t577 자와 같은 아이 조건 · 같은 훅 · 날 `T577_DAYS` 에 닿으면 닫힌다)
async function again(tag, db, days, on) {
  const out = path.join(TMP, tag + '.json'), run = path.join(TMP, tag + '-run.json'), mydb = path.join(TMP, tag + '.db');
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(db + s, mydb + s); } catch (e) {} }
  const env = knob(Object.assign({}, process.env, BASE, {
    ZONE_ID: 'hanbando', PORT: String(39800 + (process.pid % 90) + (on ? 1 : 0) * 97), DB_PATH: mydb, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
    VILLAGE_DAY_MS: '250', T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1', T640_BOOT_SLICE: '0', T577_SEED: '1020', T577_DAYS: String(days), T577_OUT: run,
    T862_PROBE_OUT: out, NODE_OPTIONS: `--require ${PROBE}` }), on);
  const c = spawn(process.execPath, ['-r', path.join(ROOT, 'scripts', 't577-server-hook.js'), path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: 'ignore' });
  await wait(c, 900000);
  return { probe: readJ(out) || { days: [], err: 'probe 없음' }, run: readJ(run) || {} };
}
const sameDays = (A, B) => { const i = A.probe.days.findIndex((d, k) => !B.probe.days[k] || B.probe.days[k][1] !== d[1]); return i < 0 && A.probe.days.length === B.probe.days.length ? null : (A.probe.days[i] || [null])[0]; };

(async () => {
  console.log('\n② 다시 뜬 판 — 새 세계 6날 저장 → 같은 DB 로 끔 · 켬 다시 띄움(날 40 까지)');
  const S = await fresh('save', 6, false, false);
  ok(fs.existsSync(S.db), '[상황] 저장된 세계(6날)가 섰다', path.basename(S.db));
  const [R0, R1] = await Promise.all([again('re-off', S.db, 40, false), again('re-on', S.db, 40, true)]);
  const b0 = R0.probe.boot || {}, b1 = R1.probe.boot || {};
  ok(!R0.probe.err && !R1.probe.err && b0.n >= 40 && b1.n === b0.n, '[상황] 두 판이 부팅 복원을 지났다(관측 실패 0)', `마을 ${b0.n} · ${b1.n}`);
  ok(b0.dict === b0.n, '★자명 통과 금지 — 끔 판은 부팅 복원 직후 econ 객체가 전부 사전 모드(종전)', `${b0.dict}/${b0.n}`);
  ok(b1.dict === 0, '★★켬 판은 부팅 복원 직후 econ 객체가 전부 빠른 꼴', `${b1.dict}/${b1.n}`);
  ok(JSON.stringify(b0.ser) === JSON.stringify(b1.ser), '★★부팅 직후 저장 줄(`serializeEcon`) 마을마다 바이트 같음(칸 차례까지)', `${(b1.ser || []).length} 줄`);
  const bad2 = sameDays(R0, R1);
  ok(R0.probe.days.length >= 30 && bad2 === null, '★★이어 돈 날 econ 날 지문 같음(곳간 · 사람 · 집 · 금고)', bad2 === null ? `${R1.probe.days.length}날` : `첫 갈림 날 ${bad2}`);
  ok(R1.probe.dictMax === 0 && R0.probe.dictLast > 0, '켬 판은 날 40 까지 빠른 꼴 · 끔 판은 사전 모드 그대로', `켬 최대 ${R1.probe.dictMax} · 끔 끝 날 ${R0.probe.dictLast}`);
  ok(R0.run.eight && JSON.stringify(R1.run.eight) === JSON.stringify(R0.run.eight), '여덟 수 같음', JSON.stringify(R1.run.eight));

  console.log('\n③ 전쟁 판 — 새 세계 400날(시드 1020) 끔 · 켬 나란히');
  const [OFF, ON] = await Promise.all([fresh('war-off', 400, false, true), fresh('war-on', 400, true, true)]);
  ok(OFF.probe.days.length >= 390 && ON.probe.days.length === OFF.probe.days.length && !OFF.probe.err && !ON.probe.err, '[상황] 두 판이 다 돌았다(econ 날 지문 · 관측 실패 0)', `날 ${OFF.probe.days.length} · ${ON.probe.days.length}`);
  ok(OFF.probe.warDays > 0 && OFF.probe.threatDays > 0, '[상황] 전쟁이 섰고 위협 자국이 마을에 붙었다(지우기 줄이 실제로 돈다)', `전쟁 날 ${OFF.probe.warDays} · 자국 날 ${OFF.probe.threatDays}`);
  ok(OFF.probe.dictMax > 0, '★자명 통과 금지 — 끔 판 econ 객체는 전쟁 뒤 사전 모드로 내려간다(종전)', `최대 ${OFF.probe.dictMax}/${OFF.probe.n} · 끝 날 ${OFF.probe.dictLast}`);
  ok(ON.probe.dictMax === 0 && ON.probe.threatDays > 0, '★★켬 판 econ 객체는 400날 내내 전부 빠른 꼴(자국이 붙었다 지워진 판에서)', `최대 ${ON.probe.dictMax} · 자국 날 ${ON.probe.threatDays}`);
  const bad3 = sameDays(OFF, ON);
  ok(bad3 === null, '★★econ 날 지문 같음(곳간 · 사람 · 집 · 금고 · 400날)', bad3 === null ? `${ON.probe.days.length}날` : `첫 갈림 날 ${bad3}`);
  ok(OFF.run.eight && JSON.stringify(ON.run.eight) === JSON.stringify(OFF.run.eight), '여덟 수 같음', JSON.stringify(ON.run.eight));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})();

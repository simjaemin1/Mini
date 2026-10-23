#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-car-fast.js — T876 ②: 다시 뜬 판 econ 캐러밴을 사전 모드로 짓지 않는다(`T876_CAR_FAST`) = 종전 값 ======================
//
// ★[T876 ②] 다시 뜬 판의 메타 복원(`_t728Restore`)이 길 위 캐러밴 사본을 `Object.assign({}, c)` 로 지었다 — 빈 리터럴에 셈 키로 칸 24 개를 붙이면
//   V8 이 그 사본을 처음부터 사전 모드로 짓는다(T862 표 ⓒ: 다시 뜬 창 econ 캐러밴 40/40 사전). 켬이면 짐 레코드 칸을 거른 나머지 꼴
//   (`const { _t732Cargo, ...rest } = c`)로 짓는다.
//   ① 글자 — 손잡이 켬 기본(`=0` 만 끔 · T889 ①) · 끔 갈래 = 종전 줄(`Object.assign` · `delete o._t732Cargo`) 그대로 · 켬 갈래 = 나머지 꼴
//   ② 다시 뜬 판 — 실서버 아이 존(빠른 시계 · 캐러밴 켬)을 띄워 길 위 캐러밴이 선 세계를 저장(SIGTERM) → 같은 DB 로 끔 · 켬 나란히 다시 띄움:
//      부팅 복원 직후(첫 틱 전) 끔 = 캐러밴 전부 사전 모드(자명 통과 금지) · 켬 = 전부 빠른 꼴 · 캐러밴 메타 저장 줄(`_t728Meta` 의 caravans —
//      칸 · 차례 · 값 · 상대 마을 · 상인) 바이트 같음 · 캐러밴마다 칸 차례 같음 · 마을 저장 줄(`serializeEcon`) 같음
//   (캐러밴이 서는 판은 econ 바이트 결정론 판이 아니라 — 캐러밴 몸 타이밍이 벽시계에 기댄다 — 이어 도는 날은 견주지 않는다 · 견줌은 부팅 직후 한 순간)
// 실행: node scripts/test-car-fast.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };

console.log('\n=== T876 ② 다시 뜬 판 econ 캐러밴 빠른 꼴 = 종전 값 ===');
console.log('\n① 글자');
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/const T876_CAR_FAST = process\.env\.T876_CAR_FAST !== '0';/.test(V), "손잡이 — 켬 기본 · `=0` 만 끔(T889 ①)");
ok(V.includes("        else { o = Object.assign({}, c); _cg = o._t732Cargo; delete o._t732Cargo; }"), '끔 갈래 = 종전 줄(`Object.assign` · `delete o._t732Cargo`) 그대로');
ok(V.includes("        if (T876_CAR_FAST) { const { _t732Cargo, ...rest } = c; o = rest; _cg = _t732Cargo; }"), '켬 갈래 = 짐 레코드 칸을 거른 나머지 꼴');
const VC = V.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');   // 주석 뺀 글자
ok((VC.match(/Object\.assign\(\{\}, c\)/g) || []).length === 1, '캐러밴 사본을 `Object.assign({}, c)` 로 짓는 자리는 끔 갈래 하나뿐(주석 빼고)');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't876-'));
const PROBE = path.join(TMP, 'probe.js');
fs.writeFileSync(PROBE, `const OUT = process.env.T876_BOOT_OUT; if (!OUT) return;
const path = require('path'), fs = require('fs'), crypto = require('crypto');
require('v8').setFlagsFromString('--allow-natives-syntax'); const HFP = new Function('o', 'return %HasFastProperties(o)');
const Vm = require(path.join(${JSON.stringify(ROOT)}, 'server', 'villages'));
const init0 = Vm.init;
Vm.init = function () { const r = init0.apply(this, arguments);   // 부팅 복원 직후 · 첫 틱 전(관찰만 · 기록 뒤 닫는다)
  const rec = {};
  try { const B = Vm.__p3Bind({}); const st = B.state, W = st.world, C = W.caravans || [];
    rec.car = C.length; rec.carDict = C.filter((c) => !HFP(c)).length;
    rec.metaCar = crypto.createHash('sha1').update(JSON.stringify(JSON.parse(B._t728Meta()).caravans)).digest('hex');
    rec.keys = C.map((c) => Object.keys(c).join(','));
    rec.ser = (st.villages || []).map((v) => crypto.createHash('sha1').update(B.serializeEcon(v.econ)).digest('hex'));
    rec.restored = B.state ? true : false;
  } catch (e) { rec.err = String(e && e.message); }
  fs.writeFileSync(OUT, JSON.stringify(rec)); setImmediate(() => process.exit(0)); return r; };
`);
const zoneEnv = (db, port, extra) => Object.assign({}, process.env, { ZONE_ID: 'hanbando', PORT: String(port), DB_PATH: db, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
  VILLAGE_DAY_MS: '250', T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1', T640_BOOT_SLICE: '0' }, extra || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exitOf = (c, ms) => new Promise((res) => { const k = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) {} }, ms); c.on('exit', (code) => { clearTimeout(k); res(code); }); });
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const base = 39000 + (process.pid % 400);

(async () => {
  console.log('\n② 다시 뜬 판 — 캐러밴이 길 위에 선 세계를 저장 → 같은 DB 로 끔 · 켬 다시 띄움');
  const S = path.join(TMP, 'save.db');
  delete process.env.T876_CAR_FAST;   // 저장 판은 손잡이 무관(복원 문을 안 탄다 — 새 세계)
  const z = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env: zoneEnv(S, base), stdio: 'ignore' });
  const zx = exitOf(z, 900000);
  //   부팅 + 빠른 시계 몇 날(캐러밴이 길에 선다) — ★[T889] 고정 100초 대신 DB 를 읽어 기다린다(부팅 교역로 A* 가 붐비는 기계에선 100초를 넘겼다):
  //   마을 행의 저장 날이 8 을 넘으면(econ 날이 돌고 캐러밴이 떠났다) SIGTERM — 종료 저장이 마을 행과 메타 행을 한 날로 같이 쓴다(T728 경계 저장).
  //   상한 10분. 판정 단언은 그대로(아래 [상황] 줄이 메타 캐러밴 · 날을 본다).
  { const t0 = Date.now();
    while (Date.now() - t0 < 600000) { await sleep(5000);
      try { const db = new DatabaseSync(S, { readOnly: true }); const d = db.prepare('select max(day) as d from villages').get(); db.close(); if (d && d.d >= 8) break; } catch (e) {} } }
  try { z.kill('SIGTERM'); } catch (e) {}
  await Promise.race([zx, sleep(30000)]); try { z.kill('SIGKILL'); } catch (e) {} await zx;
  let meta = null, vdays = [];
  try { const db = new DatabaseSync(S, { readOnly: true }); const m = db.prepare('select data from world_meta').all(); meta = m[0] ? JSON.parse(m[0].data) : null;
    vdays = [...new Set(db.prepare('select day from villages').all().map((r) => r.day))]; db.close(); } catch (e) {}
  const mc = meta && meta.caravans ? meta.caravans.length : 0;
  ok(mc >= 10 && meta.anchor && vdays.length === 1 && vdays[0] === (meta.anchor.day | 0), '[상황] 저장된 세계 — 길 위 캐러밴이 메타에 실렸고 메타 날 = 마을 날(복원 문이 캐러밴을 되돌리는 판)', `캐러밴 ${mc} · 메타 날 ${meta && meta.anchor && meta.anchor.day} · 마을 날 ${vdays.join(',')}`);
  const again = (tag, on, k) => { const db = path.join(TMP, tag + '.db'), out = path.join(TMP, tag + '.json');
    for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(S + s, db + s); } catch (e) {} }
    const env = zoneEnv(db, base + 401 + k, { T876_BOOT_OUT: out, NODE_OPTIONS: `--require ${PROBE}` }); if (!on) env.T876_CAR_FAST = '0'; else delete env.T876_CAR_FAST;   // ★[T889 ①] 끔 = '0' · 켬 = 빈 값(기본)
    const c = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: 'ignore' });
    return exitOf(c, 600000).then(() => readJ(out) || { err: '탐침 없음' }); };
  const [A, B] = await Promise.all([again('off', false, 0), again('on', true, 1)]);   // 나란히 — 부팅의 날 뜀(벽시계)이 두 판에 같게
  ok(!A.err && !B.err && A.car === mc && B.car === mc, '[상황] 두 판이 메타 캐러밴을 다 되돌렸다(관측 실패 0)', `${A.car} · ${B.car} / ${mc}`);
  ok(A.carDict === A.car && A.car > 0, '★자명 통과 금지 — 끔 판 캐러밴은 부팅 복원 직후 전부 사전 모드(종전)', `${A.carDict}/${A.car}`);
  ok(B.carDict === 0, '★★켬 판 캐러밴은 전부 빠른 꼴', `${B.carDict}/${B.car}`);
  ok(A.metaCar && A.metaCar === B.metaCar, '★★캐러밴 메타 저장 줄(칸 · 차례 · 값 · 상대 마을 · 상인) 바이트 같음', (B.metaCar || '').slice(0, 12));
  ok(JSON.stringify(A.keys) === JSON.stringify(B.keys), '캐러밴마다 칸 차례 같음', `${(B.keys || []).length} 대`);
  ok(A.ser && JSON.stringify(A.ser) === JSON.stringify(B.ser), '마을 저장 줄(`serializeEcon`) 마을마다 같음', `${(B.ser || []).length} 줄`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})();

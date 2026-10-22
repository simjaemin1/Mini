#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-vil-fast.js — T846 ②: 마을 객체를 사전 모드로 내리지 않는다(`T846_VIL_FAST`) = 종전 값 ===================================
//
// ★[T846 ②] 부팅 끝의 `delete vil._bRows` 한 줄이 마을 객체 전부를 사전 모드로 내렸다. 켬이면 지우지 않고 `null` 로 놓는다.
//   ① 글자 — `_bRows` 를 읽는 자리가 전부 참거짓만 본다(`|| []` · `if (vil._bRows && …)` · `if (vil._bRows) …push`) — `null` = 지운 칸과 같은 답.
//      새 읽기 꼴(`'_bRows' in` · `=== undefined` · `hasOwnProperty`)이 생기면 문다 · 손잡이 켬 기본(`=0` 만 끔 · T862 ①) · 끔 갈래 종전 줄
//   ② 판 — 실서버 아이 존(`t577-server-run` · 시드 1020 · 6날) 끔(`=0`) · 켬(기본 · '1'): 끔은 마을 객체가 사전 모드 · 켬은 빠른 꼴(자명 통과 금지 — 끔이 실제로 내려간다) ·
//      두 판의 econ 날 지문(곳간 · 사람 · 집 · 금고 — SBC 와 같은 칸)과 여덟 수가 한 글자 같다
// 실행: node scripts/test-vil-fast.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };

console.log('\n=== T846 ② 마을 객체 빠른 꼴 = 종전 값 ===');
console.log('\n① 글자');
const SRV = fs.readdirSync(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js'));
const uses = [];
for (const f of SRV) {
  const lines = fs.readFileSync(path.join(ROOT, 'server', f), 'utf8').split('\n');
  lines.forEach((l, i) => { const c = l.replace(/\/\/.*$/, ''); if (/_bRows/.test(c)) uses.push({ f, n: i + 1, c: c.trim() }); });
}
const ALLOW = [
  /_bRows: (\[\]|bRows),/,                                   // 지을 때(리터럴)
  /for \(const b of \(?vil\._bRows \|\| \[\]\)?\)/,            // 읽기 — 없으면 빈 줄
  /if \(vil\._bRows && state\.db/,                           // 읽기 — 참거짓
  /if \(vil\._bRows\) vil\._bRows\.push\(/,                  // 읽기 — 참거짓
  /materializeVillageStructures\(db, vil, vil\._bRows\)/,    // 부팅 실물화(지우기 앞)
  /for \(const vil of state\.villages\) vil\._bRows = null;/,  // 켬
  /for \(const vil of state\.villages\) delete vil\._bRows;/,  // 끔(종전)
];
const odd = uses.filter((u) => !ALLOW.some((re) => re.test(u.c)));
ok(uses.length >= 8 && odd.length === 0, '★`_bRows` 읽는 자리가 전부 참거짓 꼴 — `null` 과 지운 칸이 같은 답', odd.map((u) => `${u.f}:${u.n} ${u.c.slice(0, 80)}`).join(' · ') || `${uses.length} 자리`);
{
  const bait = uses.concat([{ f: 'villages.js', n: 0, c: "if ('_bRows' in vil) x();" }]);
  ok(bait.filter((u) => !ALLOW.some((re) => re.test(u.c))).length === 1, '★미끼 — `\'_bRows\' in vil` 꼴을 심으면 문다');
}
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/const T846_VIL_FAST = process\.env\.T846_VIL_FAST !== '0';/.test(V), "손잡이 — 켬 기본 · `=0` 만 끔(T862 ①)");
ok(/if \(T846_VIL_FAST\) \{ for \(const vil of state\.villages\) vil\._bRows = null; \}\n\s+else for \(const vil of state\.villages\) delete vil\._bRows; \/\/ 수만 행 재참조 방지\(메모리\)/.test(V), '끔 갈래 = 종전 줄 그대로');

console.log('\n② 판 — 실서버 아이 존 6날(시드 1020) 끔(=0) · 켬(기본) · 켬(1)');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't846-'));
const PROBE = path.join(TMP, 'probe.js');
fs.writeFileSync(PROBE, `if (!process.env.T577_SEED) return;
const path = require('path'), fs = require('fs'), crypto = require('crypto');
require('v8').setFlagsFromString('--allow-natives-syntax'); const HFP = new Function('o', 'return %HasFastProperties(o)');
const ROOT = ${JSON.stringify(ROOT)}, OUT = process.env.T846_PROBE_OUT;
const Ev = require(path.join(ROOT, 'server', 'events'));
const R6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const st6 = (o) => { const r = {}; for (const k of Object.keys(o || {}).sort()) r[k] = R6(o[k]); return r; };
const rec = { days: [], fast: null };
const mk = Ev.createLedger;
Ev.createLedger = function () { const L = mk.apply(this, arguments); const sd = L.scanDay;
  L.scanDay = function (world, day) { try {
    const h = crypto.createHash('sha1');
    for (const v of world.villages || []) h.update(JSON.stringify([v.name, st6(v.storage), (v.npcs || []).map((n) => [n.id, R6(n.age), R6(n.hunger), R6(n.hp)]), R6(v.housing), v.expansions || 0, st6(v.treasury)]));
    rec.days.push([day | 0, h.digest('hex').slice(0, 12)]);
    const V = require(path.join(ROOT, 'server', 'villages')); const vs = V.__p3Bind({}).state.villages || [];
    let f = 0, d = 0; for (const v of vs) { if (HFP(v)) f++; else d++; } rec.fast = [f, d];
  } catch (e) { rec.err = String(e && e.message); } return sd.apply(this, arguments); }; return L; };
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
`);
const runOne = (tag, on) => {
  const dir = path.join(TMP, tag), out = path.join(TMP, tag + '.json');
  const env = Object.assign({}, process.env, { T577_DIR: dir, T577_PAR: '1', T846_PROBE_OUT: out, VILLAGE_CARAVAN_MAX: '0', T400_BUILD_ACT: '0',   // 판 조건 = 서버 기준선 자(T650 — econ 바이트 결정론이 선 판)
    NODE_OPTIONS: `--require ${PROBE}` });
  if (on === '') delete env.T846_VIL_FAST; else env.T846_VIL_FAST = on;   // ★[T862 ①] 끔 = '0' · 켬 = 빈 값(기본) · '1'
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 't577-server-run.js'), '6', '1020'], { cwd: ROOT, env, stdio: 'ignore', timeout: 900000 });
  const runJ = fs.readdirSync(dir).find((f) => /-1020\.json$/.test(f));
  return { probe: JSON.parse(fs.readFileSync(out, 'utf8')), run: JSON.parse(fs.readFileSync(path.join(dir, runJ), 'utf8')) };
};
const OFF = runOne('off', '0'), ON = runOne('on', ''), ON1 = runOne('on1', '1');
ok(OFF.probe.days.length >= 5 && !OFF.probe.err && !ON.probe.err && !ON1.probe.err, '[상황] 두 판이 다 돌았다(econ 날 지문 · 관측 실패 0)', `날 ${OFF.probe.days.length} · ${ON.probe.days.length}`);
ok(OFF.probe.fast && OFF.probe.fast[1] > 0, '★자명 통과 금지 — 끔 판 마을 객체는 사전 모드다(종전)', JSON.stringify(OFF.probe.fast));
ok(ON.probe.fast && ON.probe.fast[1] === 0 && ON.probe.fast[0] > 0, '★★켬 판(기본) 마을 객체는 전부 빠른 꼴', JSON.stringify(ON.probe.fast));
ok(JSON.stringify(ON1.probe.fast) === JSON.stringify(ON.probe.fast) && JSON.stringify(ON1.probe.days) === JSON.stringify(ON.probe.days) && JSON.stringify(ON1.run.eight) === JSON.stringify(ON.run.eight), "'1' 판 = 기본 판(꼴 · 날 지문 · 여덟 수)", JSON.stringify(ON1.probe.fast));
ok(JSON.stringify(ON.probe.days) === JSON.stringify(OFF.probe.days), '★★econ 날 지문 같음(곳간 · 사람 · 집 · 금고)', `${ON.probe.days.length}날`);
ok(JSON.stringify(ON.run.eight) === JSON.stringify(OFF.run.eight), '여덟 수 같음', JSON.stringify(ON.run.eight));
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);

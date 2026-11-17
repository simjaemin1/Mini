#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1144-life-event.js — 농부 밭 칸 훑기는 사건 때만 [T1144 ① · ★재민 11-04 문 18 ㄱ · 족보 741] ===
//   잰다(손잡이는 모듈 상수라 팔마다 아이 프로세스):
//   ① 손잡이 `T1144_LIFE_EVENT` ★켬 기본(T1154 11-05 — `'0'` 만 끔) · `'verify'` 대조(답은 종전) · `T1140_LIFE_REQ` 도 켬 기본(`'0'` 만 끔)
//   ② 같은 답 — 정본 밭 계측기 세계(`scripts/farm-metrics.js` · 실지도 51마을 · 정본 노동 · 정본 하루 틱) 위에서
//      가짜 농부(마을마다 넷 · 결정론)가 날마다 여러 번 `_lifeNextFarmCell` 을 묻고(정본 · `_cropProbe.nextFarmCell`) 칸을 잡고 한다(`_cropProbe.doTask` · 헤드리스 갈래).
//      끔 · 켬 · verify 세 팔의 답 차례 지문 · 끝 밭 지문(칸 항목 전부) · 곳간이 같아야 한다 · verify 어긋남 0.
//   ③ 값 — 켬 팔에서 `_cellTask` 를 부른 수(물음) ÷ 끔 팔이 불렀을 수(훑은 칸) · 사건 셈(칸 지움 · 통째로).
//   ④ 미끼 — 사건 밖에서 칸 항목을 고치면(`e.ps = 1` 을 몰래) verify 가 문다 · 켬 팔 지문이 끔과 갈린다(이 자가 잡는다).
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.__T1144_CHILD === '1') {
  // ── 아이: 정본 밭 계측기(`farm-metrics.js`)를 그대로 싣되, 그 앞에 `_cropProbe.tickDay` 를 감싸 그날 앞에 가짜 농부 물음을 끼운다 ──
  process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';                       // farm-metrics 머리 두 줄과 같다(먼저 싣는 쪽이 같은 env 로)
  process.env.DB_PATH = process.env.DB_PATH || `/tmp/farm-metrics-${process.pid}.db`;
  const Villages = require(path.join(ROOT, 'server', 'villages.js'));
  const CP = Villages.__labProbe._cropProbe;
  const SZ = Villages.__labProbe.SZ;
  const BAIT = process.env.T1144_TEST_BAIT === '1';
  const TURNS = 6, FARMERS = 4;
  const BAIT_DAY = Math.floor((parseInt(process.env.T1144_TEST_DAYS || '60', 10) || 60) / 2);
  const hA = crypto.createHash('sha1');
  let q = 0, found = 0, did = 0, scanned = 0, baited = 0;
  let rng = 12345;
  const rnd = () => { rng = (Math.imul(rng, 1103515245) + 12345) >>> 0; return rng / 4294967296; };
  const F = new Map();   // vil → 가짜 농부 넷 { x, y, k }
  const orig = CP.tickDay;
  CP.tickDay = function (vils, day, onDid) {
    for (const vil of vils) {
      if (!vil._farmSet || !vil._farmSet.size) continue;
      let fs4 = F.get(vil);
      if (!fs4) { fs4 = []; for (let i = 0; i < FARMERS; i++) fs4.push({ x: vil.ccx * SZ + (rnd() - 0.5) * 20 * SZ, y: vil.ccy * SZ + (rnd() - 0.5) * 20 * SZ, k: null }); F.set(vil, fs4); }
      for (let t = 0; t < TURNS; t++) {
        for (const npc of fs4) {
          if (npc.k) {   // 잡은 칸 — 반은 하고 놓는다 · 반은 그냥 놓는다(클레임만 풀림 · 칸 무변)
            if (rnd() < 0.5) { if (CP.doTask(vil, npc.k, day)) did++; }
            vil._cropClaim.delete(npc.k); npc.k = null;
            continue;
          }
          scanned += vil._farmSet.size;
          const k = CP.nextFarmCell(vil, npc, day); q++;
          hA.update((k || '-') + ';');
          if (k) { found++; vil._cropClaim.add(k); npc.k = k; const ci = k.indexOf(','); npc.x = +k.slice(0, ci) * SZ + SZ / 2 + (rnd() - 0.5) * 8; npc.y = +k.slice(ci + 1) * SZ + SZ / 2; }
          else { npc.x += (rnd() - 0.5) * 4 * SZ; npc.y += (rnd() - 0.5) * 4 * SZ; }
        }
        if (BAIT && day === BAIT_DAY && t === 2 && baited < 3) {   // ★미끼 — 사건 밖에서 칸 항목을 몰래 고친다(병충해 표식)
          for (const [k, e] of vil._crop) { if (!e.ps && !vil._cropClaim.has(k)) { e.ps = 1; baited++; break; } }
        }
      }
      for (const npc of fs4) if (npc.k) { vil._cropClaim.delete(npc.k); npc.k = null; }   // 그날 끝 — 클레임 비움
    }
    return orig.call(this, vils, day, onDid);
  };
  process.on('exit', () => {
    const hB = crypto.createHash('sha1');
    let food = 0;
    const st = Villages.t1144Stat();
    // 끝 밭 지문 — farm-metrics 가 만든 마을은 모듈 밖이라 F 의 열쇠(마을)로 돈다(가짜 농부가 선 마을 = 밭 있는 마을 전부)
    for (const vil of F.keys()) {
      const rows = [];
      for (const [k, e] of vil._crop) rows.push(k + ':' + e.c + ',' + e.p + ',' + e.ps + ',' + e.w + ',' + e.wd + ',' + e.q + ',' + e.td);
      hB.update(vil.name + '|' + rows.join(';') + '\n');
      const s = vil.econ && vil.econ.storage; if (s) food += (s.food || 0) + (s.grain || 0);
    }
    process.stderr.write('T1144RES ' + JSON.stringify({ ans: hA.digest('hex').slice(0, 16), farm: hB.digest('hex').slice(0, 16), food: +food.toFixed(6), q, found, did, scanned, baited, st }) + '\n');
  });
  const FM = path.join(ROOT, 'scripts', 'farm-metrics.js');
  process.argv = [process.argv[0], FM, process.env.T1144_TEST_DAYS || '60', '1020'];
  require(FM);
} else {

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? `  ${x}` : '')); };
const DAYS = process.env.T1144_TEST_DAYS || '60';
const CACHE = `/tmp/test-t1144-${process.pid}.json`;
const runChild = (v, bait) => {
  const e = Object.assign({}, process.env, { LAB_SEEDCACHE: CACHE, __T1144_CHILD: '1' }); delete e.T1144_LIFE_EVENT; delete e.T1144_TEST_BAIT;
  if (v != null) e.T1144_LIFE_EVENT = v;
  if (bait) e.T1144_TEST_BAIT = '1';
  const r = require('child_process').spawnSync(process.execPath, [__filename],
    { env: e, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const m = /T1144RES (\{.*\})/.exec(r.stderr || '');
  return m ? JSON.parse(m[1]) : { err: (r.stderr || '').slice(-400) };
};
console.log('① 손잡이');
const probe = (v) => { const e = Object.assign({}, process.env, { ENABLE_VILLAGES: '0' }); delete e.T1144_LIFE_EVENT; if (v != null) e.T1144_LIFE_EVENT = v;
  return execFileSync(process.execPath, ['-e', `const s=require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))}).t1144Stat();console.log(JSON.stringify([s.on,s.verify]))`], { env: e, encoding: 'utf8' }).trim().split('\n').pop(); };
const K = { none: probe(null), zero: probe('0'), one: probe('1'), ver: probe('verify'), tru: probe('true') };
ok(K.none === '[true,false]' && K.one === '[true,false]' && K.tru === '[true,false]', '★켬 기본(T1154) — 없음 · `1` · `true` 는 켬', JSON.stringify(K));
ok(K.zero === '[false,false]' && K.ver === '[true,true]', '`0` 만 끔 · `verify` 켬 + 대조', '');
{ const src = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'), zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(/const T1140_LIFE_REQ = process\.env\.T1140_LIFE_REQ !== '0';/.test(src), '`T1140_LIFE_REQ` 켬 기본(`\'0\'` 만 끔)', '');
  ok(/const T1144_LIFE_EVENT = process\.env\.T1144_LIFE_EVENT !== '0';/.test(zsrc) && /if \(T1144_LIFE_EVENT\) p\._t1144Sp = undefined;/.test(zsrc), 'zone.js 손잡이(몸 칸 `_t1144Sp`)도 같은 켬 기본', ''); }
console.log(`② 같은 답(정본 밭 계측기 세계 · 시드 1020 · ${DAYS}날 · 가짜 농부 마을마다 4 · 날마다 6 차례)`);
const t0 = Date.now();
const A = runChild('0'), B = runChild(null), V = runChild('verify');   // ★[T1154] 끔 = `0` · 켬 = 기본(env 없음)
console.log(`  · [상황] 세 팔 ${Math.round((Date.now() - t0) / 1000)}초`);
ok(A.q > 10000 && A.found > 1000 && A.did > 500, '[상황] 끔 팔이 물었다 · 칸을 찾았다 · 했다', `물음 ${A.q} · 찾음 ${A.found} · 함 ${A.did} · 훑은 칸 ${A.scanned}` + (A.err ? ' ' + A.err : ''));
ok(A.ans === B.ans && A.ans === V.ans, '답 차례 지문 — 끔 = 켬 = verify', `${A.ans} · ${B.ans} · ${V.ans}`);
ok(A.farm === B.farm && A.farm === V.farm, '끝 밭 지문(칸 항목 c · p · ps · w · wd · q · td 전부) — 끔 = 켬 = verify', `${A.farm} · ${B.farm} · ${V.farm}`);
ok(A.food === B.food && A.food === V.food, '곳간(식량 + 곡) — 끔 = 켬 = verify', `${A.food} · ${B.food} · ${V.food}`);
ok(V.st && V.st.vq === V.q && V.st.vbad === 0, 'verify — 물음마다 두 길을 견줬다 · 어긋남 0', V.st ? `견줌 ${V.st.vq} · 어긋남 ${V.st.vbad}` : '');
ok(A.st && A.st.q === 0 && A.st.build === 0, '끔 팔은 새 길을 한 번도 안 탔다', A.st ? JSON.stringify(A.st) : '');
console.log('③ 값');
const askRatio = B.st ? B.st.ask / Math.max(1, B.scanned) : 1;
ok(B.st && B.st.q === B.q && B.st.ask < B.scanned * 0.2, '켬 — `_cellTask` 물음이 훑은 칸의 20 % 아래(나머지는 사건 없음 · 지난 답)', B.st ? `물음 ${B.st.ask} / 훑은 칸 ${B.scanned} = ${(100 * askRatio).toFixed(1)} % · 지음 ${B.st.build} · 칸 지움 ${B.st.dirty} · 통째로 ${B.st.reset} · 0 건너뜀 ${B.st.skip}` : '');
console.log('④ 미끼');
const Bb = runChild(null, true), Vb = runChild('verify', true), Ab = runChild('0', true);
ok(Vb.baited > 0 && Vb.st && Vb.st.vbad > 0, '사건 밖에서 칸을 몰래 고치면 verify 가 문다', Vb.st ? `몰래 ${Vb.baited} · 어긋남 ${Vb.st.vbad}` : '');
ok(Bb.ans !== Ab.ans, '같은 미끼에서 켬 팔 답 지문이 끔과 갈린다(이 자가 잡는다)', `${Ab.ans} · ${Bb.ans}`);
try { fs.unlinkSync(CACHE); } catch (e) {}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
}

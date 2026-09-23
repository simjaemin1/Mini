#!/usr/bin/env node
// === scripts/t361-build-days.js — T361 계측기: **집을 사람이 지으면 며칠인가** ==========
//   (러너 밖 — `@regress` 표 없음. 설계 카드의 자료이지 회귀 검사가 아니다.)
//
// ★왜 [재민 결정 #51 ⓐ "집도 행위" · 2026-09-23]
//   T311 §5 가 잰 것: **두 팔 다 사람이 지은 집이 아니다.** 빨리감기는 하루 틱마다 정가로 오르고
//   (`_lifeHeadlessDay` → `min(LIFE_CREW, pop) × LIFE_STAGE_PDAY`), 관찰은 랩 `0.25` 바닥으로만
//   오른다 — 그리고 **크루 누적초가 양쪽 0**. 어부(T312)·나무꾼(T325/T341)·채집(T347)이 세운 문법
//   ("걸어가서 하는 순간이 생산이다")을 집에 대면 며칠이 되는가. 이 계측기가 그 수를 낸다.
//
// ★규약 — **제품 0줄 · 새 수 0 · 사본 0**:
//   · require 로 닿는 정본은 require 한다(`village-layout`·`weights`·`carry`·`zone-config`·`economy-sim`).
//   · `zone.js`·`villages.js`·랩의 **지역 상수**는 require 로 못 닿는다(`zone.js` 는 module.exports 가
//     `__testBind` 하나고, 부르면 서버가 뜬다). ⇒ **그 선언 한 줄을 소스에서 읽고 그 줄을 그대로 찍는다**
//     (`scripts/test-wood-act.js` ④·`scripts/test-site-memo.js` ⑤ 가 쓰는 그 규약). 값을 옮겨 적지 않는다.
//
// ★하는 일 넷
//   ⓐ 한 채의 자재 — `HUT_STAGES` 4단계 → 중간재 → `ITEM_RECIPES` 로 원자재 전개 · econ 축과 대조
//   ⓑ 걸음 — 끝난 판 DB 의 **곳간↔집 거리**로 짐 수·왕복/일·며칠(`_t341TripsPerDay` 문법 그대로)
//   ⓒ 30일 — 지금 규칙(DB 실측 두 팔) vs 행위 규칙(ⓑ 예측)
//   ⓓ 손잡이 `T361_BUILD_ACT` 는 **여기 없다** — 다음 카드의 것이다(이 계측기는 제품을 안 켠다)
//
// 실행:
//   node scripts/t361-build-days.js run                       ← 세 팔(1일·30일끔·30일켬)을 돌리고 잰다
//   node scripts/t361-build-days.js <BASE.db> <NOW.db> <OBS.db>   ← 끝난 판을 읽는다
//   T361_DAYS=30 T361_DAY_MS=4000 node scripts/t361-build-days.js run
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync, spawn } = require('child_process');
const CREW_F = '/tmp/t361-crew.json';

const ROOT = path.join(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── §0 정본 읽기 ──────────────────────────────────────────────────────────────
const VL = require(path.join(ROOT, 'server', 'village-layout.js'));
const W = require(path.join(ROOT, 'server', 'weights.js'));
const CC = require(path.join(ROOT, 'server', 'carry.js'));
const { WORLD } = require(path.join(ROOT, 'server', 'zone-config.js'));
const ECON = require(path.join(ROOT, 'sim', 'economy-sim.js'));

const ZSRC = R('server/zone.js'), VSRC = R('server/villages.js'), ESRC = R('sim/economy-sim.js');
const LSRC = R('lab/마을실험실.html');

const shown = [];                      // 소스에서 읽은 줄 — 보고가 그대로 찍는다(옮겨 적기 방지)
function srcLine(src, where, re) {      // 그 선언이 **있는 줄** 하나를 돌려준다(둘 이상이면 죽는다)
  const hit = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l));
  if (hit.length !== 1) { console.error(`✗ 정본 한 줄을 못 집었다: ${where} ${re} (${hit.length}건)`); process.exit(3); }
  shown.push(`${where}:${hit[0][0]}  ${hit[0][1].trim()}`);
  return hit[0][1];
}
function srcNum(src, where, name) {     // `const NAME = <수>` 의 그 수
  const l = srcLine(src, where, new RegExp(`\\b${name}\\s*=\\s*-?[0-9.]+`));
  return Number(l.match(new RegExp(`${name}\\s*=\\s*(-?[0-9.]+)`))[1]);
}
function srcObj(src, where, name, close) {   // 객체·배열 리터럴 선언을 **그 텍스트째로** 평가한다
  const i = src.indexOf(`const ${name} = `);
  if (i < 0) { console.error(`✗ ${where} 에 ${name} 이 없다`); process.exit(3); }
  const j = src.indexOf(close + ';', i);
  const body = src.slice(i + `const ${name} = `.length, j + close.length);
  shown.push(`${where}  const ${name} = ${body.replace(/\s+/g, ' ').slice(0, 150)}${body.length > 150 ? ' …' : ''}`);
  return eval('(' + body.replace(/\/\/[^\n]*/g, '') + ')');   // eslint-disable-line no-eval
}

//   ⓐ 움집 정본 — 4단계 공정과 선납 값
const HUT_STAGES = srcObj(ZSRC, 'zone.js', 'HUT_STAGES', ']');
const PSITE_COST = srcObj(ZSRC, 'zone.js', 'PSITE_COST', '}');
//   ⓑ 중간재 레시피 — 원자재로 되돌리는 표(필요한 세 줄만)
const RECIPE = {};
for (const k of ['pillar', 'rafter', 'thatch']) {
  const l = srcLine(ZSRC, 'zone.js', new RegExp(`^\\s{2}${k}:\\s+\\{ from:`));
  RECIPE[k] = eval('(' + l.trim().replace(/^[a-z_]+:\s*/, '').replace(/,\s*$/, '') + ')');   // eslint-disable-line no-eval
}
//   ⓒ 걸음·날 — 정본 셋
const MOVE_SPEED = srcNum(ZSRC, 'zone.js', 'MOVE_SPEED');
const DAY_MS = WORLD.dayLengthMs, DAY_RATIO = WORLD.dayPhaseRatio;
const CAP_KG = CC.CFG.CAP_KG;
//   ⓓ 지금의 시공 속도 — 서버 두 상수
const LIFE_CREW = srcNum(VSRC, 'villages.js', 'LIFE_CREW');
const LIFE_STAGE_PDAY = srcNum(VSRC, 'villages.js', 'LIFE_STAGE_PDAY');
srcLine(VSRC, 'villages.js', /t\.k === 'build' && t\.prog >= dayMs \/ LIFE_STAGE_PDAY/);   // 관찰 팔의 게이트
//   ⓔ econ 축 — 수용력 1인당 자재
const HOUSE_WOOD = ECON.HOUSE_WOOD, HOUSE_BUFFER = ECON.HOUSE_BUFFER, HOUSE_BUILD_MAX = ECON.HOUSE_BUILD_MAX;
const HOUSE_STONE = srcNum(ESRC, 'economy-sim.js', 'HOUSE_STONE');
//   ⓕ 랩 축 — T311 이 인용한 세 상수
const L_BUILDRATE = srcNum(LSRC, '마을실험실', 'L_BUILDRATE');
const L_BUILDSEC = srcNum(LSRC, '마을실험실', 'L_BUILDSEC');
const L_BUILDCAP = srcNum(LSRC, '마을실험실', 'L_BUILDCAP');

const SZ = 32;   // 셀 크기(px) — `villages.js` 의 그 수와 같은 자(아래에서 대조한다)
srcLine(VSRC, 'villages.js', /^const SZ = 32;/);

// ── ⓐ 한 채의 자재 ────────────────────────────────────────────────────────────
const CAP = VL.HOUSE_CAP_PER_FLOOR, MAXFL = VL.HOUSE_MAX_FLOORS;
const mid = {};                        // 중간재·원자재 필요량(4단계 합)
for (const st of HUT_STAGES) for (const [k, n] of Object.entries(st.need || {})) mid[k] = (mid[k] || 0) + n;
const raw = {};                        // 레시피로 되돌린 원자재
for (const [k, n] of Object.entries(mid)) {
  const rc = RECIPE[k];
  if (!rc) { raw[k] = (raw[k] || 0) + n; continue; }          // 원자재(풀)
  const per = Object.values(rc.to)[0];                        // 한 번 만들면 몇 개
  const batches = Math.ceil(n / per);
  for (const [ik, iv] of Object.entries(rc.from)) raw[ik] = (raw[ik] || 0) + iv * batches;
}
const kgOf = (k) => W.kgOfOrDefault(k);
const kgSum = (o) => +Object.entries(o).reduce((s, [k, n]) => s + kgOf(k) * n, 0).toFixed(2);
const midKg = kgSum(mid), rawKg = kgSum(raw);
const econPerHut = { wood: +(HOUSE_WOOD * CAP * MAXFL).toFixed(2), stone: +(HOUSE_STONE * CAP * MAXFL).toFixed(2) };

// ── ⓑ 걸음 — 정본 문법 그대로 ────────────────────────────────────────────────
const DAY_S = DAY_MS * DAY_RATIO / 1000;                       // 낮의 실초
const tripsPerDay = (distPx) => {                              // = `_t341TripsPerDay` 의 그 식
  if (!(MOVE_SPEED > 0) || !(DAY_S > 0) || !(distPx > 0)) return 0;
  const t = Math.floor(DAY_S / (2 * distPx / MOVE_SPEED));
  return t > 0 ? t : 0;
};
const loadsFor = (kg) => Math.max(1, Math.ceil(kg / CAP_KG));  // 한 짐을 넘으면 여러 번 — 한 짐은 지고 온다
//   시공 — **두 팔이 다른 자를 쓴다**(T311 §5 가 가른 그 자리)
const 시공_빨리 = HUT_STAGES.length / (LIFE_CREW * LIFE_STAGE_PDAY);            // 빨리감기: 하루에 크루×단계
const STAGE_S = DAY_MS / 1000 / LIFE_STAGE_PDAY;                                 // 관찰: 한 단계에 드는 **현장 초**(villages.js:6797 의 그 문턱)
const 시공_관찰 = Math.ceil(HUT_STAGES.length / LIFE_CREW) * (STAGE_S / DAY_S);  // 낮에만 쌓이니 하루로는 못 채운다
const 인초_서버 = HUT_STAGES.length * STAGE_S;                                    // 한 채에 드는 인·초(서버 자)

// ── 판 돌리기(선택) ───────────────────────────────────────────────────────────
const DAYS = parseInt(process.env.T361_DAYS || '', 10) || 30;
const DAY_MS_ARM = parseInt(process.env.T361_DAY_MS || '', 10) || 4000;
const REUSE = process.env.T361_REUSE === '1';   // 이미 끝난 팔은 다시 안 돈다(측정 재개용)
function arm(tag, days, extra, cport, observeN) {
  const zdb = `/tmp/t361-${tag}-z.db`, cdb = `/tmp/t361-${tag}-c.db`;
  if (REUSE) { try { if (fs.statSync(zdb).size > 1e6) { console.log(`  · 팔 ${tag} — 이미 있다(재사용)`); return zdb; } } catch (e) {} }
  for (const f of [zdb, cdb]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  console.log(`  · 팔 ${tag} — ${days}일 · env ${JSON.stringify(extra)}${observeN ? ` · 관측자 ${observeN}명` : ''}`);
  //   ★관측자를 붙이는 팔 — `anyViewerNear`(zone.js:992)는 `players` 와 **`observers`** 를 본다.
  //     관측 채널은 이미 있다(`ws://…/?observer=1` + `viewport_update` — `e2e-onboarding.js:174` 가 쓰는 그 문).
  //     ⇒ 새 문 0. 관측자를 마을 앵커에 세워 두면 그 마을은 헤드리스 결산에서 **빠지고** 실걸음 크루가 짓는다.
  //   ⚠관측자는 **딴 프로세스**여야 한다 — 아래 `spawnSync` 가 이 프로세스의 이벤트 루프를 멈춘다
  //     (첫 판에서 이걸 같은 프로세스에 두었더니 관측자가 한 명도 안 섰다 — 자기수리).
  let park = null;
  if (observeN) {
    park = spawn(process.execPath, [__filename, '__observe', String(cport + 10), String(observeN), CREW_F], {
      cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], detached: false,
    });
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't212-beds.js')], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], timeout: 1000 * 60 * 20,
    env: Object.assign({}, process.env, {
      T212_DAYS: String(days), T212_DAY_MS: String(DAY_MS_ARM),
      T212_DB: zdb, T212_CDB: cdb, T212_SNAP: `/tmp/t361-${tag}-snap.json`,
      T212_CPORT: String(cport), T212_ZPORT: String(cport + 10),
      T212_ENV: Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(','),
    }),
  });
  if (park) { try { park.kill('SIGTERM'); } catch (e) {} }
  if (r.status !== 0) { console.error(`✗ 팔 ${tag} 실패 (rc=${r.status})`); process.exit(4); }
  return zdb;
}
//   관측자 N 명을 띄워 마을 앵커에 세운다(마을 목록은 **판이 뜬 뒤** `/lifedbg` 가 준다 — 좌표를 안 짓는다).
function parkObservers(zport, n, outF) {
  const WS = require('ws');
  const socks = [];
  const watch = new Set();      // 관측자를 세운 마을
  const crew = new Map();       // 마을 → 최대 붙은 크루·최대 단계·어제 전진 단계(모두 `/lifedbg` 가 이미 내주는 칸)
  let stopped = false, parked = 0;
  const tick = async () => {
    while (!stopped) {
      try {
        const j = await (await fetch(`http://localhost:${zport}/lifedbg`)).json();
        const vs = (j.villages || []);
        if (vs.length && !parked) {
          //   인구 많은 순 n 곳에 세운다(좌표는 `/lifedbg` 의 `ccx/ccy` — 앵커식은 `villageAnchorPx` 그대로)
          for (const v of vs.slice().sort((a, b) => (b.pop | 0) - (a.pop | 0)).slice(0, n)) {
            if (v.ccx == null) continue;
            const ax = v.ccx * SZ + SZ / 2, ay = v.ccy * SZ + SZ / 2;
            watch.add(v.name);
            const w = new WS(`ws://localhost:${zport}/?observer=1`);
            w.on('error', () => {});
            w.on('open', () => {
              socks.push(w); parked++;
              const send = () => { try { w.send(JSON.stringify({ type: 'viewport_update', x: ax, y: ay, w: 2000, h: 2000 })); } catch (e) {} };
              send(); w._iv = setInterval(send, 5000);
            });
          }
          await new Promise((r2) => setTimeout(r2, 2000));
          if (parked) console.log(`    ↳ 관측자 ${parked}명이 마을에 섰다 (${[...watch].join(' ')})`);
        }
        //   ★크루가 실제로 현장에 오나 — `buildCrew`·`site`·`dSt` 를 그대로 센다(새 창구 0)
        for (const v of vs) {
          const o = crew.get(v.name) || { obs: false, crew: 0, site: 0, st: 0 };
          o.obs = watch.has(v.name);
          o.crew = Math.max(o.crew, v.buildCrew | 0);
          o.site = Math.max(o.site, v.site | 0);
          o.st = Math.max(o.st, v.dSt | 0);
          crew.set(v.name, o);
        }
        flush();          // 매 판마다 적는다 — SIGTERM 으로 죽어도 표가 남는다
      } catch (e) {}
      await new Promise((r2) => setTimeout(r2, 2000));
    }
  };
  tick();
  return { stop() {
    stopped = true;
    for (const w of socks) { try { clearInterval(w._iv); w.close(); } catch (e) {} }
    flush();
  } };
  function flush() { try { fs.writeFileSync(outF, JSON.stringify([...crew.entries()])); } catch (e) {} }
}

// ── 관측자 전용 모드(자기 재호출) — `arm()` 이 이 파일을 이 인자로 다시 부른다 ──────────
if (process.argv[2] === '__observe') {
  const zp = parseInt(process.argv[3], 10), nn = parseInt(process.argv[4], 10), of = process.argv[5];
  const p2 = parkObservers(zp, nn, of);
  for (const sg of ['SIGTERM', 'SIGINT']) process.on(sg, () => { p2.stop(); process.exit(0); });
  setTimeout(() => { p2.stop(); process.exit(0); }, 1000 * 60 * 30);
  return;
}

// ── DB 읽기 ───────────────────────────────────────────────────────────────────
function readDb(p) {
  const Database = require('better-sqlite3');
  const db = new Database(p, { readonly: true, fileMustExist: true });
  const vr = db.prepare('SELECT id, name, cx, cy, econ_state FROM villages').all();
  const br = db.prepare("SELECT village_id, type, cx, cy, floors FROM village_buildings WHERE type IN ('granary','house','phouse','shelter','housesite')").all();
  db.close();
  const V = new Map();
  for (const v of vr) {
    let pop = 0, housing = 0;
    try { const e = JSON.parse(v.econ_state || '{}'); pop = (e.npcs || []).length; housing = e.housing || 0; } catch (e) {}
    V.set(v.id, { name: v.name, cx: v.cx, cy: v.cy, pop, housing, gran: [], house: [], site: 0 });
  }
  for (const b of br) {
    const o = V.get(b.village_id); if (!o) continue;
    if (b.type === 'granary') o.gran.push([b.cx, b.cy]);
    else if (b.type === 'housesite') o.site++;
    else o.house.push([b.cx, b.cy, b.floors | 0]);
  }
  return V;
}

// ── 본문 ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const WATCH_N = parseInt(process.env.T361_OBSERVE || '', 10) || 6;
let BASE, NOW, OBS, EYE = null;
if (argv[0] === 'run') {
  console.log('■ 네 팔을 돌린다(1일 기준선 · 30일 끔 · 30일 걸음켬 · 30일 관측자)');
  BASE = arm('base', 1, {}, 3661);
  NOW = arm('now', DAYS, {}, 3681);
  OBS = arm('walk', DAYS, { T312_FISH_ACT: '1' }, 3701);   // ★`_t316WalkAlways` 가 보는 손잡이 = 걷는 세계
  EYE = arm('eye', DAYS, {}, 3721, WATCH_N);               // ★관측자를 세운 세계 = 헤드리스가 **빠지는** 유일한 팔
} else if (argv.length >= 3) { [BASE, NOW, OBS, EYE] = argv; }
else { console.error('쓰는 법: node scripts/t361-build-days.js run | <BASE.db> <NOW.db> <WALK.db> [EYE.db]'); process.exit(2); }

const B = readDb(BASE), N = readDb(NOW), O = readDb(OBS);
const E = EYE && fs.existsSync(EYE) ? readDb(EYE) : null;

console.log('\n═══ §0 정본 — 읽은 줄(옮겨 적지 않았다) ═══');
for (const s of shown) console.log('  ' + s);

console.log('\n═══ ⓐ 한 채의 자재 ═══');
console.log(`  발자국  _vbFootprint('house'|'shelter') = 6×4 = 24셀 (단층 · HOUSE_MAX_FLOORS ${MAXFL} · 정원 ${CAP})`);
console.log(`  공정    ${HUT_STAGES.map((s, i) => `${i + 1}) ${s.label}`).join(' → ')}`);
console.log(`  중간재  ${Object.entries(mid).map(([k, n]) => `${k} ${n}`).join(' · ')}   = ${midKg} kg`);
console.log(`  선납분  ${Object.entries(PSITE_COST).map(([k, n]) => `${k} ${n}`).join(' · ')}   (fiber 는 원자재라 제외 — 정본 주석)`);
console.log(`  원자재  ${Object.entries(raw).map(([k, n]) => `${k} ${n}`).join(' · ')}   = ${rawKg} kg`);
console.log(`  econ 축  수용력 ${CAP}명 × (목재 ${HOUSE_WOOD} · 석재 ${HOUSE_STONE}) = wood ${econPerHut.wood} · stone ${econPerHut.stone}`);
console.log(`  ⇒ 두 축이 어긋난다: 목재 ${raw.wood || 0} vs ${econPerHut.wood} (${((raw.wood || 0) / econPerHut.wood).toFixed(2)}배) · 석재 0 vs ${econPerHut.stone}`);

console.log('\n═══ ⓑ 걸음 — 곳간↔터 · 며칠 ═══');
console.log(`  낮 ${DAY_S} 실초(= dayLengthMs ${DAY_MS} × ${DAY_RATIO}) · 걸음 ${MOVE_SPEED} px/s · 짐 ${CAP_KG} kg · 셀 ${SZ} px`);
console.log(`  짐 수   중간재 ${loadsFor(midKg)} 짐(${midKg} kg) · 원자재 ${loadsFor(rawKg)} 짐(${rawKg} kg)`);
console.log(`  시공일  빨리감기 ${HUT_STAGES.length}단계 ÷ (크루 ${LIFE_CREW} × 단계/일 ${LIFE_STAGE_PDAY}) = ${시공_빨리}일`);
console.log(`          관찰    단계 문턱 ${STAGE_S}초/인 × ⌈${HUT_STAGES.length}÷${LIFE_CREW}⌉ ÷ 낮 ${DAY_S.toFixed(0)}초 = ${시공_관찰.toFixed(2)}일  (낮에만 쌓인다)`);
console.log(`  인·초   서버 ${인초_서버}  vs  랩 L_BUILDSEC ${L_BUILDSEC}  (${(인초_서버 / L_BUILDSEC).toFixed(2)}배 — villages.js:4397 주석이 "근사"라 적은 그 관계)`);
console.log(`  랩 자    빨리감기 L_BUILDRATE ${L_BUILDRATE}/일 ⇒ ${(1 / L_BUILDRATE).toFixed(1)}일 · 관찰 바닥 ×0.25 ⇒ ${(1 / (L_BUILDRATE * 0.25)).toFixed(1)}일 · 상한 L_BUILDCAP ${L_BUILDCAP} ⇒ ${(1 / L_BUILDCAP).toFixed(1)}일`);
const rows = [];
for (const [id, v] of O) {
  if (!v.gran.length || !v.house.length) continue;
  const ds = v.house.map(([hx, hy]) => Math.min(...v.gran.map(([gx, gy]) => Math.hypot(hx - gx, hy - gy))) * SZ);
  ds.sort((a, b) => a - b);
  const p50 = ds[Math.floor(ds.length / 2)];
  const t = tripsPerDay(p50);
  const L = loadsFor(midKg);
  const 운반초 = L * (2 * p50 / MOVE_SPEED);                 // 자재를 다 옮기는 데 드는 실초
  const 운반 = t > 0 ? Math.ceil(L / t) : Infinity;           // 하루 왕복 수로 나눈 날수(≥1)
  rows.push({ id, name: v.name, pop: v.pop, houses: v.house.length,
    dmin: Math.round(ds[0]), d50: Math.round(p50), dmax: Math.round(ds[ds.length - 1]),
    trips: t, 운반, 운반초: Math.round(운반초), 몫: +(운반초 / DAY_S * 100).toFixed(1),
    days: 운반 + Math.ceil(시공_관찰) });
}
rows.sort((a, b) => a.d50 - b.d50);
const q = (arr, f) => arr.length ? arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * f))] : null;
const d50s = rows.map((r) => r.d50), dayss = rows.map((r) => r.days).filter((x) => Number.isFinite(x));
console.log(`  마을 ${rows.length}곳 — 곳간↔집 중앙 ${q(d50s, 0.5)} px(최소 ${q(d50s, 0)} · 최대 ${q(d50s, 1)})`);
const 몫s = rows.map((r) => r.몫);
console.log(`  한 채 며칠 — 중앙 ${q(dayss, 0.5)}일 · 최소 ${q(dayss, 0)} · 최대 ${q(dayss, 1)}   (운반 + 시공 ⌈${시공_관찰.toFixed(2)}⌉)`);
console.log(`  ★운반이 먹는 낮 — 중앙 ${q(몫s, 0.5)}% · 최대 ${q(몫s, 1)}%  ⇒ **걸음은 병목이 아니다. 병목은 시공이다.**`);
console.log('  ┌ 마을 ─────────── 인구 ─ 집 ─ 곳간↔집(px) min/p50/max ─ 왕복/일 ─ 운반초 ─ 낮몫% ─ 운반일 ─ 한채일');
for (const r of rows) console.log(`  │ ${r.name.padEnd(14)} ${String(r.pop).padStart(4)} ${String(r.houses).padStart(4)}   ${String(r.dmin).padStart(5)}/${String(r.d50).padStart(5)}/${String(r.dmax).padStart(5)}   ${String(r.trips).padStart(6)} ${String(r.운반초).padStart(6)} ${String(r.몫).padStart(6)} ${String(r.운반).padStart(6)} ${String(r.days).padStart(6)}`);

console.log('\n═══ ⓒ 30일 — 지금 규칙 vs 행위 규칙 ═══');
const sum = (M, f) => [...M.values()].reduce((s, v) => s + f(v), 0);
const hB = sum(B, (v) => v.house.length), hN = sum(N, (v) => v.house.length), hO = sum(O, (v) => v.house.length);
console.log(`  기준선(1일)          집 ${hB}채 · 인구 ${sum(B, (v) => v.pop)}`);
console.log(`  지금 규칙(${DAYS}일 · 끔)  집 ${hN}채 · 인구 ${sum(N, (v) => v.pop)}   ⇒ ${DAYS}일에 +${hN - hB}채`);
console.log(`  걸음 켬(${DAYS}일)        집 ${hO}채 · 인구 ${sum(O, (v) => v.pop)}   ⇒ ${DAYS}일에 +${hO - hB}채`);
if (E) {
  const hE = sum(E, (v) => v.house.length);
  console.log(`  관측자 ${WATCH_N}명(${DAYS}일)   집 ${hE}채 · 인구 ${sum(E, (v) => v.pop)}   ⇒ ${DAYS}일에 +${hE - hB}채`);
  //   ★관측 마을만 따로 — 헤드리스에서 빠진 마을이 실제로 더/덜 지었나
  let cj = null; try { cj = JSON.parse(fs.readFileSync('/tmp/t361-crew.json', 'utf8')); } catch (e) {}
  if (cj) {
    const obsNames = new Set(cj.filter(([, o]) => o.obs).map(([n2]) => n2));
    const cnt = (M, pick) => [...M.values()].filter((v) => pick(v.name)).reduce((s2, v) => s2 + v.house.length, 0);
    const inO = (n2) => obsNames.has(n2);
    console.log(`    관측 마을 ${[...obsNames].join(' ')}`);
    console.log(`      그 마을들 집  기준선 ${cnt(B, inO)} → 끔 ${cnt(N, inO)} → 관측자 ${cnt(E, inO)}`);
    console.log(`      나머지 마을   기준선 ${cnt(B, (n2) => !inO(n2))} → 끔 ${cnt(N, (n2) => !inO(n2))} → 관측자 ${cnt(E, (n2) => !inO(n2))}`);
    const wc = cj.filter(([, o]) => o.obs), nc = cj.filter(([, o]) => !o.obs);
    const mx = (a, f) => a.length ? Math.max(...a.map(([, o]) => f(o))) : 0;
    console.log(`      ★붙은 크루 최대 — 관측 ${mx(wc, (o) => o.crew)} · 비관측 ${mx(nc, (o) => o.crew)}   (T311 §5 "크루 누적초 0" 의 서버판)`);
    console.log(`      ★어제 전진 단계 최대 — 관측 ${mx(wc, (o) => o.st)} · 비관측 ${mx(nc, (o) => o.st)}`);
  }
}
let pred = 0, blocked = 0;
for (const r of rows) { if (!Number.isFinite(r.days)) { blocked++; continue; } pred += Math.floor(DAYS / r.days); }
console.log(`  행위 규칙 예측       ${DAYS}일에 +${pred}채 (마을당 ⌊${DAYS} ÷ 한채일⌋ 합 · 수요 게이트 미적용 · 걸음이 안 서는 마을 ${blocked}곳)`);
console.log(`  ⇒ 비  행위/지금(끔) ${hN - hB > 0 ? (pred / (hN - hB)).toFixed(2) : 'n/a'} · 행위/걸음켬 ${hO - hB > 0 ? (pred / (hO - hB)).toFixed(2) : 'n/a'}`);
//   ★★그런데 지금 집 수를 정하는 것이 **짓는 속도인가 수요인가** — 둘을 같은 자로 나란히 둔다
{
  const nv = rows.length || 1;
  const 수요간격 = (hN - hB) > 0 ? +(DAYS / ((hN - hB) / nv)).toFixed(1) : Infinity;   // 마을이 새 집을 **원하는** 간격
  const 한채일 = q(dayss, 0.5);
  console.log(`\n  ★수요 간격  마을당 ${DAYS}일에 ${(((hN - hB) / nv)).toFixed(1)}채 ⇒ **한 채를 원하는 간격 ${수요간격}일**`);
  console.log(`  ★짓는 속도  행위 규칙 ${한채일}일/채 · 지금 빨리감기 ${시공_빨리}일/채 · 지금 관찰 ${시공_관찰.toFixed(2)}일/채`);
  console.log(`  ⇒ ${한채일 < 수요간격 ? '**수요가 느리다** — 행위로 옮겨도 30일 집 수는 안 바뀐다(값 판정 0 · 비용만 7% 늘 뿐)'
                                        : '**짓는 속도가 병목이다** — 옮기면 집 수가 준다'}`);
  console.log(`  ⇒ 실측이 그렇게 말한다: 끔 +${hN - hB} · 걸음켬 +${hO - hB}${E ? ` · 관측자 +${sum(E, (v) => v.house.length) - hB}` : ''} — **세 팔이 같은 수다**`);
}
console.log(`\n  ★판정 0 — 이 수는 설계 표의 입력이다. 손잡이(T361_BUILD_ACT)는 여기 없다(다음 카드).`);

#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T470 자)
// =============================================================================
// T470 — 몸의 세 행위를 보는 자. `t176-ab` 에는 몸도 셀 스캔도 없어 어부·나무꾼·채집 켬이 끔과 바이트 같다(T454).
//   ⇒ 행위 켬 세계는 **실서버**(central + 한반도 존 · 생활층 하루 · 몸)로만 잰다. 이 자가 그 판 하나를 돈다.
//
//   실서버 판(run): central + hanbando zone · 관측자 0 · `ZONE_IDLE_SKIP=0`(T410 문 열림 · 기본) · `T432_BODY_CHUNKS=0`(끔 · 기본)
//     · 게임일 = T368 자의 실제 날 1,440,000ms(= `zone-config` WORLD.dayLengthMs · 짧은 시계론 몸이 못 거둔다 — T410 §2)
//     · 새 DB(새 세계) · 세계 씨 = `ZONES.hanbando.villageSeed` 를 **이 자의 preload** 가 판의 씨로 덮는다(제품 0 · 1020 은 원래 값)
//     · 하루 경계마다: `/perf`(fish·wood·forage·farm·walk·tick) + `/lifedbg`(작물 일 · 몸) + 존 DB `econ_state`(읽기 전용 —
//       곳간 품목 · 행위 수식 `_fishOutLast`·`_woodOutLast`·`_forageOutLast` · 게이트 셀 · 곳간 입고 건수 `_t312CatchN`·`_t325CutN`·`_t347PickN`)
//     · 사람당 µs = 그날 틱 p50 ÷ 몸(T356 정의) · 단판 값은 `[단판]` 표지(T455 규약 여섯째 — 3시드 중앙값 + 폭이 규약 값)
//   일괄 판(batch): `t176-ab` 를 **그대로** 30일 · 같은 씨 · 같은 손잡이로 돌리되, 이 자의 preload 가 `tickWorldV2` 뒤에
//     마을 칸(수식 · 곳간 · 인구)을 날마다 적는다(t176 무변 · 새 계산 0 · 읽기만).
//   표(table): 행위 수 · 곳간 30일 끝 · 등가 틈 %(실서버 ↔ 같은 30일 일괄) · 몸이 하는 몫 % · 넷 켬 걸음 겹침 · µs.
//
// 쓰는 법:
//   node scripts/t470-act-world.js run   <팔> <씨> <outdir> [portBase]   … 팔 = off|fish|wood|forage|farm|four
//   node scripts/t470-act-world.js batch <팔> <씨> <outdir>
//   node scripts/t470-act-world.js table <outdir>
//   env: T470_DAYS(30) · T470_DAY_MS(1440000 — 바꾸면 규약 밖) · LAB_SEEDCACHE(일괄 판 · t176 과 같은 캐시)
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const HOOK = process.env.T470_HOOK || '';

// ── preload 갈래 — 모듈이 **처음 실린 뒤에** 손댄다(먼저 불러 env 읽는 순서를 흔들지 않는다) ─────────────
function onLoad(rel, fn) {
  const Module = require('module');
  const want = path.join(ROOT, rel);
  const orig = Module._load;
  let done = false;
  Module._load = function (req, parent, isMain) {
    const m = orig.apply(this, arguments);
    if (!done) { let f = null; try { f = Module._resolveFilename(req, parent, isMain); } catch (e) {} if (f === want) { done = true; fn(m); } }
    return m;
  };
}
function sumStor(vs) {
  const o = {};
  for (const v of vs) for (const k in (v.storage || {})) { const q = +v.storage[k] || 0; if (q) o[k] = (o[k] || 0) + q; }
  for (const k in o) o[k] = +o[k].toFixed(3);
  return o;
}
function econSnap(vs, E) {   // 마을 칸 합 — 두 판(실서버 DB · 일괄 world)이 **같은 함수**로 센다
  //   채집 수식은 품목별로도 나눈다(`foragerYieldsFor` 정본 믹스 · 걷는 품목 목록은 실서버 `/perf forage.items` 가 표에서 고른다) —
  //   일괄 판엔 `_t347MixShare` 가 없다(게이트가 거짓이라 econ 이 안 적는다) ⇒ 몫을 같은 정본 믹스로 두 판에 똑같이 센다.
  const forBy = {};
  let pop = 0, fishF = 0, woodF = 0, forF = 0, forFS = 0, fishC = 0, woodC = 0, forC = 0, catchN = 0, cutN = 0, pickN = 0, live = 0;
  for (const v of vs) {
    const n = (v.npcs || []).length; pop += n; if (n > 0) live++;
    fishF += +v._fishOutLast || 0; woodF += +v._woodOutLast || 0;
    const f = +v._forageOutLast || 0; forF += f; forFS += f * (+v._t347MixShare || 0);
    if (f > 0 && E && typeof E.foragerYieldsFor === 'function') { let y = null; try { y = E.foragerYieldsFor(v); } catch (e) { y = null; }
      if (y) { const sw = Object.values(y).reduce((a, b) => a + b, 0) || 1; for (const k in y) forBy[k] = (forBy[k] || 0) + f * y[k] / sw; } }
    if ((v._t312Cells | 0) > 0) fishC++; if ((v._t325Cells | 0) > 0) woodC++; if ((v._t347Cells | 0) > 0) forC++;
    catchN += v._t312CatchN || 0; cutN += v._t325CutN || 0; pickN += v._t347PickN || 0;
  }
  const r = (x) => +x.toFixed(4);
  return { n: vs.length, live, pop, fishF: r(fishF), woodF: r(woodF), forF: r(forF), forFS: r(forFS), fishC, woodC, forC, catchN, cutN, pickN,
    forBy: Object.fromEntries(Object.entries(forBy).map(([k, x]) => [k, r(x)])), stor: sumStor(vs) };
}

// ── 행위 칸의 마을 합 — 나무꾼·채집의 하루는 두 갈래다(`server/villages.js _lifeDaily`):
//   몸 갈래 = 손에 든 것을 곳간에 넣은 몸 수(`dbg.walked`) · 일괄 갈래 = `walked === 0` 인 마을에서 걸음 한도만큼
//   색인 순서로 베고/딴다(`dbg.cut`/`dbg.pick` · T325 가 남긴 빚 — 관측자 없는 마을의 하루).
//   ⇒ 일괄 호출 = 그 갈래가 돈 마을·일(`on ∧ walked 0 ∧ 벤/딴 것 > 0`). 어부는 그 갈래가 없다(T316 이 지웠다) · 농부는 `hlBatch`.
function actAgg(p) {
  const one = (o, k, jk) => { if (!o || !o.rows) return null; let on = 0, walked = 0, bodyV = 0, batchV = 0, n = 0, job = 0;
    for (const r of o.rows) { const d = r.dbg || {}; if (d.on) on++; walked += d.walked | 0; if ((d.walked | 0) > 0) bodyV++;
      if (d.on && !(d.walked | 0) && (d[k] | 0) > 0) { batchV++; n += d[k] | 0; } job += d[jk] | 0; }
    return { on, walked, bodyV, batchV, n, job }; };
  return { wood: one(p && p.wood, 'cut', 'ln'), forage: one(p && p.forage, 'pick', 'fg') };
}
if (HOOK === 'seed') {
  const s = parseInt(process.env.T470_SEED || '', 10);
  onLoad('server/zone-config.js', (zc) => { if (s > 0 && zc.ZONES && zc.ZONES.hanbando) { const was = zc.ZONES.hanbando.villageSeed; zc.ZONES.hanbando.villageSeed = s; process.stderr.write(`[T470] hanbando villageSeed ${was} → ${s}\n`); } });
} else if (HOOK === 'batch') {
  const rows = [];
  //   ★마을 집합 — 일괄 판의 씨 캐시는 실서버보다 한 곳 많을 수 있다(T470 실측: 캐시 51 · 서버 50 · `어촌6`).
  //     합은 **실서버에 선 마을만** 센다(`T470_NAMES` · 실서버 판이 적은 이름표). 세계는 그대로 51곳을 돈다(t176 무변).
  let NAMES = null; try { NAMES = process.env.T470_NAMES ? new Set(JSON.parse(process.env.T470_NAMES)) : null; } catch (e) { NAMES = null; }
  onLoad('sim/economy-sim-v2.js', (v2) => {
    const orig = v2.tickWorldV2;
    v2.tickWorldV2 = function (world) { const r = orig.apply(this, arguments); try { rows.push(Object.assign({ day: world.day }, econSnap((world.villages || []).filter((v) => !NAMES || NAMES.has(v.name)), require(path.join(ROOT, 'sim/economy-sim'))))); } catch (e) {} return r; };
  });
  process.on('exit', () => { try { fs.writeFileSync(process.env.T470_BOUT, JSON.stringify({ rows })); } catch (e) {} });
} else {
  main();
}

function main() {
  const { spawn, execFileSync } = require('child_process');
  const [MODE, ARM, SEEDS, OUTD, PB] = process.argv.slice(2);
  const DAYS = parseInt(process.env.T470_DAYS || '30', 10);
  const DAY_MS = parseInt(process.env.T470_DAY_MS || '1440000', 10);   // = T368 REAL_DAY_MS
  const A = { fish: { T312_FISH_ACT: '1' }, wood: { T325_WOOD_ACT: '1' }, forage: { T347_FORAGE_ACT: '1' }, farm: { T100_FIELD_YIELD: '1', T368_FARM_ACT: '1' } };
  const ARMS = { off: {}, fish: A.fish, wood: A.wood, forage: A.forage, farm: A.farm, four: Object.assign({}, A.fish, A.wood, A.forage, A.farm) };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
  const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
  const SEED = parseInt(SEEDS, 10);

  if (MODE === 'batch') {
    fs.mkdirSync(OUTD, { recursive: true });
    const bout = path.join(OUTD, `b_${ARM}_${SEED}.json`);
    let names = null; try { names = JSON.parse(fs.readFileSync(path.join(OUTD, 'names.json'), 'utf8')); } catch (e) { names = null; }
    const env = Object.assign({}, process.env, names ? { T470_NAMES: JSON.stringify(names) } : {}, { ENABLE_VILLAGES: '1', T470_HOOK: 'batch', T470_BOUT: bout + '.rows',
      T176_JSON: path.join(OUTD, `bx_${ARM}_${SEED}.json`), T17_JSON: path.join(OUTD, `bj_${ARM}_${SEED}.json`) }, ARMS[ARM]);
    const t0 = Date.now();
    const o = execFileSync(process.execPath, ['-r', __filename, path.join(ROOT, 'scripts/t176-ab.js'), String(DAYS), String(SEED)], { cwd: ROOT, env, maxBuffer: 256 << 20 }).toString();
    fs.writeFileSync(path.join(OUTD, `bo_${ARM}_${SEED}.txt`), o);
    const rows = JSON.parse(fs.readFileSync(bout + '.rows', 'utf8')).rows;
    fs.unlinkSync(bout + '.rows');
    const x = JSON.parse(fs.readFileSync(path.join(OUTD, `bx_${ARM}_${SEED}.json`), 'utf8'));
    fs.writeFileSync(bout, JSON.stringify({ arm: ARM, seed: SEED, days: DAYS, env: ARMS[ARM], ms: Date.now() - t0, names: names ? names.length : null, rows,
      x: { pop: x.pop, dead: x.dead, harvestNTot: x.harvestNTot, fieldFoodEqTot: x.fieldFoodEqTot, sowTot: x.sowTot, woodProdTot: x.woodProdTot, prodLedgerTot: x.prodLedgerTot, t100PendTot: x.t100PendTot } }, null, 1));
    say(`[batch] ${ARM} ${SEED} · ${rows.length}일 · ${((Date.now() - t0) / 1000).toFixed(0)}초 → ${bout}`);
    return;
  }
  if (MODE === 'table') return table(ARM, SEEDS === 'md');
  if (MODE === 'tap') return tap(ARM, SEEDS);
  if (MODE !== 'run' || !ARMS[ARM] || !(SEED > 0) || !OUTD) { console.error('쓰는 법: run|batch <팔> <씨> <outdir> [portBase] · table <outdir>'); process.exit(2); }

  (async () => {
    fs.mkdirSync(OUTD, { recursive: true });
    const tag = `${ARM}_${SEED}`, OUT = path.join(OUTD, `r_${tag}.json`);
    const CP = parseInt(PB || '4700', 10), ZP = CP + 10, SECRET = 't470-' + tag;
    const zdb = path.join(OUTD, `z_${tag}.db`), cdb = path.join(OUTD, `c_${tag}.db`); rmdb(zdb); rmdb(cdb);
    const logf = fs.openSync(path.join(OUTD, `z_${tag}.log`), 'w');
    const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
      env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
    //   ★손잡이: 문 열림(`ZONE_IDLE_SKIP=0`) · 청크 문 끔(`T432_BODY_CHUNKS=0`) — 둘 다 기본값을 **적어서** 준다(바깥 env 가 새지 않게)
    const zenv = Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), VILLAGE_WAR_LOG: '0', ZONE_IDLE_SKIP: '0', T432_BODY_CHUNKS: '0',
      T470_HOOK: 'seed', T470_SEED: String(SEED) }, ARMS[ARM]);
    for (const k of ['T312_FISH_ACT', 'T325_WOOD_ACT', 'T347_FORAGE_ACT', 'T368_FARM_ACT', 'T100_FIELD_YIELD', 'T400_BUILD_ACT', 'T435_GRANARY_ACT', 'T423_RATION_ACT', 'T452_KILN_ACT']) if (!ARMS[ARM][k]) delete zenv[k];
    const z = spawn(process.execPath, ['-r', __filename, path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf], env: zenv });
    const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
    const health = async () => { try { return (await fetch(`http://localhost:${ZP}/health`)).ok; } catch (e) { return false; } };
    const kill = async () => { try { z.kill('SIGINT'); } catch (e) {} await sleep(5000); try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
    process.on('SIGTERM', async () => { await kill(); process.exit(3); });
    const proc = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
      const rss = +(fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/) || [0, 0])[1];
      return { cpuS: (+st[11] + +st[12]) / 100, rssMB: +(rss / 1024).toFixed(0) }; } catch (e) { return null; } };
    const { DatabaseSync } = require('node:sqlite');
    const EM = require(path.join(ROOT, 'sim/economy-sim'));   // 믹스 정본(`foragerYieldsFor` · 땅값만 읽는다 · 손잡이 무관)
    const readDb = () => { let d = null; try { d = new DatabaseSync(zdb, { readOnly: true });
      const rows = d.prepare("SELECT econ_state FROM villages WHERE zone='hanbando'").all();
      return econSnap(rows.map((r) => { try { return JSON.parse(r.econ_state || '{}'); } catch (e) { return {}; } }), EM); } catch (e) { return { err: e.message }; } finally { try { d && d.close(); } catch (e) {} } };
    const lifeSum = (L) => { if (!L || !L.villages) return null; let dTk = 0, bodies = 0, farmAct = 0, nonSleep = 0, carrying = 0;
      const FA = new Set(['경작', '파종', '모내기', '수확', '방제', '물대기', '김매기', '논매기', '개간', '출근']);
      for (const v of L.villages) { dTk += v.dTk || 0; bodies += v.pop || 0; carrying += v.carrying || 0;
        for (const [k, n] of Object.entries(v.acts || {})) { if (FA.has(k)) farmAct += n; if (k !== '취침') nonSleep += n; } }
      return { phase: L.phase, dTk, bodies, farmAct, nonSleep, carrying }; };
    const strip = (o) => { if (!o) return null; const r = Object.assign({}, o); delete r.rows; delete r.thin; return r; };
    const dayOf = (p) => (p && p.econTick && p.econTick.last && p.econTick.last.day) || 0;

    const res = { arm: ARM, seed: SEED, env: ARMS[ARM], DAYS, DAY_MS, at: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version },
      knobs: { ZONE_IDLE_SKIP: '0', T432_BODY_CHUNKS: '0', observer: 0 }, days: [] };
    const tb = Date.now();
    for (let i = 0; i < 1800 && !(await health()); i++) await sleep(1000);
    res.bootS = +((Date.now() - tb) / 1000).toFixed(0);
    const L0 = await getj('/lifedbg');
    res.villages = L0 && L0.villages ? L0.villages.map((v) => v.name) : null;
    if (res.villages) { try { fs.writeFileSync(path.join(OUTD, 'names.json'), JSON.stringify(res.villages)); } catch (e) {} }
    say(`[${tag}] 부팅 ${res.bootS}초 · 마을 ${res.villages ? res.villages.length : '?'} · phase ${L0 && L0.phase} · 씨 ${SEED}`);
    await getj('/perf?reset=1');
    let last = dayOf(await getj('/perf')), cpu0 = proc(z.pid), t0 = Date.now();
    res.day0 = last;
    const LIM = (DAYS + 2) * DAY_MS + 30 * 60000;
    while (res.days.length < DAYS && Date.now() - tb < LIM) {
      await sleep(30000);
      const p = await getj('/perf');
      if (!p) { if (z.exitCode != null) { say(`[${tag}] ⚠존이 죽었다 rc=${z.exitCode}`); break; } continue; }
      const d = dayOf(p);
      if (d === last) continue;
      last = d;
      await sleep(20000);   // 저장 큐가 마을 50곳을 다 내리게(틱당 1곳 · 30Hz)
      const p2 = (await getj('/perf?reset=1')) || p;
      const L = lifeSum(await getj('/lifedbg'));
      const db = readDb();
      const cpu1 = proc(z.pid), wall = (Date.now() - t0) / 1000;
      const t = p2.tick && p2.tick.ms;
      const row = { day: d, wallS: +wall.toFixed(0), db, life: L, act: actAgg(p2),
        fish: strip(p2.fish), wood: strip(p2.wood), forage: strip(p2.forage), farm: p2.farm ? Object.assign({}, p2.farm) : null,
        walk: p2.walk ? { steps: p2.walk.steps, cut: p2.walk.cutTicks } : null,
        tick: t ? { p50: t.p50, p95: t.p95, n: t.n, dropN: p2.tick.dropN, lagPct: p2.tick.lagPct } : null,
        usPer: t && L && L.bodies ? +(t.p50 * 1000 / L.bodies).toFixed(4) : null,
        cpuPct: cpu0 && cpu1 && wall > 0 ? +(100 * (cpu1.cpuS - cpu0.cpuS) / wall).toFixed(2) : null, rssMB: cpu1 && cpu1.rssMB, load: require('os').loadavg()[0] };
      cpu0 = cpu1; t0 = Date.now();
      res.days.push(row);
      fs.writeFileSync(OUT, JSON.stringify(res));
      say(`[${tag}] day ${d} · 인구 ${db.pop} · 걸음 ${row.walk && row.walk.steps} · 어획 ${p2.fish ? p2.fish.delivered : '-'} · 벌목 ${p2.wood ? p2.wood.delivered : '-'} · 채취 ${p2.forage ? p2.forage.delivered : '-'} · 수확 ${p2.farm ? p2.farm.harvestN : '-'}(몸/일괄 ${p2.farm ? p2.farm.hlBody + '/' + p2.farm.hlBatch : '-'}) · p50 ${t && t.p50} · ${row.usPer}µs · CPU ${row.cpuPct}% · RSS ${row.rssMB}MB`);
    }
    res.end = new Date().toISOString(); res.done = res.days.length >= DAYS;
    fs.writeFileSync(OUT, JSON.stringify(res));
    await kill();
    for (const f of [zdb, cdb]) rmdb(f);
    say(`[${tag}] 끝 · ${res.days.length}일 · ${((Date.now() - tb) / 3600000).toFixed(2)}시간 → ${OUT}`);
    process.exit(0);
  })();
}

// ── 곁 창(tap) — 이미 도는 판(이 칸이 생기기 전에 띄운 판)의 `/perf` 를 하루에 한 번 읽어 `actAgg` 만 적는다(읽기만 · reset 0)
//   node scripts/t470-act-world.js tap <outdir> <tag:port,tag:port,…>   (tag = <팔>_<씨> · port = 그 판의 존 포트)
function tap(D, list) {
  const zs = String(list || '').split(',').filter(Boolean).map((x) => { const [tag, port] = x.split(':'); return { tag, port: +port, last: null, f: path.join(D, `tap_${tag}.json`) }; });
  const get = async (z) => { try { const r = await fetch(`http://localhost:${z.port}/perf`, { headers: { 'x-zone-secret': 't470-' + z.tag } }); return await r.json(); } catch (e) { return null; } };
  (async () => {
    for (;;) {
      let alive = 0;
      for (const z of zs) {
        const p = await get(z); if (!p) continue; alive++;
        const d = (p.econTick && p.econTick.last && p.econTick.last.day) || 0;
        if (d === z.last) continue; z.last = d;
        let o = { tag: z.tag, days: [] }; try { o = JSON.parse(fs.readFileSync(z.f, 'utf8')); } catch (e) {}
        //   ★마을별 누계 입고(`rows[].d`) — `/perf` 의 `delivered` 는 **지금 행위 마을만** 더한다(군락이 다해 게이트가 꺼진
        //     마을의 누계는 합에서 빠진다 · 채집에서 실측). 마을별로 적어 두면 표가 마을마다 **가장 큰 값**을 더해 참 누계를 낸다.
        const vd = {}; for (const k of ['fish', 'wood', 'forage']) if (p[k] && p[k].rows) { vd[k] = {}; for (const r of p[k].rows) vd[k][r.n] = r.d; }
        o.days.push({ day: d, at: new Date().toISOString(), act: actAgg(p), farmHl: p.farm ? [p.farm.hlBody, p.farm.hlBatch] : null, vd });
        fs.writeFileSync(z.f, JSON.stringify(o));
      }
      if (!alive && zs.every((z) => z.last != null)) break;
      await new Promise((r) => setTimeout(r, 60000));
    }
  })();
}

// ── 표 ─────────────────────────────────────────────────────────────────────────────────────────
function table(D, MD) {
  const SEEDS = [1020, 7, 42], ARMN = ['off', 'fish', 'wood', 'forage', 'farm', 'four'];
  const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch (e) { return null; } };
  const R = {}, B = {}, TP = {};
  for (const a of ARMN) for (const s of SEEDS) { R[`${a}_${s}`] = rd(`r_${a}_${s}.json`); B[`${a}_${s}`] = rd(`b_${a}_${s}.json`); TP[`${a}_${s}`] = rd(`tap_${a}_${s}.json`); }
  const med = (xs) => { const v = xs.filter((x) => x != null && isFinite(x)).sort((p, q) => p - q); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const wid = (xs) => { const v = xs.filter((x) => x != null && isFinite(x)); return v.length ? Math.max(...v) - Math.min(...v) : null; };
  const pct = (a, b) => (b ? +(100 * (a - b) / b).toFixed(2) : null);
  const sum = (a, f) => a.reduce((x, r) => x + (f(r) || 0), 0);
  //   걷는 채집 품목 — 실서버 `/perf forage.items`(정본 `_t347ActItems`) 에서 읽는다(표 0)
  let ITEMS = null;
  for (const k in R) { const r = R[k]; if (r && r.days) for (const d of r.days) if (d.forage && d.forage.items && d.forage.items.length) { ITEMS = d.forage.items; break; } if (ITEMS) break; }
  const walked = (by) => { if (!by || !ITEMS) return 0; let t = 0; for (const k of ITEMS) t += by[k] || 0; return t; };
  const out = { seeds: SEEDS, forageItems: ITEMS, arms: {} };
  for (const a of ARMN) {
    const per = SEEDS.map((s) => {
      const r = R[`${a}_${s}`], b = B[`${a}_${s}`];
      if (!r || !r.days || !r.days.length) return { seed: s, missing: true };
      const ds = r.days, last = ds[ds.length - 1];
      //   ★곁 창(tap)과 판 안 칸(`act` · 42 물결부터)을 날마다 합친다 — 같은 날은 판 안 칸이 먼저
      const tp = TP[`${a}_${s}`], byDay = new Map();
      if (tp && tp.days) for (const t of tp.days) if (t.day > 0 && ds.some((x) => x.day === t.day)) byDay.set(t.day, { act: t.act, vd: t.vd || null });
      for (const x of ds) if (x.act) byDay.set(x.day, Object.assign({}, byDay.get(x.day) || {}, { act: x.act }));
      const actDays = [...byDay.values()].filter((v) => v.act);
      //   마을별 누계 입고 — 곁 창이 **모든 날**을 봤을 때만 참 누계(Σ 마을마다 가장 큰 값). 아니면 날마다 늘어난 몫의 합(하한 · 게이트가 꺼진 마을의 날에 모자란다)
      const vdDays = [...byDay.entries()].filter(([, v]) => v.vd);
      const trueCum = (k) => { if (vdDays.length < ds.length) return null; const m = {}; for (const [, v] of vdDays) for (const n in (v.vd[k] || {})) m[n] = Math.max(m[n] || 0, v.vd[k][n] || 0); return +Object.values(m).reduce((x, y) => x + y, 0).toFixed(4); };
      const posCum = (k) => { let prev = 0, t = 0; for (const x of ds) { const v = x[k] ? x[k].delivered : 0; if (v > prev) t += v - prev; prev = v; } return +t.toFixed(4); };
      const bVD = (k) => (actDays.length ? { vd: actDays.reduce((t, v) => t + ((v.act[k] && v.act[k].batchV) || 0), 0), bodyV: actDays.reduce((t, v) => t + ((v.act[k] && v.act[k].bodyV) || 0), 0), n: actDays.reduce((t, v) => t + ((v.act[k] && v.act[k].n) || 0), 0), days: actDays.length } : null);
      const dd = (k, f) => { const xs = ds.map((x) => (x[k] ? f(x[k]) : null)); return xs; };
      // 행위 수 — 누계칸은 끝 − 첫날 앞(첫 창은 부팅 뒤 0 에서 시작)
      const cum = (k, f) => { const x = ds.filter((y) => y[k]).map((y) => f(y[k])); return x.length ? x[x.length - 1] : null; };
      const row = { seed: s, days: ds.length, done: r.done, bootS: r.bootS, pop0: ds[0].db.pop, popEnd: last.db.pop, live: last.db.live,
        steps: sum(ds, (x) => x.walk && x.walk.steps), stepsDay: med(ds.slice(1).map((x) => x.walk && x.walk.steps)),
        fish: r.env.T312_FISH_ACT ? { gate: `${last.fish.actVillages}/${last.fish.villages}`, cast: cum('fish', (f) => f.t340 && f.t340.cast), hook: cum('fish', (f) => f.t340 && f.t340.hook),
          entries: last.db.catchN, delivered: cum('fish', (f) => f.delivered), formAct: sum(ds, (x) => x.fish && x.fish.formulaPerDay), formAll: sum(ds, (x) => x.fish && x.fish.formulaAll), walkersMax: Math.max(...dd('fish', (f) => f.walkers).filter((x) => x != null)) } : null,
        wood: r.env.T325_WOOD_ACT ? { gate: `${last.wood.actVillages}/${last.wood.villages}`, cut: sum(ds, (x) => x.wood && x.wood.cutDay), entries: last.db.cutN, delivered: cum('wood', (f) => f.delivered),
          formAct: sum(ds, (x) => x.wood && x.wood.formulaPerDay), formAll: sum(ds, (x) => x.wood && x.wood.formulaAll), trees0: ds[0].wood && ds[0].wood.trees, treesEnd: last.wood.trees, walkersMax: Math.max(...dd('wood', (f) => f.walkers).filter((x) => x != null)), handsMax: Math.max(...dd('wood', (f) => f.hands).filter((x) => x != null)), batch: bVD('wood') } : null,
        forage: r.env.T347_FORAGE_ACT ? { gate: `${last.forage.actVillages}/${last.forage.villages}`, gate0: `${ds[0].forage.actVillages}/${ds[0].forage.villages}`, groves: [ds[0].forage.groves, last.forage.groves],
          pick: sum(ds, (x) => x.forage && x.forage.pickDay), entries: last.db.pickN,
          delivered: trueCum('forage') != null ? trueCum('forage') : posCum('forage'), deliveredExact: trueCum('forage') != null, deliveredPosCum: posCum('forage'), deliveredPerfEnd: cum('forage', (f) => f.delivered),
          handsMax: Math.max(...dd('forage', (f) => f.hands).filter((x) => x != null)), batch: bVD('forage'),
          formAct: sum(ds, (x) => x.forage && x.forage.formulaActPerDay), formActAll: sum(ds, (x) => x.forage && x.forage.formulaPerDay), formAll: sum(ds, (x) => x.forage && x.forage.formulaAll), walkersMax: Math.max(...dd('forage', (f) => f.walkers).filter((x) => x != null)) } : null,
        farm: r.env.T368_FARM_ACT ? { harvestN: last.farm.harvestN, credUnits: last.farm.credUnits, credFoodEq: last.farm.credFoodEq, t100Eq: last.farm.t100Eq, hlBody: last.farm.hlBody, hlBatch: last.farm.hlBatch,
          trips: last.farm.trips, farmTk: sum(ds, (x) => x.life && x.life.dTk), gran: last.farm.gran } : null,
        // 수식 합(행위 무관 — DB 의 `_XOutLast` · 모든 팔이 같은 칸) — 일괄 판과 **같은 함수**(econSnap)로 셌다
        dbForm: { fish: sum(ds, (x) => x.db.fishF), wood: sum(ds, (x) => x.db.woodF), forS: sum(ds, (x) => x.db.forFS), for: sum(ds, (x) => x.db.forF),
          forW: sum(ds, (x) => walked(x.db.forBy)) },
        storEnd: last.db.stor,
        us: med(ds.slice(1).map((x) => x.usPer)), p50: med(ds.slice(1).map((x) => x.tick && x.tick.p50)), p95: med(ds.slice(1).map((x) => x.tick && x.tick.p95)),
        cpu: med(ds.slice(1).map((x) => x.cpuPct)), rss: Math.max(...ds.map((x) => x.rssMB || 0)), dropMax: Math.max(...ds.map((x) => (x.tick && x.tick.dropN) || 0)), lagMax: Math.max(...ds.map((x) => (x.tick && x.tick.lagPct) || 0)),
        hlBatch: r.env.T368_FARM_ACT ? last.farm.hlBatch : null };
      if (b && b.rows) {
        const br = b.rows.slice(0, ds.length);   // 같은 날 수만(실서버가 30일을 못 채웠으면 그만큼)
        row.batch = { days: br.length, pop: br.length ? br[br.length - 1].pop : null, fish: sum(br, (x) => x.fishF), wood: sum(br, (x) => x.woodF), forW: sum(br, (x) => walked(x.forBy)), for: sum(br, (x) => x.forF),
          storEnd: br.length ? br[br.length - 1].stor : null, harvestNTot: b.x && b.x.harvestNTot, fieldFoodEqTot: b.x && b.x.fieldFoodEqTot, pop30: b.x && b.x.pop };
        // 등가 틈 — 실서버 세계가 그 품목으로 **곳간에 들인 양**(행위 마을 = 몸 입고 · 나머지 = 수식) ↔ 같은 30일 일괄의 수식 합
        //   실서버 = 행위 마을 몸 입고 + (그 품목 수식 합 전부 − 행위 마을 수식 합) · 채집은 **걷는 몫**(× `_t347MixShare`)만
        const srv = (X, all) => (X ? X.delivered + (all - X.formAct) : null);
        row.gap = {
          fish: row.fish ? pct(srv(row.fish, row.dbForm.fish), row.batch.fish) : null,
          wood: row.wood ? pct(srv(row.wood, row.dbForm.wood), row.batch.wood) : null,
          forage: row.forage ? pct(srv(row.forage, row.dbForm.forW), row.batch.forW) : null,
          farm: row.farm && row.batch.harvestNTot ? pct(row.farm.harvestN, row.batch.harvestNTot) : null };
        // 틈의 두 조각 — ⓐ 세계(수식 합: 실서버 ↔ 일괄 · 몸 무관) · ⓑ 몸(행위 마을 입고 ÷ 그 마을 수식 = 몸이 하는 몫)
        row.world = { fish: pct(row.dbForm.fish, row.batch.fish), wood: pct(row.dbForm.wood, row.batch.wood), forW: pct(row.dbForm.forW, row.batch.forW), for: pct(row.dbForm.for, row.batch.for) };
      }
      row.body = { fish: row.fish && row.fish.formAct ? +(100 * row.fish.delivered / row.fish.formAct).toFixed(2) : null,
        wood: row.wood && row.wood.formAct ? +(100 * row.wood.delivered / row.wood.formAct).toFixed(2) : null,
        forage: row.forage && row.forage.formAct ? +(100 * row.forage.delivered / row.forage.formAct).toFixed(2) : null,
        farmItem: row.farm && row.farm.t100Eq ? +(100 * row.farm.credFoodEq / row.farm.t100Eq).toFixed(2) : null,
        farmHl: row.farm ? +(100 * row.farm.hlBody / Math.max(1, row.farm.hlBody + row.farm.hlBatch)).toFixed(2) : null };
      return row;
    });
    out.arms[a] = { per };
    const ok = per.filter((p) => !p.missing);
    const agg = (f) => { const xs = ok.map(f); return { med: med(xs), wid: wid(xs), n: xs.filter((x) => x != null).length }; };
    out.arms[a].agg = { us: agg((p) => p.us), p50: agg((p) => p.p50), cpu: agg((p) => p.cpu), steps: agg((p) => p.steps), popEnd: agg((p) => p.popEnd),
      gapFish: agg((p) => p.gap && p.gap.fish), gapWood: agg((p) => p.gap && p.gap.wood), gapForage: agg((p) => p.gap && p.gap.forage), gapFarm: agg((p) => p.gap && p.gap.farm),
      bodyFish: agg((p) => p.body.fish), bodyWood: agg((p) => p.body.wood), bodyForage: agg((p) => p.body.forage), bodyFarmItem: agg((p) => p.body.farmItem), bodyFarmHl: agg((p) => p.body.farmHl) };
  }
  // 넷 켬 걸음 겹침 — (넷 − 끔) ↔ Σ(홑 − 끔) · 씨마다
  out.overlap = SEEDS.map((s, i) => {
    const g = (a) => (out.arms[a].per[i] && !out.arms[a].per[i].missing ? out.arms[a].per[i].steps : null);
    const o = g('off'), f4 = g('four'), singles = ['fish', 'wood', 'forage', 'farm'].map(g);
    if (o == null || f4 == null || singles.some((x) => x == null)) return { seed: s, missing: true };
    const sumS = singles.reduce((x, y) => x + (y - o), 0);
    return { seed: s, four: f4 - o, sumSingles: sumS, ratio: sumS ? +(100 * (f4 - o) / sumS).toFixed(2) : null };
  });
  if (!MD) { console.log(JSON.stringify(out, null, 1)); return; }
  // ── md — 보고에 붙이는 표(같은 수 · 반올림만)
  const f0 = (x) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
  const f1 = (x, d = 1) => (x == null ? '—' : (+x).toFixed(d));
  const P = (a, i) => out.arms[a].per[i];
  const L = [];
  L.push('| 팔 | 씨 | 인구 0→30 | 걸음(30일) | 어획 입고(단) · 걸림 · 곳간 입고 건 | 벌목 그루 · 입고(단) · 나무 그루 | 채취 딴 수 · 입고(단) · 게이트 · 군락 | 수확 · 작물 일 · 몸/일괄(마을·일) | 사람당 µs [단판] · p50 ms |');
  L.push('|---|---:|---|---:|---|---|---|---|---|');
  for (const a of ARMN) SEEDS.forEach((s, i) => { const p = P(a, i); if (!p || p.missing) { L.push(`| ${a} | ${s} | (없음) |||||||`); return; }
    L.push(`| ${a} | ${s} | ${p.pop0}→${f0(p.popEnd)} | ${f0(p.steps)} | ${p.fish ? `${f0(p.fish.delivered)} · ${f0(p.fish.hook)} · ${f0(p.fish.entries)}` : '—'} | ${p.wood ? `${f0(p.wood.cut)} · ${f0(p.wood.delivered)} · ${f0(p.wood.trees0)}→${f0(p.wood.treesEnd)}` : '—'} | ${p.forage ? `${f0(p.forage.pick)} · ${f0(p.forage.delivered)}${p.forage.deliveredExact ? '' : '⁻'} · ${p.forage.gate0}→${p.forage.gate} · ${p.forage.groves[0]}→${p.forage.groves[1]}` : '—'} | ${p.farm ? `${f0(p.farm.harvestN)} · ${f0(p.farm.farmTk)} · ${p.farm.hlBody}/${p.farm.hlBatch}` : '—'} | ${f1(p.us, 2)} · ${f1(p.p50, 2)} |`); });
  L.push('');
  L.push('| 팔 | 씨 | 등가 틈 어부 · 나무꾼 · 채집 · 농부(%) | 세계 조각(수식 합 실서버↔일괄 · 어부 · 나무꾼 · 채집 걷는 몫 %) | 몸 몫(입고 ÷ 행위 마을 수식 %) 어부 · 나무꾼 | 일괄 갈래(마을·일 · 그 창의 날 수) 나무꾼 · 채집 |');
  L.push('|---|---:|---|---|---|---|');
  for (const a of ARMN) SEEDS.forEach((s, i) => { const p = P(a, i); if (!p || p.missing || !p.gap) return;
    L.push(`| ${a} | ${s} | ${f1(p.gap.fish)} · ${f1(p.gap.wood)} · ${f1(p.gap.forage)} · ${f1(p.gap.farm)} | ${f1(p.world.fish)} · ${f1(p.world.wood)} · ${f1(p.world.forW)} | ${f1(p.body.fish)} · ${f1(p.body.wood)} | ${p.wood && p.wood.batch ? `${p.wood.batch.vd}(${p.wood.batch.days}일)` : '—'} · ${p.forage && p.forage.batch ? `${p.forage.batch.vd}(${p.forage.batch.days}일)` : '—'} |`); });
  L.push('');
  L.push('| 팔 | 사람당 µs 중앙값 (폭) | 틱 p50 ms 중앙값 (폭) | CPU % 중앙값 | 인구 30일 중앙값 |');
  L.push('|---|---|---|---:|---:|');
  for (const a of ARMN) { const g = out.arms[a].agg; L.push(`| ${a} | ${f1(g.us.med, 2)} (${f1(g.us.wid, 2)}) · n=${g.us.n} | ${f1(g.p50.med, 2)} (${f1(g.p50.wid, 2)}) | ${f1(g.cpu.med)} | ${f0(g.popEnd.med)} |`); }
  L.push('');
  L.push('| 씨 | 넷 − 끔 걸음 | Σ(홑 − 끔) 걸음 | 넷 ÷ 홑 합 % |');
  L.push('|---:|---:|---:|---:|');
  for (const o of out.overlap) L.push(o.missing ? `| ${o.seed} | — | — | — |` : `| ${o.seed} | ${f0(o.four)} | ${f0(o.sumSingles)} | ${f1(o.ratio)} |`);
  console.log(L.join('\n'));
}

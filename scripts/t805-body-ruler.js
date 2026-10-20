#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T805 계측 자 · 제품 무변 · 판정 0)
// === scripts/t805-body-ruler.js — **몸 길 자**: 농부 · 어부 · 나무꾼 · 채집 몸 팔(추상 가1)을 켠 세계를 가상 시계 위 정본 하루로 잰다 =====================
//
// ★왜 [T805 · T801 회부] 서버 기준선 자(T650 · `VILLAGE_DAY_MS=250` · `VILLAGE_NPC_CAP=1`)에선 몸의 낮(24분 `worldPhase`)이 econ 하루(0.25초)와
//   갈리고 마을당 몸이 하나라 켠 몸 팔 넷이 다 0 을 낸다(나무 · 채집 일괄 한도 0 · 낚시 물림 0 · 깬 존 농사 일괄 0). 실제 하루 판(t686 · 24분 벽시계)은
//   한 판 30분에 하루라 작물 한 바퀴(수십~백여 게임일)를 못 본다. 이 자는 둘 사이다:
//     · **하루 = 정본 하루**(`WORLD.dayLengthMs` 24분 — `VILLAGE_DAY_MS` 를 안 준다 ⇒ econ 하루 = 몸의 낮 · 하늘 · 작물 · 생활층 한 시계 · 새 수 0).
//     · **가상 시계**(T745 `scripts/t745-vclock.js` 그대로) — 벽시계 · 타이머를 가상 시각 V 하나에 묶고 30Hz 틱을 쉬지 않고 돌린다(틱 n 의 V = 시작 + n × 33.3 ms).
//       몸이 24분 하루에 하는 걸음 · 일 · 귀환이 그대로 다 일어나고(실시간과 같은 틱 수 · 같은 dt), 벽시계로는 CPU 가 버티는 만큼 빨리 지나간다.
//     · **몸 상한 = 운영 기본**(`VILLAGE_NPC_CAP` 를 안 준다 = 무제한 — econ 주민 하나 = 몸 하나) · 그 밖 손잡이도 다 운영 기본(새 세계 · 손님 0).
//     · 새 세계 = 게임일 0(1년 3월 1일 · 봄) · 시드 = econ 시드(t577 훅 한 칸) — 작물 달력이 봄 파종부터 돈다.
//     · 행위 마을 게이트 — 제품 규약상 켠 첫날은 목록이 비어 있다(나무 · 채집은 `_lifeDaily` 가 첫 경계 뒤에 센다 · 어부는 몸 결정이 센다 —
//       villages.js "하루 시차" 주석). 자는 **첫 경계(날 1)를 지나면 게이트가 다 선 채로** 날 2 부터를 잰 구간으로 둔다(날마다 행위 마을 수를 같이 적는다).
//   잰 것(아이 존 프리로드 넷 — 읽기만): t577 훅(여덟 수 · 끝 날에 멈춤) · SBC 훅(econ 날 지문) · t740 마을 칸 지문 · `scripts/t805-body-hook.js`
//     (팔 넷 관측 창 · econ 직업 수 · 농사 앵커 · 몸 지문 · 실제 시계로 잰 30Hz 틱 본문).
//   ★주사위 — 그 프리로드가 `Math.random` 을 판 씨에 묶는다(마을 몸 결정 씨가 `playerId` 의 무작위 꼬리를 먹어 몸이 걷는 세계는
//     안 묶으면 첫 1초부터 판마다 갈린다 — 보고 T805 §1 · `T805_RANDOM=0` 이면 안 묶는다).
//
// 쓰는 법:
//   node scripts/t805-body-ruler.js [--arms off,A1,A2,A3,A4,ALL] [--days 46] [--seed 1020] [--rep 1] [--par 1] [--dir <판 폴더>] [--out <요약.json>]
//     --rep 2   팔마다 두 판(같은 씨) — 결정론 견줌(econ 날 지문 · 마을 칸 지문 · 몸 지문 · 여덟 수)
//     --par N   동시 판 수(기본 1 — 틱 수가 겹친 판에 흔들리지 않게 · 결정론은 겹쳐도 같아야 한다)
//     --table <판 폴더>   판을 안 띄우고 그 폴더의 판만 표로
//     --r0 2    판 번호를 2 부터(같은 폴더에 둘째 판을 나중에 얹는다 — 표 · 견줌은 폴더 안 판 전부로)
//     --db-dir <폴더>   판 DB 자리만 옮긴다(예: /dev/shm · 세계 · 결과 무변 — 보고 T805 §1)
//   env 는 아이에게 그대로 간다(팔 손잡이는 이 파일이 얹는다 · 그 밖 손잡이를 얹은 트리를 재려면 env 로).
//   판 시간(시드 1020 · 46날 · 혼자 · 2 코어 · main 41f09f91 · 2026-10-19): 끔 27분 · A1 47분 · A2 58분 · A3 29분 · A4 27분 · 다 같이 54분 — 하루 벽초가 몸 수에 따라 큰다(보고 T805 §3).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const H = (s, n) => crypto.createHash('sha1').update(s).digest('hex').slice(0, n);

const ARMS = {
  off: {},
  A1: { T368_FARM_ACT: '1', T100_FIELD_YIELD: '1' },
  A2: { T312_FISH_ACT: '1' },
  A3: { T325_WOOD_ACT: '1' },
  A4: { T347_FORAGE_ACT: '1' },
  ALL: { T368_FARM_ACT: '1', T100_FIELD_YIELD: '1', T312_FISH_ACT: '1', T325_WOOD_ACT: '1', T347_FORAGE_ACT: '1' },
};
const ARM_KEYS = ['T368_FARM_ACT', 'T100_FIELD_YIELD', 'T312_FISH_ACT', 'T325_WOOD_ACT', 'T347_FORAGE_ACT'];
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const D0 = 2;   // 잰 구간의 첫 날(게이트가 다 선 날 — 위 머리말)
const DBDIR = opt('--db-dir', null);   // 판 DB 자리(기본 = 판 폴더 · 예: /dev/shm — 저장 자리만 바뀐다 · 세계 무변)

// ── 판 하나 ────────────────────────────────────────────────────────────────────
function runOne(dir, arm, seed, days, rep, k) {
  return new Promise((resolve) => {
    const tag = `${arm}-${seed}-r${rep}`;
    const out = path.join(dir, `${tag}.json`), logf = path.join(dir, `${tag}.log`), db = path.join(DBDIR || dir, `${tag}.db`);
    for (const f of [out, out + '.sbc.json', out + '.t740.json', out + '.t805.json', db, db + '-wal', db + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    const env = Object.assign({}, process.env);
    for (const kk of ARM_KEYS) delete env[kk];
    delete env.VILLAGE_DAY_MS; delete env.VILLAGE_NPC_CAP;   // ★정본 하루 · 몸 상한 운영 기본(무제한)
    Object.assign(env, ARMS[arm], {
      ZONE_ID: 'hanbando', PORT: String(40100 + ((process.pid + k * 37) % 700)), DB_PATH: db,
      ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
      T577_SEED: String(seed), T577_DAYS: String(days), T577_OUT: out,
      T745_VCLOCK: '1', SBC_HOOK: '1', T805_D0: String(D0),
      T699_ROUTE_CACHE: process.env.T699_ROUTE_CACHE || path.join(os.tmpdir(), 'durango-route-cache'),
      NODE_OPTIONS: [`--require ${path.join(__dirname, 't805-body-hook.js')}`, `--require ${path.join(__dirname, 'server-baseline-check.js')}`,
        `--require ${path.join(__dirname, 't740-side-hook.js')}`, process.env.NODE_OPTIONS || ''].join(' ').trim(),
    });
    const t0 = Date.now();
    const lf = fs.openSync(logf, 'w');
    const ch = spawn(process.execPath, ['-r', path.join(__dirname, 't577-server-hook.js'), path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', lf, lf] });
    const LIM = (parseInt(process.env.T805_LIMIT_S || '', 10) || 3600) * 1000;   // 한 판 1시간 안(카드) — 넘으면 SIGTERM(훅이 그날까지 적는다) · 1분 뒤 SIGKILL
    let cut = false, to2 = null;
    const to = setTimeout(() => { cut = true; try { ch.kill('SIGTERM'); } catch (e) {} to2 = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} }, 60000); }, LIM);
    ch.on('exit', (code, sig) => {
      clearTimeout(to); if (to2) clearTimeout(to2);
      const sec = Math.round((Date.now() - t0) / 1000);
      if (process.env.T805_KEEP_DB !== '1') for (const f of [db, db + '-wal', db + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
      resolve({ tag, arm, seed, rep, days, code, sig, sec, out, logf, cut });
    });
  });
}

// ── 읽기 · 요약 ─────────────────────────────────────────────────────────────────
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function sideCondense(S) {   // server-baseline-check 와 같은 줄이기(칸마다 sha1 8 · 그날 전체 sha1 12)
  if (!S || !S.days) return null;
  const keys = [...new Set(S.days.flatMap((r) => Object.keys(r.f)))].sort();
  return { keys, days: S.days.map((r) => { const hs = keys.map((k) => H(r.f[k] || '∅', 8)); return [r.d, H(hs.join(''), 12), hs]; }) };
}
function summarize(r) {
  const run = J(r.out), sbc = J(r.out + '.sbc.json'), side = J(r.out + '.t740.json'), hk = J(r.out + '.t805.json');
  const o = { tag: r.tag, arm: r.arm, seed: r.seed, rep: r.rep, sec: r.sec, code: r.code, sig: r.sig || null, cut: !!r.cut, ok: !!(run && run.days >= r.days) };
  if (run) Object.assign(o, { days: run.days, eight: run.eight, dissolved: run.dissolved, empty: run.empty, runHash: (() => { const s = Object.assign({}, run); delete s.env; delete s.days; return H(JSON.stringify(s), 16); })() });
  o.econFp = sbc ? sbc.days.map((d) => [d[0], d[2]]) : null;
  o.sideFp = side ? (sideCondense(side) || { days: [] }).days.map((d) => [d[0], d[1], d[2]]) : null;
  o.sideKeys = side ? (sideCondense(side) || { keys: [] }).keys : null;
  if (hk) {
    const rows = (hk.rows || []).filter((x) => x.d != null && !x.err);
    o.bodyFp = rows.map((x) => [x.d, x.body ? x.body.h : null, x.body ? x.body.n : null]);
    o.tick = hk.tick; o.tickWin = hk.tickWin; o.tickWho = hk.tickWho; o.tickOver = hk.tickOver; o.vclock = hk.vclock;
    o.wallPerDay = rows.length > 1 ? +(((rows[rows.length - 1].wall - rows[0].wall) / (rows.length - 1)) / 1000).toFixed(2) : null;
    o.lastDay = rows.length ? rows[rows.length - 1].d : null; o.bootSec = rows.length ? +(rows[0].wall / 1000).toFixed(1) : null;
    o.days_ = rows.map((x) => ({ d: x.d, wd: x.wd, wall: x.wall, econ: x.econ, tick: x.tick, inDay: x.inDay,
      act: { fish: x.fish && x.fish.actVillages, wood: x.wood && x.wood.actVillages, forage: x.forage && x.forage.actVillages } }));
    o.arms = armTotals(rows);
  }
  return o;
}
//   팔 몫 — 잰 구간(날 D0 → 끝): 몸 · 일괄이 곳간에 넣은 것(누계 칸의 차) ↔ 수식이 냈을 것(그날 값의 합 · 앞 줄의 값 = 그 하루의 수요 문 D)
function armTotals(rows) {
  const R = rows.filter((x) => x.d >= D0 - 1);
  if (R.length < 2) return null;
  const a = R[0], b = R[R.length - 1], mid = R.slice(0, -1);
  const out = {};
  const sum = (arm, k) => +mid.reduce((s, x) => s + ((x[arm] && x[arm][k]) || 0), 0).toFixed(3);
  const mx = (arm, k) => Math.max(0, ...R.map((x) => (x[arm] && x[arm][k]) || 0), ...R.map((x) => (x.inDay && x.inDay[arm] && x.inDay[arm][k]) || 0));   // 경계 줄 + 낮 표본(하루 여덟 자리)
  if (b.fish) out.fish = { act: b.fish.actVillages, cells: b.fish.cells, delivered: +(((b.fish.delivered || 0) - ((a.fish && a.fish.delivered) || 0))).toFixed(3), formula: sum('fish', 'formulaPerDay'),
    walkersMax: mx('fish', 'walkers'), t340: b.fish.t340 && a.fish && a.fish.t340 ? { cast: b.fish.t340.cast - a.fish.t340.cast, hook: b.fish.t340.hook - a.fish.t340.hook, abort: b.fish.t340.abort - a.fish.t340.abort, miss: (b.fish.t340.miss || 0) - (a.fish.t340.miss || 0) } : null };
  if (b.wood) out.wood = { act: b.wood.actVillages, delivered: +(((b.wood.delivered || 0) - ((a.wood && a.wood.delivered) || 0))).toFixed(3), formula: sum('wood', 'formulaPerDay'),
    walkersMax: mx('wood', 'walkers'), cutSum: sum('wood', 'cutDay'), capMax: mx('wood', 'cap'), trees0: a.wood && a.wood.trees, trees1: b.wood.trees };
  if (b.forage) out.forage = { act: b.forage.actVillages, gran: +(((b.forage.gran || 0) - ((a.forage && a.forage.gran) || 0))).toFixed(3), delivered: +(((b.forage.delivered || 0) - ((a.forage && a.forage.delivered) || 0))).toFixed(3),
    formulaAct: sum('forage', 'formulaActPerDay'), formula: sum('forage', 'formulaPerDay'), walkersMax: mx('forage', 'walkers'), pickSum: sum('forage', 'pickDay'), groves0: a.forage && a.forage.groves, groves1: b.forage.groves };
  if (b.farm) out.farm = { farmers: b.farm.farmers, workingMax: mx('farm', 'working'), harvestN: (b.farm.harvestN || 0) - ((a.farm && a.farm.harvestN) || 0),
    credFoodEq: +(((b.farm.credFoodEq || 0) - ((a.farm && a.farm.credFoodEq) || 0))).toFixed(3), t100Eq: +(((b.farm.t100Eq || 0) - ((a.farm && a.farm.t100Eq) || 0))).toFixed(3),
    hlBody: b.farm.hlBody, hlBatch: b.farm.hlBatch, firstHarvestDay: (() => { for (const x of rows) if (x.farm && (x.farm.harvestN || 0) > 0) return x.d; return null; })() };
  out.anchor = +mid.reduce((s, x) => s + ((x.econ && x.econ.farmAnchor) || 0), 0).toFixed(3);
  return out;
}
//   두 판 견줌 — 첫 갈림 날(econ 지문 · 마을 칸 지문 · 몸 지문) · 같음이면 null
function firstDiff(A1, B1, colA, colB) {
  if (!A1 || !B1) return 'n/a';
  const m = new Map(B1.map((r) => [r[0], r]));
  for (const r of A1) { const q = m.get(r[0]); if (!q) continue; if (r[colA] !== q[colB === undefined ? colA : colB]) return r[0]; }
  return A1.length && B1.length ? null : 'n/a';
}
function sideFields(a, b, day) {   // 그날 갈린 칸 — 칸 이름으로 맞춘다(판마다 칸 목록이 다를 수 있다 — 한쪽에 아예 안 선 칸은 '없음'(∅)으로 견준다 · server-baseline-check 와 같은 규칙)
  const r = (a.sideFp || []).find((x) => x[0] === day), q = (b.sideFp || []).find((x) => x[0] === day);
  if (!r || !q || !a.sideKeys || !b.sideKeys) return [];
  const E8 = H('∅', 8), ma = new Map(a.sideKeys.map((k, i) => [k, r[2][i]])), mb = new Map(b.sideKeys.map((k, i) => [k, q[2][i]]));
  return [...new Set([...a.sideKeys, ...b.sideKeys])].sort().filter((k) => (ma.has(k) ? ma.get(k) : E8) !== (mb.has(k) ? mb.get(k) : E8));
}
function sideFirstDiff(a, b) {   // → null(같음) | 첫 갈림 날 | 'n/a'
  if (!a.sideFp || !b.sideFp || !a.sideKeys || !b.sideKeys) return 'n/a';
  const days = new Set(b.sideFp.map((x) => x[0]));
  for (const r of a.sideFp) { if (!days.has(r[0])) continue; if (sideFields(a, b, r[0]).length) return r[0]; }
  return null;
}

function table(S) {
  const byArm = {}; for (const s of S) (byArm[s.arm] || (byArm[s.arm] = [])).push(s);
  console.log('\n| 팔 | 판 | 날 | 판 초 | 하루 벽초 | 인구 | 소멸 | 무기Q | 확장셀 | 게시 | 도구Q | 보존식 | 생곡 | 해체 · 빈 | 틱 p50 · p99 · 최대(ms · 잰 구간) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of S) {
    const e = s.eight || {};
    console.log(`| ${s.arm} | r${s.rep} | ${s.days || (s.lastDay != null ? s.lastDay + '(끊김)' : '—')} | ${s.sec} | ${s.wallPerDay ?? '—'} | ${e.pop ?? '—'} | ${e.dead ?? '—'}/${e.ever ?? '—'} | ${e.weapQ ?? '—'} | ${e.expand ?? '—'} | ${e.board ?? '—'} | ${e.toolQ ?? '—'} | ${e.preserve ?? '—'} | ${e.grain ?? '—'} | ${s.dissolved ?? '—'} · ${s.empty ?? '—'} | ${s.tickWin && s.tickWin.n ? `${s.tickWin.p50} · ${s.tickWin.p99} · ${s.tickWin.max}` : (s.tick ? `(통째) ${s.tick.p50} · ${s.tick.p99} · ${s.tick.max}` : '—')} |`);
  }
  console.log(`\n| 팔 | 판 | 어부 몸 입고 ↔ 수식(날 ${D0}~) | 나무 입고 ↔ 수식 | 채집 곳간 ↔ 걷은 몫 수식 | 농부 수확 · 든 식량등가 ↔ 앵커 | 걷는 몸 최대(어 · 나 · 채 · 밭) | 행위 마을(어 · 나 · 채) |`);
  console.log('|---|---|---|---|---|---|---|---|');
  const pc = (x, y) => (y > 0 ? (100 * x / y).toFixed(1) + '%' : '—');
  for (const s of S) {
    const a = s.arms || {};
    const f = a.fish, w = a.wood, g = a.forage, m = a.farm;
    console.log(`| ${s.arm} | r${s.rep} | ${f ? `${f.delivered} ↔ ${f.formula} (${pc(f.delivered, f.formula)})` : '—'} | ${w ? `${w.delivered} ↔ ${w.formula} (${pc(w.delivered, w.formula)})` : '—'} | ${g ? `${g.gran} ↔ ${g.formulaAct} (${pc(g.gran, g.formulaAct)})` : '—'} | ${m ? `${m.harvestN} 건 · ${m.credFoodEq} ↔ ${a.anchor} (첫 수확 날 ${m.firstHarvestDay ?? '—'})` : '—'} | ${[f && f.walkersMax, w && w.walkersMax, g && g.walkersMax, m && m.workingMax].map((x) => x ?? '—').join(' · ')} | ${[f && f.act, w && w.act, g && g.act].map((x) => x ?? '—').join(' · ')} |`);
  }
  const pairs = [];
  for (const arm of Object.keys(byArm)) {
    const L = byArm[arm].filter((s) => s.ok); if (L.length < 2) continue;
    const a = L[0], b = L[1];
    const de = firstDiff(a.econFp, b.econFp, 1), ds = sideFirstDiff(a, b), db = firstDiff(a.bodyFp, b.bodyFp, 1);
    const end = JSON.stringify(a.eight) === JSON.stringify(b.eight) && a.runHash === b.runHash;
    pairs.push({ arm, econ: de, side: ds, sideFields: ds != null && ds !== 'n/a' ? sideFields(a, b, ds) : [], body: db, end });
  }
  if (pairs.length) {
    console.log('\n| 팔 | econ 날 지문 | 마을 칸 지문 | 몸 지문 | 여덟 수 · 판 JSON |');
    console.log('|---|---|---|---|---|');
    for (const p of pairs) console.log(`| ${p.arm} | ${p.econ == null ? '같음' : '날 ' + p.econ + ' 갈림'} | ${p.side == null ? '같음' : '날 ' + p.side + ' 갈림 (' + p.sideFields.slice(0, 6).join(' · ') + ')'} | ${p.body == null ? '같음' : '날 ' + p.body + ' 갈림'} | ${p.end ? '같음' : '다름'} |`);
  }
  return pairs;
}

if (require.main === module) (async () => {
  if (A.includes('--table')) {
    const dir = opt('--table');
    const S = fs.readdirSync(dir).filter((f) => /^[A-Za-z0-9]+-\d+-r\d+\.json(\.t805\.json)?$/.test(f)).map((f) => f.replace(/\.t805\.json$/, '')).filter((f, i, a) => a.indexOf(f) === i).sort().map((f) => { const [arm, seed, rr] = f.replace(/\.json$/, '').split('-'); const hk = J(path.join(dir, f + '.t805.json'));
      return summarize({ tag: f.replace(/\.json$/, ''), arm, seed: +seed, rep: +rr.slice(1), out: path.join(dir, f), days: (J(path.join(dir, f)) || {}).days || 0, sec: hk && hk.wallMs ? Math.round(hk.wallMs / 1000) : null }); });
    const pairs = table(S);
    if (opt('--out')) fs.writeFileSync(opt('--out'), JSON.stringify({ dir, runs: S, pairs }, null, 1));
    return;
  }
  const arms = String(opt('--arms', 'off,A1,A2,A3,A4,ALL')).split(',').filter((x) => ARMS[x]);
  const DAYS = parseInt(opt('--days', '46'), 10);   // ★기본 46 — 시드 1020 새 세계의 첫 수확 물결이 날 46(3월 파종 · 생육 45일 작물 · 보고 T805 §2)
  const SEED = parseInt(opt('--seed', '1020'), 10);
  const REP = Math.max(1, parseInt(opt('--rep', '1'), 10));
  const PAR = Math.max(1, parseInt(opt('--par', '1'), 10));
  const dir = opt('--dir', fs.mkdtempSync(path.join(os.tmpdir(), 't805-')));
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\n=== 몸 길 자(T805) — 팔 ${arms.join(' · ')} · ${DAYS}날 · 시드 ${SEED} · 판마다 ${REP}번 · 동시 ${PAR} · 판 ${dir} ===`);
  console.log(`  조건: 정본 하루(VILLAGE_DAY_MS 없음 = 24분) · 몸 상한 운영 기본(VILLAGE_NPC_CAP 없음) · 가상 시계(T745) · 새 세계 · 손님 0 · 잰 구간 날 ${D0}~${DAYS}`);
  const q = []; let k = 0;
  const R0 = Math.max(1, parseInt(opt('--r0', '1'), 10));   // 판 번호 시작(같은 폴더에 둘째 판을 나중에 얹을 때 `--r0 2`)
  for (let rep = R0; rep < R0 + REP; rep++) for (const arm of arms) q.push([arm, rep, k++]);
  const res = [];
  await Promise.all(Array.from({ length: Math.min(PAR, q.length) }, async () => {
    while (q.length) { const [arm, rep, kk] = q.shift(); const r = await runOne(dir, arm, SEED, DAYS, rep, kk); console.log(`  · ${r.tag} ${r.sec}초(종료 ${r.code}${r.sig ? ' ' + r.sig : ''})`); res.push(r); }
  }));
  res.sort((a, b) => (arms.indexOf(a.arm) - arms.indexOf(b.arm)) || (a.rep - b.rep));
  const S = res.map(summarize);
  const pairs = table(S);
  let head = ''; try { head = require('child_process').execSync('git rev-parse --short=8 HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) {}
  const doc = { made: new Date().toISOString().slice(0, 10), head, days: DAYS, seed: SEED, d0: D0, arms, rep: REP, par: PAR, dir,
    how: `node scripts/t805-body-ruler.js --arms ${arms.join(',')} --days ${DAYS} --seed ${SEED} --rep ${REP} --par ${PAR}`,
    runs: S.map((s) => { const x = Object.assign({}, s); delete x.econFp; delete x.sideFp; delete x.sideKeys; delete x.bodyFp; return x; }), pairs };
  const OUTF = opt('--out', path.join(dir, 'summary.json'));
  fs.writeFileSync(OUTF, JSON.stringify(doc, null, 1));
  console.log(`\n→ ${OUTF}`);
  process.exit(S.every((s) => s.ok) ? 0 : 2);
})().catch((e) => { console.error(e); process.exit(2); });
module.exports = { ARMS, summarize, table, armTotals, firstDiff, sideFirstDiff, sideFields };

#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1268 계측 자 · 제품 무변 · 판정 0)
// === scripts/t1268-artisan-live.js — **장인 몸이 곳간을 움직이는 길**을 재는 짧은 라이브 시계 판(T1268 · 2026-11-11 · T1258 회부 1) ==================
//
// ★왜 [T1258 회부 1] 판 자 하루(250ms)는 장인 머묾(인출 5초 · 저장 6초 · 제작 20 ~ 180초)보다 짧아 작업표가 판 자 · 기준선에선 **늘 이튿날 일괄**로 든다 —
//   서버 기준선은 장인 몸(`T1196_ARTISAN_ACT` · `T1258_ARTISAN_CLOCK` 켬 기본)이 그날 안에 곳간을 움직이는 몫을 안 잰다. 이 자는 그 몫을 표로 낸다.
// ★판 — 판 자(`t577-server-run.js`) 그대로 + 세 칸만: 하루 길이 `VILLAGE_DAY_MS`(기본 240,000 = 4분 · 가상 시계 없음 = 벽시계 라이브) ·
//   몸 상한 `VILLAGE_NPC_CAP=Infinity`(몸 전부 — 운영 기본) · 캐러밴 몸 켬(`VILLAGE_CARAVAN_MAX` 안 줌 — 운영 기본). 집 행위 켬(판 자 기본 · 제품 기본).
//   부르는 쪽 env 는 아이까지 그대로 간다(손잡이를 켠 트리를 재려면 env 를 얹는다).
// ★재는 것(아이 존 프리로드 — 읽기만 · 세계에 0):
//   · 몸이 넣음 — `sim/economy-sim.js` `artisanGive`(몸 걸음 `_t1196Step` 만 부른다) 앞에 서서 [그 순간 econ 날 · 마을 · 작업표 직업 · 작업표 날 · 품목 몫]
//     → **그날 안**(econ 날 = 작업표 날 — 이튿날 머리 일괄 전에 몸이 다 했다) · **이튿날 뒤**(몸이 재료를 든 채 날을 넘겨 넣었다)
//   · 일괄 — 날마다 사건 장부 `scanDay`(econ 하루 끝)에 작업표 줄(`_t1196Q`)을 견줘 사라진 표 중 몸이 안 넣은 것: 꺼내기 전(`st` 0) = 이튿날 일괄 · 든 채(`st` 1) = 늦음(사흘)
//   · 맞대기 — 마을 셈(`_t1196C` made · body · batch · late)의 날마다 차와 위 두 셈이 맞는지
// 쓰는 법: node scripts/t1268-artisan-live.js [--days 10] [--seed 42] [--day-ms 240000] [--out 계측/T1268_2026-11-11/장인라이브]
//   끝 줄: `ARTISAN-LIVE · 몸 ○(그날 ○ · 이튿날 뒤 ○) / 일괄 ○ · 늦음 ○ · …`
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const JOB_OUT = { mason: 'tool', smith: 'weapon', armorsmith: 'armor', tailor: 'clothes', cook: 'cooked_food' };

// ══ 아이 존 프리로드 ══════════════════════════════════════════════════════════════════
if (require.main !== module) {
  if (process.env.T1268_LIVE !== '1' || !process.env.T577_OUT) return;
  const OUT = process.env.T577_OUT + '.t1268art.json';
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  let W = null;
  const gives = [];   // [econ 날 · 마을 · 직업 · 작업표 날 · 몫(품목 → 양) · 벽시계 ms(판 머리에서)]
  const T0 = Date.now();
  const ag = E.artisanGive;
  E.artisanGive = function (v, id) {
    const Q = v && v._t1196Q, t = Q ? Q.find((x) => x.id === id) : null;
    const snap = t ? { job: t.job, day: t.day, give: Object.assign({}, t.give), f: t.f, st: t.st } : null;
    const r = ag.apply(this, arguments);
    try { if (r && snap) gives.push([W ? W.day : null, v.name, snap.job, snap.day, Object.fromEntries(Object.entries(snap.give).map(([k, q]) => [k, +(q * snap.f).toFixed(6)])), Date.now() - T0, id]); } catch (e) {}
    return r;
  };
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const mkP = V2.tickWorldV2Parts;
  if (typeof mkP === 'function') V2.tickWorldV2Parts = function (world) { W = world; return mkP.apply(this, arguments); };
  const prevQ = new Map(), prevC = new Map(), bodyIds = new Set();
  const days = [];   // [scanDay 날 · { 마을: { made, body, batch, late, short } (셈 차) } · 사라진 표 [마을 · id · 직업 · 날 · st · 몫] · 새 표 [마을 · 직업 · 날]]
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments); const sd = L.scanDay; let last = -1;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last) {
          last = d; W = world;
          for (const g of gives) bodyIds.add(g[1] + ':' + g[6]);
          const dC = {}, gone = [], born = [];
          for (const v of world.villages || []) {
            const C = v._t1196C || {}, p = prevC.get(v.name) || {}, o = {};
            for (const k of ['made', 'body', 'batch', 'late', 'short']) { const x = (C[k] || 0) - (p[k] || 0); if (x) o[k] = x; }
            if (Object.keys(o).length) dC[v.name] = o;
            prevC.set(v.name, Object.assign({}, C));
            const cur = new Map((v._t1196Q || []).map((t) => [t.id, { job: t.job, day: t.day, st: t.st, give: Object.assign({}, t.give), f: t.f }]));
            const pq = prevQ.get(v.name) || new Map();
            for (const [id, t] of pq) if (!cur.has(id) && !bodyIds.has(v.name + ':' + id)) gone.push([v.name, id, t.job, t.day, t.st, t.give]);
            for (const [id, t] of cur) if (!pq.has(id)) born.push([v.name, t.job, t.day]);
            prevQ.set(v.name, cur);
          }
          days.push([d, world.day, Date.now() - T0, dC, gone, born]);
        }
      } catch (e) { /* 관찰 실패는 세계에 0 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
  process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify({ env: { T1258_ARTISAN_CLOCK: process.env.T1258_ARTISAN_CLOCK ?? null, T1253_CLOCK_FIX: process.env.T1253_CLOCK_FIX ?? null, T1196_ARTISAN_ACT: process.env.T1196_ARTISAN_ACT ?? null, VILLAGE_DAY_MS: process.env.VILLAGE_DAY_MS, VILLAGE_NPC_CAP: process.env.VILLAGE_NPC_CAP ?? null }, gives, days })); } catch (e) {} });
  return;
}

// ══ 바깥 ══════════════════════════════════════════════════════════════════════════════
const { spawn } = require('child_process');
const os = require('os');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const DAYS = parseInt(opt('--days', '10'), 10), SEED = parseInt(opt('--seed', '42'), 10), DAY_MS = parseInt(opt('--day-ms', '240000'), 10);
const OUTP = opt('--out', null);
const TABLE = opt('--table', null);   // 이미 돈 판의 .t1268art.json 만 읽어 표(세계를 안 세운다)
const fmt = (x) => (Math.round(x * 1000) / 1000).toString();
function report(J, sec) {
  const L = [];
  const say = (s) => { L.push(s); console.log(s); };
  //   몸 넣음: 그날 안(econ 날 = 작업표 날) · 이튿날 뒤
  const byDay = new Map(), byJob = {};
  const row = (d) => { if (!byDay.has(d)) byDay.set(d, { made: 0, same: 0, later: 0, batch: 0, late: 0, cB: 0, cBa: 0, cL: 0, cM: 0 }); return byDay.get(d); };
  const job = (j) => (byJob[j] || (byJob[j] = { same: 0, later: 0, batch: 0, late: 0, qBody: 0, qBatch: 0 }));
  const sumQ = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  for (const g of J.gives) { const [cur, , jb, td, q] = g; const r = row(td); const J2 = job(jb); if (cur === td) { r.same++; J2.same++; } else { r.later++; J2.later++; } J2.qBody += sumQ(q); }
  for (const [d, , , dC, gone, born] of J.days) {
    for (const [, , jb, td, st, give] of gone) { const r = row(td); const J2 = job(jb); if (st === 0) { r.batch++; J2.batch++; J2.qBatch += sumQ(give); } else { r.late++; J2.late++; } }
    for (const [, , td] of born) row(td).made++;
    const r = row(d); for (const o of Object.values(dC)) { r.cB += o.body || 0; r.cBa += o.batch || 0; r.cL += o.late || 0; r.cM += o.made || 0; }
  }
  const tot = { made: 0, same: 0, later: 0, batch: 0, late: 0, cB: 0, cBa: 0, cL: 0, cM: 0 };
  for (const r of byDay.values()) for (const k in tot) tot[k] += r[k];
  const wallDay = J.days.length > 1 ? (J.days[J.days.length - 1][2] - J.days[0][2]) / (J.days.length - 1) : null;
  say(`\n## 장인 몸 몫 — 라이브 시계 판(하루 ${DAY_MS.toLocaleString()}ms · 가상 시계 없음 · 몸 전부 · 시드 ${SEED} · ${DAYS}날)`);
  say(`\n* 손잡이(아이 존 env): ${JSON.stringify(J.env)} · econ 날 벽시계 평균 ${wallDay ? Math.round(wallDay).toLocaleString() : '?'}ms${sec ? ` · 판 ${sec}초` : ''}`);
  //   끝에 남음 = 선 작업표 − (몸 · 일괄 · 늦음) — 판 끝에 아직 줄에 있는 표(끝 날 표 · 손에 든 표)
  say('\n| 작업표 날 | 선 작업표 | 몸 — 그날 안 | 몸 — 이튿날 뒤 | 이튿날 일괄 | 늦음(사흘) | 판 끝에 남음 | 맞대기: 그 날 셈 차 made · body · batch · late |');
  say('|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const d of [...byDay.keys()].sort((a, b) => a - b)) { const r = byDay.get(d); say(`| ${d} | ${r.made} | ${r.same} | ${r.later} | ${r.batch} | ${r.late} | ${r.made - r.same - r.later - r.batch - r.late} | ${r.cM} · ${r.cB} · ${r.cBa} · ${r.cL} |`); }
  say(`| 합 | ${tot.made} | ${tot.same} | ${tot.later} | ${tot.batch} | ${tot.late} | ${tot.made - tot.same - tot.later - tot.batch - tot.late} | ${tot.cM} · ${tot.cB} · ${tot.cBa} · ${tot.cL} |`);
  //   몸이 넣은 때 — 그 순간 econ 날 ← 작업표 날(몇 날 뒤에 넣었나) · 마지막 몸 넣음의 벽시계
  const lag = {}; for (const g of J.gives) { const k = `${g[0]}←${g[3]}`; lag[k] = (lag[k] || 0) + 1; }
  const lastG = J.gives.length ? J.gives[J.gives.length - 1] : null;
  say(`\n* 몸이 넣은 날 ← 작업표 날: ${Object.entries(lag).map(([k, n]) => `${k} ${n}`).join(' · ') || '없음'}${lastG ? ` · 마지막 몸 넣음 = 판 머리 뒤 ${Math.round(lastG[5] / 1000)}초(econ 날 ${lastG[0]})` : ''}`);
  say(`* scanDay 벽시계(판 머리 뒤 초): ${J.days.map((d) => `${d[0]}:${Math.round(d[2] / 1000)}`).join(' · ')}`);
  say('\n| 직업(산출) | 몸 — 그날 안 | 몸 — 이튿날 뒤 | 이튿날 일괄 | 늦음 | 몸이 넣은 양 | 일괄이 넣은 양 | 몸 몫(양) |');
  say('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const j of Object.keys(byJob).sort()) { const x = byJob[j]; const q = x.qBody + x.qBatch; say(`| ${j}(${JOB_OUT[j] || '?'}) | ${x.same} | ${x.later} | ${x.batch} | ${x.late} | ${fmt(x.qBody)} | ${fmt(x.qBatch)} | ${q ? (100 * x.qBody / q).toFixed(1) + '%' : '—'} |`); }
  const body = tot.same + tot.later, n = body + tot.batch;
  const last = `ARTISAN-LIVE · 몸 ${body}(그날 ${tot.same} · 이튿날 뒤 ${tot.later}) / 일괄 ${tot.batch} · 늦음 ${tot.late} · 몸 몫 ${n ? (100 * body / n).toFixed(1) : '—'}% · 셈 맞대기 몸 ${tot.cB} · 일괄 ${tot.cBa} · 늦음 ${tot.cL}${tot.cB === body && tot.cBa === tot.batch && tot.cL === tot.late ? ' (맞음)' : ' (어긋남)'} · 하루 ${DAY_MS}ms · ${DAYS}날 · 시드 ${SEED}`;
  say('\n' + last);
  return { text: L.join('\n'), last, tot, byJob, byDay: Object.fromEntries(byDay) };
}
if (TABLE) { const J = JSON.parse(fs.readFileSync(TABLE, 'utf8')); report(J, null); process.exit(0); }
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 't1268-live-'));
const env = Object.assign({}, process.env, {
  T1268_LIVE: '1', T577_DIR: DIR, T577_TAG: 'art', T577_PAR: '1', VILLAGE_DAY_MS: String(DAY_MS), VILLAGE_NPC_CAP: process.env.VILLAGE_NPC_CAP || 'Infinity',
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${__filename}`.trim(),
});
delete env.T745_VCLOCK;
let ch = null;
const cleanup = () => { if (ch) { try { process.kill(-ch.pid, 'SIGKILL'); } catch (e) {} ch = null; } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} };
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(2); });
console.log(`=== 장인 몸 라이브 시계 판 — 하루 ${DAY_MS}ms · ${DAYS}날 · 시드 ${SEED} · 몸 상한 ${env.VILLAGE_NPC_CAP} · 판 ${DIR} ===`);
const t0 = Date.now();
ch = spawn(process.execPath, [path.join(__dirname, 't577-server-run.js'), String(DAYS), String(SEED)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
ch.stdout.on('data', (b) => process.stdout.write(b)); ch.stderr.on('data', (b) => process.stderr.write(b));
ch.on('close', (code) => {
  ch = null;
  const sec = Math.round((Date.now() - t0) / 1000);
  const f = path.join(DIR, `art-${SEED}.json.t1268art.json`);
  let J = null; try { J = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  if (!J) { console.log(`ARTISAN-LIVE FAIL · 판 실패(나감 ${code}) · ${sec}초 · 로그 ${DIR}`); process.exit(2); }
  const R = report(J, sec);
  if (OUTP) { fs.mkdirSync(path.dirname(path.resolve(OUTP)), { recursive: true }); fs.writeFileSync(OUTP + '.md', R.text + '\n'); fs.writeFileSync(OUTP + '.json', JSON.stringify(J)); console.log(`→ ${OUTP}.md · ${OUTP}.json`); }
  cleanup();
  process.exit(code === 0 ? 0 : 1);
});

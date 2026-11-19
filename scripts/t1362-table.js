#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1362 판 표 · 읽기만 · 제품 무변)
// === scripts/t1362-table.js — 짐승 몸 환율 판(`t1331-run.js` 판 로그)에서 표를 만든다 (손으로 세지 않는다) =====================
//   쓰는 법:
//     node scripts/t1362-table.js <판 폴더> [--md <출력.md>] [--json <출력.json>]     — 폴더의 <표지>.probe.jsonl(.gz) 마다 한 줄
//     node scripts/t1362-table.js --rows <판.db> <출력.json>                            — 판 DB 의 행 수(몸 표 · 전체)를 적는다(판 끝에 · DB 는 그 뒤 지운다)
//     node scripts/t1362-table.js --hist [마리/km²]                                       — 고증 밀도 → 환율(T1331 보고 §8-1 의 식 · 아래 HIST)
//   판 폴더에서 읽는 것(표지마다): .probe.jsonl(.gz)(T1331 탐침 줄 — 날마다) · .done(t1331-run 끝 · env) · .wrap.json(벽 · 끝 코드 · timeout) ·
//     .hwm(존 프로세스 VmHWM 표본 — 메모리 꼭대기) · .rows.json(--rows 결과) · .log.tail(FATAL · 멈춤 표시).
//   칸: 환율 · 씨 · 목표 날 · 닿은 날 · 몸 수(처음 · 끝 · 최고) · CPU 초/날(프로세스 실 CPU 차 ÷ 날 — t1331-analyze 와 같은 셈) · DB 행(t1331_body · 전체) ·
//     메모리 꼭대기(VmHWM MB · 힙 MB) · 사냥 죽음 · 굶음 · 사냥 고기 kg/날(econ 사냥꾼 몫 × 2,450 ÷ 1,500 — t1331-analyze 와 같은 셈) ·
//     종별 날 100 · 200 · 300 · 400 수 · 인구 끝 · 끔비(같은 씨 끔 판 인구 · 고기 대비).
//   끔(장부) 판의 "몸" = 장부 합 ÷ 5,000(종 = 랩 먹잇감 섞음 3 : 1 : 2 — t1331-analyze 와 같은 읽기).
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const A = process.argv.slice(2);
const KG = 2450 / 1500;
const OFF_SCALE = 5000, MIX = { deer: 3 / 6, wild_boar: 1 / 6, arctic_hare: 2 / 6 };
const DAYS_AT = [100, 200, 300, 400];
// ★고증 밀도 → 환율(T1331 보고 §8-1 의 식 그대로: 몸 = 장부 합 ÷ 환율). 몸 수 = 밀도 × 서식 면적이면
//   환율 = 장부 합 ÷ (밀도 × 서식 면적) = (칸당 K × 칸 수) ÷ (밀도 × 칸 수 × 칸 면적) = K ÷ (밀도 × 칸 면적).
//   칸 면적(실제) = 장부 2칸 표본(2 × 2 = 4 칸 · 1 칸 = 1 m — beast-body STEPS 머리말) × 거리 4× 압축(면적 16× — wildlife.js 고증 머리말) = 64 m² = 6.4e-5 km².
const HIST = { K: 100, cellKm2: 4 * 16 / 1e6, ledger: 14986800, cells: 149868 };
const histRate = (d) => HIST.K / (d * HIST.cellKm2);

if (A[0] === '--hist') {
  const ds = A[1] ? [parseFloat(A[1])] : [10, 15, 20];
  for (const d of ds) { const r = histRate(d); console.log(`${d} 마리/km² → 환율 ${r.toFixed(0)} → 한반도 몸 ${(HIST.ledger / r).toFixed(1)} (서식 ${(HIST.cells * HIST.cellKm2).toFixed(2)} km²)`); }
  process.exit(0);
}
if (A[0] === '--rows') {
  const Db = require('better-sqlite3');
  const db = new Db(A[1], { readonly: true, fileMustExist: true });
  const tabs = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  const by = {}; let total = 0;
  for (const t of tabs) { const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n; by[t] = n; total += n; }
  let bytes = 0; for (const f of [A[1], A[1] + '-wal']) { try { bytes += fs.statSync(f).size; } catch (e) {} }
  fs.writeFileSync(A[2], JSON.stringify({ body: by.t1331_body || 0, hab: by.t1331_hab || 0, total, bytes, by }) + '\n');
  console.log(`[t1362-table] rows body ${by.t1331_body || 0} · total ${total} · ${(bytes / 1048576).toFixed(1)} MB`);
  process.exit(0);
}

const jOut = A.includes('--json') ? A[A.indexOf('--json') + 1] : null;
const mOut = A.includes('--md') ? A[A.indexOf('--md') + 1] : null;
const DIR = A.find((x, i) => !x.startsWith('--') && !['--json', '--md'].includes(A[i - 1]));
if (!DIR) { console.error('쓰는 법: <판 폴더> [--md 출력] [--json 출력] | --rows <db> <출력> | --hist [마리/km²]'); process.exit(2); }
const rd = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : fs.existsSync(f + '.gz') ? zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8') : null);
const rj = (f) => { try { const s = rd(f); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const tags = [...new Set(fs.readdirSync(DIR).filter((f) => /\.(probe\.jsonl(\.gz)?|done)$/.test(f)).map((f) => f.replace(/\.(probe\.jsonl(\.gz)?|done)$/, '')))];

const R = {};
for (const tag of tags) {
  const L = (rd(path.join(DIR, tag + '.probe.jsonl')) || '').trim().split('\n').map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter((o) => o && o.d != null && !o.err);
  const done = rj(path.join(DIR, tag + '.done')), wrap = rj(path.join(DIR, tag + '.wrap.json')), rows = rj(path.join(DIR, tag + '.rows.json'));
  const envs = String((done && done.env) || '').split(',').filter(Boolean);
  const env = {}; for (const kv of envs) { const i = kv.indexOf('='); env[kv.slice(0, i)] = kv.slice(i + 1); }
  const on = L.some((o) => o.body && o.body.w) || env.T1331_BEAST_BODY === '1';
  const scale = L.some((o) => o.body && o.body.w) ? (L.find((o) => o.body && o.body.w).body.w.scale) : on ? +(env.T1331_BEAST_SCALE || 5000) : null;
  const m = tag.match(/-(\d+)$/), seed = done ? +done.seed : (m ? +m[1] : null);
  const target = done ? +done.days : (wrap && wrap.days) || null;
  const hwm = (rd(path.join(DIR, tag + '.hwm')) || '').split('\n').map((s) => parseInt((s.match(/(\d+)\s*kB/) || [])[1], 10)).filter((n) => n > 0);
  const tail = rd(path.join(DIR, tag + '.log.tail')) || '';
  // 탐침 줄 하나도 없이 죽은 판(첫 하루 경계 전) — 존 로그의 마지막 게임날 표시(`D<날>` · `econ d<날>`)로 죽은 날을 읽는다
  const logAll = rd(path.join(DIR, tag + '.log')) || tail;
  const logDay = Math.max(0, ...[...logAll.matchAll(/(?:\[도적\] D|econ d)(\d{1,4})\b/g)].map((x) => +x[1]).filter((x) => x < 10000));
  const n = (o) => (on ? (o.body && o.body.w ? o.body.w.alive : 0) : Math.floor(o.sum / OFF_SCALE));
  const by = (o) => { if (on) return (o.body && o.body.w && o.body.w.by) || {}; const b = {}; for (const k in MIX) b[k] = Math.floor(o.sum / OFF_SCALE * MIX[k]); return b; };
  const at = (d) => { let best = null; for (const o of L) if (o.d <= d) best = o; return best && best.d === d ? best : null; };
  const cpu = (o) => (o.cpu ? (o.cpu.user + o.cpu.system) / 1e6 : NaN);
  const L1 = L.find((o) => o.d >= 2) || L[0], LN = L[L.length - 1];
  const ns = L.map(n), nz = ns.filter((x) => x > 0);
  const meat = L.map((o) => o.meat || 0);
  const b = on && LN ? LN.body : null;
  R[tag] = {
    tag, on, scale: on ? scale : 'off', seed, target, reached: LN ? LN.d : 0,
    finished: !!(done && done.code === 0 && LN && LN.d >= target - 1),
    exit: wrap ? wrap.rc : null, wall: wrap ? wrap.wall : (done ? +done.sec : null), timeout: wrap ? wrap.timeout : null,
    fatal: /FATAL|heap out of memory/i.test(tail), logDay,
    start: nz.length ? nz[0] : 0, end: LN ? n(LN) : 0, max: ns.length ? Math.max(...ns) : 0,
    cpuSecDay: (LN && L1 && LN.d > L1.d) ? +((cpu(LN) - cpu(L1)) / (LN.d - L1.d)).toFixed(3) : null,
    cpuLast10: (() => { const k = L.filter((o) => o.d >= LN.d - 10); return k.length > 1 ? +((cpu(k[k.length - 1]) - cpu(k[0])) / (k[k.length - 1].d - k[0].d)).toFixed(3) : null; })(),
    dbBody: rows ? rows.body : null, dbTotal: rows ? rows.total : null, dbMB: rows ? +(rows.bytes / 1048576).toFixed(1) : null,
    rssMB: hwm.length ? Math.round(Math.max(...hwm) / 1024) : null,
    heapMB: L.length ? Math.round(Math.max(...L.map((o) => o.mem || 0)) / 1048576) : null,
    huntKill: b ? (b.huntKill || 0) : null, starve: b ? (b.starve || 0) : null, born: b && b.w ? b.w.st.born : null, mismatch: b && b.w ? b.w.st.mismatch : null,
    meatKgDay: meat.length ? +(meat.reduce((a, x) => a + x, 0) / meat.length * KG).toFixed(1) : null,
    pop: LN ? LN.pop : null,
    sp: Object.fromEntries(DAYS_AT.map((d) => { const o = at(d); return [d, o ? by(o) : null]; })),
    ledgerSum: !on && LN ? LN.sum : null,
  };
}
// 끔비 — 같은 씨 끔 판의 인구 · 고기 · 같은 날(판이 짧으면 그 날의 끔 판 줄과 견준다)
for (const r of Object.values(R)) {
  const off = Object.values(R).find((x) => !x.on && x.seed === r.seed);
  if (!off || r === off || r.pop == null) { r.popRatio = r === off ? 1 : null; r.meatRatio = r === off ? 1 : null; continue; }
  r.popRatio = off.pop ? +(r.pop / off.pop).toFixed(3) : null;
  r.meatRatio = off.meatKgDay ? +(r.meatKgDay / off.meatKgDay).toFixed(3) : null;
  if (r.reached < off.reached) {   // 짧은 판 — 끔 판의 같은 날 줄과 견준다
    const L = (rd(path.join(DIR, off.tag + '.probe.jsonl')) || '').trim().split('\n').map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter((o) => o && o.d != null && !o.err);
    const o = L.filter((x) => x.d <= r.reached).pop(), mm = L.filter((x) => x.d <= r.reached).map((x) => x.meat || 0);
    if (o) { r.popRatio = +(r.pop / o.pop).toFixed(3); r.offPopSameDay = o.pop; }
    if (mm.length) r.meatRatio = +(r.meatKgDay / (mm.reduce((a, x) => a + x, 0) / mm.length * KG)).toFixed(3);
  }
}
const order = Object.values(R).sort((a, b) => (a.seed - b.seed) || ((a.on ? a.scale : 1e12) < (b.on ? b.scale : 1e12) ? 1 : -1));
const f = (x) => (x == null ? '—' : typeof x === 'number' ? x.toLocaleString('en-US') : x);
const spS = (o) => (o ? `${f(o.deer || 0)} · ${f(o.wild_boar || 0)} · ${f(o.arctic_hare || 0)}` : '—');
const lines = [];
lines.push('| 판 | 환율 | 씨 | 날(닿음/목표) | 몸 처음 → 끝(최고) | CPU 초/날(끝 10날) | DB 행 몸 · 전체(MB) | 메모리 꼭대기 RSS · 힙 MB | 사냥 죽음 · 굶음 · 태어남 | 사냥 고기 kg/날 | 종 날 100 | 종 날 200 | 종 날 300 | 종 날 400 | 인구 끝 | 끔비 인구 · 고기 | 끝 |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of order) {
  const endS = r.finished ? '끝' : r.fatal ? `죽음(FATAL 힙 · 탐침 날 ${r.reached} · 로그 날 D${r.logDay} · 그때 저장된 몸 ${f(r.dbBody)})` : r.exit === 124 ? `timeout ${r.timeout}초(날 ${r.reached})` : `멈춤(날 ${r.reached} · 코드 ${r.exit})`;
  lines.push(`| ${r.tag} | ${r.on ? f(r.scale) : '끔(장부 ÷ 5,000)'} | ${r.seed} | ${r.reached}/${r.target} | ${f(r.start)} → ${f(r.end)}(${f(r.max)}) | ${f(r.cpuSecDay)}(${f(r.cpuLast10)}) | ${f(r.dbBody)} · ${f(r.dbTotal)}(${f(r.dbMB)}) | ${f(r.rssMB)} · ${f(r.heapMB)} | ${r.on ? `${f(r.huntKill)} · ${f(r.starve)} · ${f(r.born)}` : '—'} | ${f(r.meatKgDay)} | ${DAYS_AT.map((d) => spS(r.sp[d])).join(' | ')} | ${f(r.pop)} | ${f(r.popRatio)} · ${f(r.meatRatio)} | ${endS}(벽 ${f(r.wall)}초) |`);
}
const md = lines.join('\n') + '\n\n종 = 사슴 · 멧돼지 · 토끼(끔 판은 장부 합 ÷ 5,000 을 3 : 1 : 2 로 — t1331-analyze 읽기). 고증 환율 = ' +
  [10, 15, 20].map((d) => `${d} 마리/km² → ${f(Math.round(histRate(d)))}`).join(' · ') + '(K ÷ (밀도 × 칸 면적 64 m²)).\n';
console.log(md);
if (mOut) fs.writeFileSync(mOut, md);
if (jOut) fs.writeFileSync(jOut, JSON.stringify(R, null, 1) + '\n');

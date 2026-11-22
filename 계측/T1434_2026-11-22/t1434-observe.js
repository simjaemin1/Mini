'use strict';
// === 계측/T1434_2026-11-22/t1434-observe.js — 긴 서버 판 곁 관찰기(읽기만 · 세계 무변) ===
//   쓰는 법: T1434_OBS=<폴더> NODE_OPTIONS="--max-old-space-size=6144 -r <이 파일>" node scripts/t1308-long-run.js 1460 <시드> --every 1460 --dir <판 폴더>
//   100날마다 한 줄(`obs-<시드>.jsonl` 에 덧붙임 — 판이 죽어도 앞 줄은 남는다):
//     날 · 인구 · 산 마을(사람 > 0) · RSS MB · 힙 쓴 것 / 한도 MB(v8) · DB MB(`DB_PATH` + -wal) ·
//     하루 벽시계 초(그 100날 평균 · /proc/uptime — 가상 시계가 Date · hrtime 을 V 에 묶으므로 커널 시계로 잰다) ·
//     하루 최대 벽시계 초 · 틱 최대 ms(이벤트 고리 지연 최대 — libuv 시계 · 한 콜백이 고리를 막은 가장 긴 시간)
//   날마다 `last-<시드>.json` 을 덮어쓴다(날 · RSS · 힙) — 힙이 넘쳐 죽으면 그날 값이 남는다.
//   econ `tickVillage` 를 감싸 날이 바뀌는 순간을 잡는다(인자 · 돌려주는 값 그대로).
const path = require('path'), fs = require('fs'), v8 = require('v8');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1434_OBS; if (!DIR) return;
const ROOT = path.resolve(path.dirname(A1), '..');
const SEED = process.env.T577_SEED;
const LINES = path.join(DIR, `obs-${SEED}.jsonl`), LAST = path.join(DIR, `last-${SEED}.json`);
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
let H = null; try { H = require('perf_hooks').monitorEventLoopDelay({ resolution: 20 }); H.enable(); } catch (e) { H = null; }
const up = () => { try { return parseFloat(fs.readFileSync('/proc/uptime', 'utf8')); } catch (e) { return NaN; } };
const MB = (b) => Math.round(b / 1048576);
const dbMB = () => { let s = 0; const p = process.env.DB_PATH; if (p) for (const f of [p, p + '-wal']) { try { s += fs.statSync(f).size; } catch (e) {} } return MB(s); };
let last = -1, t0 = up(), tDay = t0, maxDay = 0, nDay = 0, sumDay = 0;
function line(day) {
  let pop = 0, live = 0, vills = 0;
  try {
    const P = require(path.join(ROOT, 'server', 'villages')).__labProbe._t569Probe.setup();
    for (const vil of (P.villages || [])) { const e = vil.econ; if (!e) continue; vills++; const n = (e.npcs || []).length; pop += n; if (n > 0) live++; }
  } catch (e) {}
  const m = process.memoryUsage(), hs = v8.getHeapStatistics();
  const row = { day, pop, live, vills, rssMB: MB(m.rss), heapMB: MB(hs.used_heap_size), heapLimitMB: MB(hs.heap_size_limit), dbMB: dbMB(),
    secPerDay: nDay ? +(sumDay / nDay).toFixed(2) : null, secDayMax: +maxDay.toFixed(2), tickMaxMs: H ? Math.round(H.max / 1e6) : null };
  try { fs.appendFileSync(LINES, JSON.stringify(row) + '\n'); } catch (e) {}
  nDay = 0; sumDay = 0; maxDay = 0; if (H) H.reset();
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  if (day !== last) {
    if (last > 0) {
      const now = up(), dt = now - tDay; tDay = now; nDay++; sumDay += dt; if (dt > maxDay) maxDay = dt;
      try { const m = process.memoryUsage(); fs.writeFileSync(LAST, JSON.stringify({ day: last, rssMB: MB(m.rss), heapMB: MB(v8.getHeapStatistics().used_heap_size) })); } catch (e) {}
      if (last % 100 === 0) line(last);
    }
    last = day;
  }
  return _t.apply(this, arguments);
};
process.on('exit', () => { if (last > 0 && last % 100 !== 0) line(last); });

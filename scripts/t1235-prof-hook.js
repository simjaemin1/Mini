// (@regress 없음 — 계측 훅 · 러너 밖 · T1235 · 판정 0)
// === scripts/t1235-prof-hook.js — 큰 인구 · 집 켬 판이 왜 느린가: 날마다 CPU 초 · 인구 · 몸 · 집 · 밭 칸 + 느린 날 CPU 프로파일 ===
//
// 쓰는 법(존 아이에 프리로드 — 세계에 손대지 않는다):
//   NODE_OPTIONS="--require $PWD/scripts/t745-vclock.js --require $PWD/scripts/t1235-prof-hook.js" T745_VCLOCK=1 \
//     T1235_OUT=/tmp/t1235/run node scripts/t577-server-run.js 720 7
//   · 날마다 한 줄 `<OUT>.<시드>.days.jsonl` — [econ 날 · 그날 CPU 초(사용자+시스템) · 인구 · 몸(isNpc) · 집 칸 · 밭 칸]
//   · 그날 CPU 가 `T1235_SLOW`(기본 20)초를 처음 넘으면 다음 `T1235_PROF_DAYS`(기본 2)날 CPU 프로파일 → `<OUT>.<시드>.cpuprofile`
//   · `T1235_PROF_AT=<날>` 이면 그 날부터 프로파일(느린 날을 안 기다림)
//   ⚠가상 시계 판은 Date · hrtime 이 묶이므로 시간은 `process.cpuUsage()`(묶이지 않음)로 잰다.
'use strict';
const path = require('path');
const fs = require('fs');
const OUT = process.env.T1235_OUT;
if (OUT && process.env.T577_SEED && /zone\.js$/.test(process.argv[1] || '')) {
  const ROOT = path.join(__dirname, '..');
  const SEED = process.env.T577_SEED;
  const SLOW = parseFloat(process.env.T1235_SLOW || '20');
  const PDAYS = parseInt(process.env.T1235_PROF_DAYS || '2', 10);
  const PAT = process.env.T1235_PROF_AT ? parseInt(process.env.T1235_PROF_AT, 10) : null;
  const dayf = `${OUT}.${SEED}.days.jsonl`;
  try { fs.writeFileSync(dayf, ''); } catch (e) { /* 자리 */ }
  let last = -1, cpu0 = process.cpuUsage(), prof = null, profEnd = -1, profiled = false;
  const startProf = (d) => {
    try {
      const inspector = require('inspector');
      const s = new inspector.Session(); s.connect();
      s.post('Profiler.enable', () => s.post('Profiler.setSamplingInterval', { interval: 1000 }, () => s.post('Profiler.start')));
      prof = s; profEnd = d + PDAYS; profiled = true;
    } catch (e) { prof = null; }
  };
  const stopProf = () => {
    const s = prof; prof = null;
    try { s.post('Profiler.stop', (err, r) => { try { if (!err && r && r.profile) fs.writeFileSync(`${OUT}.${SEED}.cpuprofile`, JSON.stringify(r.profile)); } catch (e) {} try { s.disconnect(); } catch (e) {} }); } catch (e) {}
  };
  let Pl = null;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last) {
          const c = process.cpuUsage(cpu0); cpu0 = process.cpuUsage();
          const sec = (c.user + c.system) / 1e6;
          let pop = 0; for (const v of (world.villages || [])) pop += (v.npcs || []).length;
          let bodies = 0, houses = 0, farm = 0;
          try {
            const V = require(path.join(ROOT, 'server', 'villages'));
            const st = V.__state || null;
            if (!Pl && V.__labProbe && V.__labProbe.players) Pl = V.__labProbe.players;
            if (st && st.deps && st.deps.players) { for (const p of st.deps.players.values()) if (p && p.isNpc) bodies++; }
            if (st && Array.isArray(st.villages)) for (const vil of st.villages) {
              houses += (vil.housesPx ? vil.housesPx.length : 0);
              if (vil._crop) farm += (vil._crop.size != null ? vil._crop.size : Object.keys(vil._crop).length);
            }
          } catch (e) { /* 읽기만 */ }
          fs.appendFileSync(dayf, JSON.stringify([last, +sec.toFixed(2), pop, bodies, houses, farm]) + '\n');
          last = d;
          if (prof && d >= profEnd) stopProf();
          if (!profiled && ((PAT != null && d >= PAT) || (PAT == null && sec > SLOW))) startProf(d);
        }
      } catch (e) { /* 계측 실패는 판을 안 막는다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
  process.on('exit', () => { if (prof) stopProf(); });
}

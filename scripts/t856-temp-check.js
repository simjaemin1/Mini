// (@regress 없음 — 러너 밖 · T856 ③ 관찰기 · 읽기만 · 값 0 · 판정 0)
// === scripts/t856-temp-check.js — 몸 기온 ↔ econ 기온: 같은 마을 · 같은 날 대조 ===
//
// ★왜 [T856 ③] 켬이면 econ 마을 `land.elev` = 그 마을 중심의 존 `elevKmAt`(몸 기온이 쓰는 지형 정본)다. 같은 마을에서 몸이 느끼는 기온과
//   econ 이 그 마을에 매기는 기온이 같은 고도 · 같은 곡선(econ `temperatureAt`)에서 오는지 잰다.
//   ⓐ 고도 — econ `elevKmOf(마을)` 와 존 `elevKmAt(마을 중심)` 이 같은가
//   ⓑ 같은 날 — econ 하루 평균(`v._tempDay` = `temperatureAt(econ 날, null, land.elev)`) 과 몸 쪽 하루 평균(`temperatureAt(같은 날, null, elevKmAt)`)
//   ⓒ 시계 — 몸은 존 `gameDayT`(= 생활층 `econDayT` — econ 날 + 그날 지난 몫)로 산다 — 그 날 차(econ 날과)와 그 차가 낸 하루 평균 기온 차
//   ⓓ 몸이 실제로 느끼는 그 순간 기온(`weather.tempAtT` — 하루 평균 + 날씨 편차 + 일교차)과 econ 하루 평균의 차(econ 은 편차 · 일교차가 없다)
//
// 쓰는 법(서버 판 프리로드):
//   T856_OUT=/tmp/x NODE_OPTIONS="--require $PWD/scripts/t856-temp-check.js" node scripts/server-baseline-check.js <기준선> --plan 1020:400 …
//   ⇒ `${T856_OUT}-<씨>.json` · `node scripts/t856-temp-check.js report <파일…>`
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

if (require.main === module && process.argv[2] === 'report') {
  for (const f of process.argv.slice(3)) {
    const J = JSON.parse(fs.readFileSync(f, 'utf8')), a = J.agg;
    const r = (x, n) => (Number.isFinite(x) ? x.toFixed(n) : '—');
    console.log(`| ${J.seed} | ${a.n} | ${a.elevSame}/${a.n} | ${r(a.maxDiffSameDay, 9)} | ${r(a.dayOffMean, 2)} (${r(a.dayOffMin, 1)} ~ ${r(a.dayOffMax, 1)}) | ${r(a.absDiffClock / a.n, 3)} | ${r(a.absDiffNow / a.n, 3)} | ${a.elevMin} ~ ${a.elevMax} |`);
  }
  process.exit(0);
}

if (process.env.T856_OUT && require.main !== module) {
  const seed = process.env.T577_SEED || 'x';
  const OUT = `${process.env.T856_OUT}-${seed}.json`;
  const agg = { n: 0, elevSame: 0, maxDiffSameDay: 0, dayOffMean: 0, dayOffMin: Infinity, dayOffMax: -Infinity, absDiffClock: 0, absDiffNow: 0, elevMin: Infinity, elevMax: -Infinity };
  let last = -1, sumOff = 0;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last && d % 5 === 0) {
          last = d;
          const V = require(path.join(ROOT, 'server', 'villages.js')), E = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
          const W = require(path.join(ROOT, 'server', 'weather.js'));
          const st = V.__p3Bind({}).state, f = st.deps && st.deps.elevKmAt;
          const gd = (typeof V.econDayT === 'function') ? V.econDayT(Date.now()) : null;   // 몸이 기온을 묻는 그 날(존 `gameDayT` 와 같은 문)
          if (typeof f === 'function' && Number.isFinite(gd)) {
            for (const vil of (st.villages || [])) {
              const ev = vil.econ; if (!ev || !Number.isFinite(ev._tempDay)) continue;
              const eB = +f({ x: vil.ccx * 32 + 16, y: vil.ccy * 32 + 16 }) || 0, eE = E.elevKmOf(ev);
              const bodySame = E.temperatureAt(world.day, null, eB), bodyClock = E.temperatureAt(Math.floor(gd), null, eB), bodyNow = W.tempAtT(gd, eB);
              agg.n++; if (eB === eE) agg.elevSame++;
              agg.elevMin = Math.min(agg.elevMin, eE); agg.elevMax = Math.max(agg.elevMax, eE);
              agg.maxDiffSameDay = Math.max(agg.maxDiffSameDay, Math.abs(ev._tempDay - bodySame));
              const off = gd - world.day; sumOff += off; agg.dayOffMin = Math.min(agg.dayOffMin, off); agg.dayOffMax = Math.max(agg.dayOffMax, off);
              agg.absDiffClock += Math.abs(ev._tempDay - bodyClock);
              if (Number.isFinite(bodyNow)) agg.absDiffNow += Math.abs(ev._tempDay - bodyNow);
            }
            agg.dayOffMean = agg.n ? sumOff / agg.n : 0;
          }
        }
      } catch (e) { agg.err = String(e && e.message).slice(0, 200); }
      return sd.apply(this, arguments);
    };
    return L;
  };
  const dump = () => { if (!agg.n && !agg.err) return; try { fs.writeFileSync(OUT, JSON.stringify({ seed, agg })); } catch (e) {} };
  setInterval(dump, 30000).unref();
  process.on('exit', dump);
}

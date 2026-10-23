// (@regress 없음 — 러너 밖 · T871 ① 관찰기 · 읽기만 · 값 0 · 판정 0)
// === scripts/t871-clock-check.js — 몸 시계(`econDayT`) ↔ econ 날(`world.day`): 어디서 · 얼마나 갈리나 ===
//
// ★왜 [T871 ① · T856 회부 1] 몸은 존 `gameDayT`(= 생활층 `econDayT(now)` — econ 날 D + 그 날 경계에서 흐른 몫)로 기온을 묻고,
//   econ 은 `world.day` 로 그 마을 하루 기온(`v._tempDay`)을 매긴다. T856 은 장부 `scanDay`(창 꼬리) 한 자리에서만 쟀다(평균 2.5일).
//   이 관찰기는 **게임 한 시간마다**(존 틱 `onGameTick` 뒤 · 벽시계 몫 dayMs ÷ 24) 잰다:
//     off = econDayT(now) − world.day · 날 갈림 = floor(econDayT) ≠ world.day · 마감 중(`tickJobs`) · 창 열림(T731 `_t731`) ·
//     닫힌 날 [D, D + 1] 밖 · 하루 평균 기온 차 |temperatureAt(floor(t)) − temperatureAt(world.day)|(같은 곡선 · 고도 0 · 날만 다르면 나는 차).
//   타이머를 안 건다(가상 시계 줄에 안 끼어든다) — 틱 감싸기 안에서 모으고 종료 때 적는다.
//
// 쓰는 법(서버 판 프리로드 · 아이 존만 — `T577_SEED` 가 있을 때):
//   T871_OUT=/tmp/x NODE_OPTIONS="--require $PWD/scripts/t871-clock-check.js" node scripts/server-baseline-check.js <기준선> --plan 1020:60 [--vclock]
//   ⇒ `${T871_OUT}-<씨>-<pid>.json` · `node scripts/t871-clock-check.js report <파일…>`
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

if (require.main === module && process.argv[2] === 'report') {
  console.log('| 판 | 씨 | 하루 ms | econ 날 | 표본 | off 평균 | off 최소 ~ 최대 | 날 갈림(floor) | [D, D+1] 밖 | 갈림 중 마감 · 창 | off 0 · 1 · 2 · 3+ | 하루 평균 기온 차 평균 · 최대 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const f of process.argv.slice(3)) {
    const J = JSON.parse(fs.readFileSync(f, 'utf8')), a = J.agg, r = (x, n) => (Number.isFinite(x) ? x.toFixed(n) : '—');
    if (!a || !a.n) continue;   // 표본 0(틱 전에 내린 프로세스)
    console.log(`| ${J.label || path.basename(f)} | ${J.seed} | ${J.dayMs} | ${a.d0} ~ ${a.d1} | ${a.n} | ${r(a.offSum / a.n, 3)} | ${r(a.offMin, 3)} ~ ${r(a.offMax, 3)} | ${a.split}/${a.n} | ${a.out == null ? '—' : a.out} | ${a.splitClose} · ${a.splitWin} | ${a.h.join(' · ')} | ${r(a.dTSum / a.n, 3)} · ${r(a.dTMax, 3)} |`);
  }
  process.exit(0);
}

if (process.env.T871_OUT && process.env.T577_SEED && require.main !== module) {
  const seed = process.env.T577_SEED;
  const OUT = `${process.env.T871_OUT}-${seed}-${process.pid}.json`;
  const agg = { n: 0, offSum: 0, offMin: Infinity, offMax: -Infinity, split: 0, splitClose: 0, splitWin: 0, h: [0, 0, 0, 0], out: 0, dTSum: 0, dTMax: 0, d0: null, d1: null };
  let V = null, E = null, nextAt = -Infinity, dayMs = null, wrapped = false;
  const dump = () => { try { fs.writeFileSync(OUT, JSON.stringify({ seed, label: process.env.T871_LABEL || '', dayMs, agg })); } catch (e) {} };
  const sample = (now) => {
    const st = V.__p3Bind({}).state, W = st.world;
    if (!W || !Number.isFinite(W.day) || !st.dayMs) return;
    dayMs = st.dayMs;
    if (now < nextAt) return;
    nextAt = now + st.dayMs / 24;
    const t = V.econDayT(now); if (!Number.isFinite(t)) return;
    const D = W.day | 0, off = t - D, g = Math.floor(t) - D;
    agg.n++; agg.offSum += off; agg.offMin = Math.min(agg.offMin, off); agg.offMax = Math.max(agg.offMax, off);
    agg.h[Math.max(0, Math.min(3, Math.floor(off)))]++;
    if (t < D || t > D + 1) agg.out++;   // 닫힌 날 [D, D + 1] 밖(끝점 D + 1 = 그 날의 끝 · 다음 날 경계)
    if (g !== 0) { agg.split++; if (st.tickJobs) agg.splitClose++; if (st._t731) agg.splitWin++; }
    const dT = Math.abs(E.temperatureAt(Math.floor(t), null, 0) - E.temperatureAt(D, null, 0));
    agg.dTSum += dT; agg.dTMax = Math.max(agg.dTMax, dT);
    if (agg.d0 == null) agg.d0 = D; agg.d1 = D;
    if (agg.n % 500 === 0) dump();
  };
  const Module = require('module');
  const VP = path.join(ROOT, 'server', 'villages.js');
  const load = Module._load;
  Module._load = function (req, parent) {
    const m = load.apply(this, arguments);
    if (!wrapped && m && typeof m.onGameTick === 'function' && typeof m.econDayT === 'function') {
      let file = null; try { file = Module._resolveFilename(req, parent); } catch (e) {}
      if (file === VP) {
        wrapped = true; V = m; E = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
        const og = m.onGameTick;
        m.onGameTick = function (now) { const r = og.apply(this, arguments); try { sample(now); } catch (e) { agg.err = String(e && e.message).slice(0, 200); } return r; };
      }
    }
    return m;
  };
  process.on('exit', dump);
}

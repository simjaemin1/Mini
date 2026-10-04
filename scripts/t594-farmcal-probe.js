// (@regress 없음 — 러너 밖 · T594 계측기 · 제품 무변)
// === scripts/t594-farmcal-probe.js — 밭을 도는 자(t176·farm-metrics)에 끼우는 **철 관찰자** ====================
//   쓰는 법: T594_FARMCAL_JSON=/tmp/x.json node -r ./scripts/t594-farmcal-probe.js scripts/t176-ab.js 800 <seed>
//   ★잰다: 작물별 **파종 달 · 수확 달**(달력 정본 `crops.monthOf`) · 심고 거두기까지 날수 · 첫해(게임일 0~364) 수확 달 ·
//     첫 겨울(1년 12월 1일 ~ 2년 2월 말) 마을 굶주림 일수 · 그 창의 굶어 죽음 · 첫 겨울 인구 처음·끝·최저.
//   ⚠★[T634 2026-10-04 정정] 굶주림 술어가 **없는 칸**(`econ.hunger`)을 읽고 있었다 — econ 마을엔 그 칸이 없어 늘 0 이었다
//     (T594 보고 §3 "첫 겨울 굶음 0 = 0" 은 헛것). 이제 정본 술어 `villages.villageFamine`(econ `_dpDebug.hunger < 0` · T159 ·
//     몸 층 T590 이 `starve` 로 세는 그 날)을 그대로 부른다(사본 0). 굶어 죽음 = 기근 날의 `_deadTot` 증분(T590 갈래와 같다).
//   ★관찰만 한다 — 자가 넘기는 관찰자(`onDid`)를 감싸 **같은 인수를 그대로** 넘기고 읽기만 한다(세계에 0 · 여덟 수 무변).
//     자가 관찰자를 안 넘기는 판이면 이쪽이 하나 만든다 — `lifeFarmDay` 의 관찰자는 하기 전 칸을 **읽기만** 한다(villages.js T117 주석).
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';                 // t176·farm-metrics 와 같은 기본값을 먼저 건다
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t594-probe-${process.pid}.db`;   //   (이 훅이 villages 를 먼저 싣는다 — 기본 DB 자리를 안 만들게)
const path = require('path');
const fs = require('fs');
const V = require(path.join(__dirname, '..', 'server', 'villages.js'));
const Crops = require(path.join(__dirname, '..', 'server', 'crops.js'));
const Cal = require(path.join(__dirname, '..', 'server', 'calendar.js'));
const P = V.__labProbe;
const CP = P._cropProbe;
const orig = CP.tickDay;
const OUT = process.env.T594_FARMCAL_JSON || '';
const W0 = Cal.dayOf(1, 12, 1), W1 = Cal.dayOf(2, 3, 1);   // 첫 겨울 [W0, W1)
const rec = Object.create(null);
const R = (id) => rec[id] || (rec[id] = { sow: Array(13).fill(0), harv: Array(13).fill(0), harvY1: Array(13).fill(0), dur: 0, durN: 0, durMin: Infinity, durMax: 0 });
const fw = { hungerVD: 0, hungerV: 0, starveDead: 0, pop0: null, pop1: null, popMin: Infinity, days: 0 };
const _dead0 = new Map(), _hungV = new Set();
let lastDay = -1;
CP.tickDay = function (vils, day, onDid) {
  if (day >= W0 && day < W1 && day !== lastDay) {
    let pop = 0, hung = 0;
    for (const v of vils) {
      const ev = v.econ; if (!ev) continue; pop += (ev.npcs || []).length;
      const fam = V.villageFamine(v), dt = ev._deadTot || 0;
      if (fam) { hung++; _hungV.add(v); if (_dead0.has(v)) fw.starveDead += Math.max(0, dt - _dead0.get(v)); }
      _dead0.set(v, dt);
    }
    fw.hungerV = _hungV.size;
    if (fw.pop0 == null) fw.pop0 = pop;
    fw.pop1 = pop; fw.popMin = Math.min(fw.popMin, pop); fw.hungerVD += hung; fw.days++;
  }
  lastDay = day;
  const mo = Crops.monthOf(day);
  return orig.call(this, vils, day, (vil, k, t, c0, p0, e1) => {
    if (t === 2 && e1) R(e1.c).sow[mo]++;
    else if (t === 5 && c0) {
      const r = R(c0); r.harv[mo]++; if (day < 365) r.harvY1[mo]++;
      const d = day - p0; r.dur += d; r.durN++; if (d < r.durMin) r.durMin = d; if (d > r.durMax) r.durMax = d;
    }
    if (onDid) onDid(vil, k, t, c0, p0, e1);
  });
};
process.on('exit', () => {
  const crops = {};
  for (const id of Object.keys(rec).sort()) {
    const r = rec[id];
    crops[id] = { sow: r.sow.slice(1), harv: r.harv.slice(1), harvY1: r.harvY1.slice(1),
      durMean: r.durN ? +(r.dur / r.durN).toFixed(1) : null, durMin: r.durN ? r.durMin : null, durMax: r.durN ? r.durMax : null, harvN: r.durN };
  }
  const o = { T594_CROP_CAL: Crops.T594_CROP_CAL, T100_FIELD_YIELD: process.env.T100_FIELD_YIELD === '1', argv: process.argv.slice(2),
    firstWinter: { from: '1년 12월 1일', to: '2년 2월 말', ...fw, popMin: Number.isFinite(fw.popMin) ? fw.popMin : null }, crops };
  if (OUT) { try { fs.writeFileSync(OUT, JSON.stringify(o, null, 1)); } catch (e) {} }
  process.stderr.write(`[t594-farmcal-probe] 작물 ${Object.keys(crops).length} · 첫 겨울 굶은 마을·일 ${fw.hungerVD}(마을 ${fw.hungerV} · 굶어 죽음 ${fw.starveDead}) · ${OUT || '(JSON 안 씀)'}\n`);
});

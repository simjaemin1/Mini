#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T762 표 기계 · 판 파일만 읽는다)
// === scripts/t762-table.js — 실제 날 판(T686 자) 팔마다: 걸은 몸 수 · 거리 · 빠르기 · 하루 몫 · 상한 60 막힘 · 가드 ==========
//   node scripts/t762-table.js <폴더> <팔> [<팔> …]      ⇒ 팔마다 `<폴더>/<팔>.walk.jsonl`(t762-walk-observe) + `<폴더>/<팔>.log`(존 로그)
//   몸 빠르기 = 이웃 두 표본 사이 몸 위치가 옮긴 px ÷ 벽 초(벽 시계 = 실제 날 · 하루 1,440초) — 장부 진척(T661 L)이 아니라 **보이는 몸**이다.
//   기준 = 몸 걸음 64 px/s(move-model `baseSpeed` · 존 `MOVE_SPEED` — T474 유도의 그 수 · 읽어서 쓴다 · 사본 0).
'use strict';
const fs = require('fs');
const path = require('path');
const MM = require('../public/move-model');
const W = require('../server/zone-config').WORLD;
const BODY = MM.DEFAULTS.baseSpeed, DAY_S = W.dayLengthMs / 1000;
const [DIR, ...ARMS] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('en-US'));
const out = {};
for (const arm of ARMS) {
  const L = fs.readFileSync(path.join(DIR, `${arm}.walk.jsonl`), 'utf8').trim().split('\n').map((x) => JSON.parse(x)).filter((r) => !r.err);
  const log = fs.readFileSync(path.join(DIR, `${arm}.log`), 'utf8');
  const t0 = L.length ? L[0].t : 0;
  // 몸마다 이웃 표본 사이 걸음
  const prev = new Map(); const spd = [], moved = new Set(), walkPx = {}; let totPx = 0;
  const ratio = [];   // 장부 일정이 바라는 빠르기 ÷ 몸 걸음(len ÷ (다리 날 × 1,440초) ÷ 64)
  const legs = {}; const seenB = new Set();
  const spdLeg = { one: [], more: [] };   // 다리 날 1 · 2 이상 — 몸 빠르기
  //   ★경계에서 선 몸만(깨끗한 몸) — 판을 띄운 순간 길 위에 있던 장부 캐러밴은 몸이 **길 첫 점**에서 서서(spawnCaravanBody · 장부 자리 아님)
  //     남은 시간에 길 전체를 따라잡는다(재기동 몸 · 따라잡기 상한 명목 ×4). 그 몸은 따로 센다(`boot`).
  const D0 = L.length ? L[0].d : 0, firstD = new Map(), firstPh = new Map();
  const NR = new Map(); for (const r of L) for (const n of r.N) NR.set(n[0], n);   // id → [id · 출발일 · 도착일 · 귀환 도착일 · 거리 · 날 · 몸 · 상태]
  //   깨끗 = 판을 띄운 날 뒤(첫 경계 뒤) · 몸이 그 다리의 **첫 날**에 섰다(가는 다리: 출발일 = 처음 본 날 · 오는 다리: 도착일 = 처음 본 날) — 아니면 다리 중간에 선 몸(재기동 몸)
  const isClean = (id) => { const n = NR.get(id), d = firstD.get(id), ph = firstPh.get(id); if (!n || !(d > D0)) return false; return ph === 'o' ? n[1] === d : n[2] === d; };
  const spdClean = { one: [], more: [] }, spdBoot = [], over = { clean: 0, cleanN: 0, boot: 0, bootN: 0 };
  const snap = [];                          // 장부 도착(국면 o → l/i) 직전 표본의 남은 px(그 뒤 경계에서 끝점으로 옮겨진 거리의 위 끝)
  for (const r of L) {
    for (const b of r.B) {
      const [id, ph, prog, len, leg, dly, LL, x, y] = b;
      if (!seenB.has(id + ph)) { seenB.add(id + ph); if (ph !== 'l' && leg > 0) { legs[leg] = (legs[leg] || 0) + 1; ratio.push(len / (leg * DAY_S) / BODY); } }
      if (!firstD.has(id)) { firstD.set(id, r.d); firstPh.set(id, ph); }
      const p = prev.get(id);
      if (p && x != null && p.x != null && p.ph === ph) {
        const dt = (r.t - p.t) / 1000, dpx = Math.hypot(x - p.x, y - p.y);
        if (dt > 0 && ph !== 'l') { if (dpx > 1) { moved.add(id); spd.push(dpx / dt); (leg <= 1 ? spdLeg.one : spdLeg.more).push(dpx / dt);
          const v = dpx / dt, clean = isClean(id);
          if (clean) { (leg <= 1 ? spdClean.one : spdClean.more).push(v); over.cleanN++; if (v > BODY * 1.05) over.clean++; }
          else { spdBoot.push(v); over.bootN++; if (v > BODY * 1.05) over.boot++; } } totPx += dpx; walkPx[r.d] = (walkPx[r.d] || 0) + dpx; }
      }
      if (p && p.ph === 'o' && ph !== 'o') snap.push([p.len - p.prog, (p.len - p.prog) / Math.max(1, p.len), p.leg]);
      prev.set(id, { t: r.t, x, y, ph, prog, len, leg });
    }
  }
  const nB = L.map((r) => r.nB), inF = L.map((r) => r.inF), noB = L.map((r) => r.noB);
  const N = [].concat(...L.map((r) => r.N));
  const newC = N.filter((n) => n[1] >= (L[0] ? L[0].d : 0));   // 판 안에서 떠난 장부 캐러밴
  const tdN = {}; for (const n of newC) tdN[n[5]] = (tdN[n[5]] || 0) + 1;
  const cnt = (re) => (log.match(re) || []).length;
  const pushes = [...log.matchAll(/econ 도착 \+(\d+)일 지연/g)].map((m) => +m[1]);
  out[arm] = {
    samples: L.length, wallMin: L.length ? (L[L.length - 1].t - t0) / 60000 : 0, days: L.length ? [L[0].d, L[L.length - 1].d] : null,
    nB: { mean: nB.reduce((a, b) => a + b, 0) / Math.max(1, nB.length), max: Math.max(0, ...nB) },
    inF: { mean: inF.reduce((a, b) => a + b, 0) / Math.max(1, inF.length), max: Math.max(0, ...inF) },
    noB: { mean: noB.reduce((a, b) => a + b, 0) / Math.max(1, noB.length), max: Math.max(0, ...noB), capHit: L.filter((r) => r.nB >= 60 && r.noB > 0).length },
    bodiesSeen: new Set(L.flatMap((r) => r.B.map((b) => b[0]))).size, moved: moved.size,
    spd: { p10: q(spd, 0.1), p50: q(spd, 0.5), p90: q(spd, 0.9), max: q(spd, 1), n: spd.length },
    totKm: totPx / W.tileSize / 1000, perDayKm: Object.fromEntries(Object.entries(walkPx).map(([d, v]) => [d, v / W.tileSize / 1000])),
    legs, ratio: { p10: q(ratio, 0.1), p50: q(ratio, 0.5), p90: q(ratio, 0.9), n: ratio.length },
    newC: newC.length, tdN,
    clean: { one: { p10: q(spdClean.one, 0.1), p50: q(spdClean.one, 0.5), p90: q(spdClean.one, 0.9), max: q(spdClean.one, 1), n: spdClean.one.length },
      more: { p10: q(spdClean.more, 0.1), p50: q(spdClean.more, 0.5), p90: q(spdClean.more, 0.9), max: q(spdClean.more, 1), n: spdClean.more.length } },
    boot: { p50: q(spdBoot, 0.5), p90: q(spdBoot, 0.9), max: q(spdBoot, 1), n: spdBoot.length }, over,
    cleanBodies: [...firstD.keys()].filter(isClean).length,
    spdOne: { p10: q(spdLeg.one, 0.1), p50: q(spdLeg.one, 0.5), p90: q(spdLeg.one, 0.9), n: spdLeg.one.length },
    spdMore: { p10: q(spdLeg.more, 0.1), p50: q(spdLeg.more, 0.5), p90: q(spdLeg.more, 0.9), n: spdLeg.more.length },
    snap: { n: snap.length, p50: q(snap.map((x) => x[0]), 0.5), max: q(snap.map((x) => x[0]), 1), fMax: q(snap.map((x) => x[1]), 1) },
    log: { spawn: cnt(/캐러밴#\d+ 출발[:(]/g), arrive: cnt(/캐러밴#\d+ 도착:/g), home: cnt(/귀환 완료 — 상인 회수/g), guard: pushes.length, guardDays: pushes.reduce((a, b) => a + b, 0),
      repathOk: cnt(/로컬 재경로 성공/g), repathFail: cnt(/로컬 재경로 실패/g), isolate: cnt(/고립/g) },
  };
}
console.log(`몸 걸음 기준 ${BODY} px/s · 하루 ${DAY_S} 초 · 칸 ${W.tileSize} px`);
console.log('| 팔 | 벽 분 · econ 날 | 길 위 장부(평균·최대) | 몸(평균·최대) | 몸 없음(평균·최대 · 상한 막힌 표본) | 본 몸 · 걸은 몸 | 몸 빠르기 px/s p10·p50·p90 (÷64) | 걸은 거리 km(판) | 일정 빠르기÷몸 p10·p50·p90 | 다리 날 | 판 안 새 장부 캐러밴 · travelDays | 출발·도착·귀환 | 가드 밂(건·날) | 재경로 성공·실패 |');
console.log('|---|---|---|---|---|---|---|---:|---|---|---|---|---|---|');
for (const [arm, o] of Object.entries(out)) {
  const s = o.spd;
  console.log(`| ${arm} | ${f1(o.wallMin)} · d${o.days ? o.days.join('→') : '—'} | ${f1(o.inF.mean)} · ${o.inF.max} | ${f1(o.nB.mean)} · ${o.nB.max} | ${f1(o.noB.mean)} · ${o.noB.max} · ${o.noB.capHit}/${o.samples} | ${o.bodiesSeen} · ${o.moved} | ${f1(s.p10)} · ${f1(s.p50)} · ${f1(s.p90)} (${f1(s.p50 / BODY * 100)}%) | ${f1(o.totKm)} | ${f1(o.ratio.p10)} · ${f1(o.ratio.p50)} · ${f1(o.ratio.p90)} | ${Object.entries(o.legs).map(([k, v]) => `${k}일 ${v}`).join(' · ')} | ${o.newC} · ${Object.entries(o.tdN).map(([k, v]) => `${k}일 ${v}`).join(' · ')} | ${o.log.spawn} · ${o.log.arrive} · ${o.log.home} | ${o.log.guard} · ${o.log.guardDays} | ${o.log.repathOk} · ${o.log.repathFail} |`);
}
console.log('\n| 팔 | 1일 다리 몸 빠르기 px/s p10·p50·p90 (표본) | 2일+ 다리 몸 빠르기 p10·p50·p90 (표본) | 장부 도착 직전 남은 px p50 · 최대 (몫 최대 · 건) |');
console.log('|---|---|---|---|');
for (const [arm, o] of Object.entries(out)) console.log(`| ${arm} | ${f1(o.spdOne.p10)} · ${f1(o.spdOne.p50)} · ${f1(o.spdOne.p90)} (${o.spdOne.n}) | ${f1(o.spdMore.p10)} · ${f1(o.spdMore.p50)} · ${f1(o.spdMore.p90)} (${o.spdMore.n}) | ${f1(o.snap.p50)} · ${f1(o.snap.max)} (${o.snap.fMax == null ? '—' : (o.snap.fMax * 100).toFixed(1) + '%'} · ${o.snap.n}) |`);
console.log('\n| 팔 | 다리 첫 날에 선 몸(깨끗) | 그 몸 1일 다리 px/s p10·p50·p90·최대 (표본) | 그 몸 2일+ 다리 p10·p50·p90·최대 (표본) | 깨끗한 몸 표본 중 몸 걸음(64) 넘음 | 재기동 몸 px/s p50·p90·최대 · 64 넘음 |');
console.log('|---|---:|---|---|---|---|');
for (const [arm, o] of Object.entries(out)) { const c = o.clean, b = o.boot, v = o.over;
  console.log(`| ${arm} | ${o.cleanBodies} | ${f1(c.one.p10)} · ${f1(c.one.p50)} · ${f1(c.one.p90)} · ${f1(c.one.max)} (${c.one.n}) | ${f1(c.more.p10)} · ${f1(c.more.p50)} · ${f1(c.more.p90)} · ${f1(c.more.max)} (${c.more.n}) | ${v.clean}/${v.cleanN} | ${f1(b.p50)} · ${f1(b.p90)} · ${f1(b.max)} · ${v.boot}/${v.bootN} |`); }
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
module.exports = out;

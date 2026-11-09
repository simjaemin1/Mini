// (@regress 없음 — 계측 훅 · 러너 밖 · T1241 · 판정 0)
// === scripts/t1241-hook.js — 사건 판 ↔ 틱 판 대조 자료: 날마다 econ 지문 · CPU · 사건 셈 · 체크포인트 몸 자리 ===
//
// 쓰는 법(존 아이에 프리로드 · `T1241_PROBE=1` 과 같이 — 존이 틱 끝에 `global.__t1241Probe` 를 부른다):
//   NODE_OPTIONS="--require $PWD/scripts/t1241-hook.js --require $PWD/scripts/t745-vclock.js" T745_VCLOCK=1 T1241_PROBE=1 \
//     T1241_OUT=/tmp/t1241/tick VILLAGE_MAX=1 VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity node scripts/t577-server-run.js 400 1020
//   사건 판 = 같은 줄에 `T1241_DES=1`.
//   · `<OUT>.<시드>.jsonl` 한 줄 = 하루 { d · cpu(초 · 사용자+시스템) · st(존 사건 셈 누계) · pop · sto(곳간 정확 지문) · stoSum · crop(작물 장부 수 · 지문) · farm(밭 칸) · harvN }
//   · 체크포인트 = econ 날 10 의 배수 · 그 마을 현지 한낮(fv 0.35 를 넘은 첫 틱) — { cp: 날 · fv · 몸 [열쇠 · x · y · 라벨] }
//   ⚠세계에 쓰지 않는다(읽기만). 가상 시계 판은 시간을 `process.cpuUsage()` 로 잰다.
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const OUT = process.env.T1241_OUT;
if (OUT && process.env.T577_SEED && /zone\.js$/.test(process.argv[1] || '')) {
  //   진짜 시계 — 이 훅을 가상 시계보다 **먼저** 싣는다(`--require t1241-hook --require t745-vclock`). 존이 µs 를 이 시계로 잰다(세계는 가상 시계 그대로).
  { const RB = process.hrtime.bigint; global.__t1241Clock = () => RB();
    //   시계 한 번 잰 몫(빈 감싸기 — 시계 둘 · 뺄셈 · Number) — 표가 µs 에서 뺀다(T1231 꼴)
    let acc = 0; const N = 200000; for (let i = 0; i < N; i++) { const t0 = RB(); acc += Number(RB() - t0); }
    global.__t1241ClkNs = acc / N; }   // 함수를 붙잡는다(가상 시계가 `hrtime.bigint` 칸을 갈아 끼워도 이 참조는 진짜)
  const ROOT = path.join(__dirname, '..');
  const SEED = process.env.T577_SEED;
  const f = `${OUT}.${SEED}.jsonl`;
  try { fs.writeFileSync(f, ''); } catch (e) { /* 자리 */ }
  const W = (o) => { try { fs.appendFileSync(f, JSON.stringify(o) + '\n'); } catch (e) {} };
  const H = (x) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16);
  let cpu0 = process.cpuUsage(), last = -1;
  const ZC = require(path.join(ROOT, 'server', 'zone-config'));
  let V = null;
  const vil = () => { try { if (!V) V = require(path.join(ROOT, 'server', 'villages')); const st = V.__labProbe._t740Probe.setup(); return st && st.villages ? st.villages : []; } catch (e) { return []; } };   // `setup()` 인자 없이 = 읽기만(마을 상태 · 쓰기 0)
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
          const S = global.__t1241Stat || {};
          const row = { d: last, cpu: +((c.user + c.system) / 1e6).toFixed(3), clk: +(global.__t1241ClkNs || 0).toFixed(2), st: JSON.parse(JSON.stringify(S)) };
          let pop = 0, sto = {}, stoSum = 0, crop = [], farm = 0, harvN = 0;
          for (const v of (world.villages || [])) {
            pop += (v.npcs || []).length; harvN += (v._t100HarvestN || 0);
            const s = v.storage || {};
            for (const k of Object.keys(s).sort()) { const q = s[k]; if (typeof q === 'number' && q) { sto[k] = q; stoSum += q; } }
          }
          for (const vl of vil()) {
            farm += vl._farmSet ? vl._farmSet.size : 0;
            if (vl._crop) for (const [k, e] of vl._crop) crop.push([k, e.c, e.p, e.td, e.w, e.ps, e.q]);
          }
          crop.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
          row.pop = pop; row.sto = H(sto); row.stoSum = +stoSum.toFixed(3); row.food = +(sto.food || 0).toFixed(3);
          row.cropN = crop.length; row.crop = H(crop); row.farm = farm; row.harvN = harvN;
          W(row);
          last = d;
        }
      } catch (e) { /* 계측 실패는 판을 안 막는다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
  // ── 체크포인트 — 10 날마다 마을 현지 한낮 ──
  const done = new Set();
  let nextAt = 0;
  global.__t1241Probe = function (now, players) {
    if (now < nextAt) return; nextAt = now + 500;
    try {
      const ed = V && V.econDay ? V.econDay() : null;
      if (ed == null || ed % 10 || done.has(ed)) return;
      const vs = vil(); if (!vs.length) return;
      const off = vs[0]._lonOff || 0;
      const fv = ZC.phaseAdd(ZC.worldPhase(now), off);
      if (!(fv >= 0.35 && fv < 0.5)) return;
      done.add(ed);
      const bodies = [];
      for (const p of players.values()) {
        if (!p.isNpc || !p.simVillageId) continue;
        bodies.push([String(p._sh != null ? p._sh : p.pid), +p.x.toFixed(2), +p.y.toFixed(2), p._lifeAct || '', p.simJob || '', p._des ? p._des.k : '']);
      }
      bodies.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      W({ cp: ed, fv: +fv.toFixed(4), t: now, n: bodies.length, b: bodies });
    } catch (e) { /* 읽기만 */ }
  };
}

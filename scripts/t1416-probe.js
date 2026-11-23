'use strict';
// (@regress 없음 — 러너 밖 · T1416 판 자 · 읽기만 · 세계 0)
// === scripts/t1416-probe.js — 사냥판 판의 날 줄(T1393 탐침 `t1393-probe.js` 의 칸 + T1416 셈) =====================================================
//   존 아이에 `NODE_OPTIONS=--require <이 파일>` 로 싣는다(존 `zone.js` 아이에서만 선다) · env `T1416_PROBE_OUT=<jsonl>`.
//   줄 = { d, cpu, pop, hun, meat(그날 econ 생산 고기 단위), got(든 마리 누계 · T1195 ①), carryKg(곳간에 지고 온 kg 누계 · T1416 ④), chase(t1393Stat), t16(wildlife t1416Stat), c16(villages t1416Stat), body, tick }
//   tick = 그날 wildlife 틱 CPU(µs) 표본 p50 · p99 · 최대 · 틱 수(wildlife `tick` 을 감싸 잰다 — 값 무변 · `cpuUsage` = 실제 CPU · 가상 시계가 안 덮는다).
//   ⚠읽기만 — 서버 장부 `scanDay` 문 앞(t1393-probe 와 같은 문).
const path = require('path'), fs = require('fs');
const OUT = process.env.T1416_PROBE_OUT || '';
if (OUT && /server[\/\\]zone\.js$/.test(process.argv[1] || '')) {
  const ROOT = path.join(path.dirname(process.argv[1]), '..');   // 띄운 존의 나무(이 탐침의 나무가 아니다 — 베이스 나무 판도 같은 탐침)
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const W = require(path.join(ROOT, 'server', 'wildlife'));
  let tk = [];
  const t0 = W.tick; W.tick = function () { const c = process.cpuUsage(); const r = t0.apply(this, arguments); const u = process.cpuUsage(c); tk.push(u.user + u.system); return r; };
  const mk = Ev.createLedger;
  let last = -1;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try { const d = day | 0; if (d !== last) { last = d; fs.appendFileSync(OUT, JSON.stringify(snap(d)) + '\n'); } }
      catch (e) { try { fs.appendFileSync(OUT, JSON.stringify({ d: day, err: e.message }) + '\n'); } catch (x) {} }
      return sd.apply(this, arguments);
    };
    return L;
  };
  function snap(d) {
    const V = require(path.join(ROOT, 'server', 'villages'));
    const st = V.__t740();
    let pop = 0, meat = 0, hun = 0, got = 0, ckg = 0;
    for (const v of (st.villages || [])) {
      const e = v.econ; if (!e) continue;
      pop += (e.npcs || []).length; hun += (e.counts && e.counts.hunter) || 0; meat += ((e.dailyProductionBuf || {}).meat || 0);
      got += v._t1195Got || 0; ckg += v._t1416Kg || 0;
    }
    const a = tk.slice().sort((x, y) => x - y); tk = [];
    const q = (p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
    let body = null; try { const s = V.t1331Stat ? V.t1331Stat() : null; if (s && s.w) body = { alive: s.w.alive, mat: s.w.mat, died: s.w.st.died, born: s.w.st.born, mismatch: s.w.st.mismatch }; } catch (e) { body = { err: e.message }; }
    let chase = null; try { chase = W.t1393Stat ? W.t1393Stat() : null; } catch (e) {}
    let t16 = null; try { t16 = W.t1416Stat ? W.t1416Stat() : null; } catch (e) {}
    let c16 = null; try { c16 = V.t1416Stat ? V.t1416Stat() : null; } catch (e) {}
    let t29 = null; try { t29 = W.t1429Stat ? W.t1429Stat() : null; } catch (e) {}   // ★[T1429] 두고 온 몫 갈래 · 둔 몫 생애 · 땅 더미
    return { d, cpu: (() => { const u = process.cpuUsage(); return u.user + u.system; })(), pop, hun, meat: +meat.toFixed(3), got, carryKg: +ckg.toFixed(3), body, chase, t16, c16, t29,
      tick: { n: a.length, p50: q(0.5), p99: q(0.99), max: a.length ? a[a.length - 1] : null } };
  }
}

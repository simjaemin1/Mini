'use strict';
// (@regress 없음 — 러너 밖 · T1393 판 자 · 읽기만 · 세계 0)
// === scripts/t1393-probe.js — 사냥판 판의 날 줄: 인구 · 사냥꾼 · 고기 · 굶어 죽음 · 몸 표 · 사냥판 셈 · CPU ==========================
//   존 아이에 `NODE_OPTIONS=--require <이 파일>` 로 싣는다(존 `zone.js` 아이에서만 선다) · env `T1393_PROBE_OUT=<jsonl>`.
//   줄 = { d, cpu(누계 µs), pop, meat(그날 econ 생산 고기), vil: [[이름, 인구, econ 사냥꾼, 몸 pid 수, 굶어 죽음 누계, 든 마리 누계]] · home(무리터별 몸 수 — 50날마다), body, chase, t1195, t1331 }
//   ⚠읽기만 — 서버 장부 `scanDay` 문 앞(t1331-ledger-probe 와 같은 문).
const path = require('path'), fs = require('fs');
const OUT = process.env.T1393_PROBE_OUT || '';
if (OUT && /server[\/\\]zone\.js$/.test(process.argv[1] || '')) {
  const ROOT = path.join(__dirname, '..');
  const Ev = require(path.join(ROOT, 'server', 'events'));
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
    const V = require(path.join(ROOT, 'server', 'villages')), W = require(path.join(ROOT, 'server', 'wildlife'));
    const st = V.__t740();
    let pop = 0, meat = 0, hun = 0;
    const vil = [];
    for (const v of (st.villages || [])) {
      const e = v.econ; if (!e) continue;
      const n = (e.npcs || []).length, h = (e.counts && e.counts.hunter) || 0;
      pop += n; hun += h; meat += ((e.dailyProductionBuf || {}).meat || 0);
      vil.push([v.name, n, h, (v.npcPids || []).length, (e._fdDeadTot || v._fdDeadTot || 0), v._t1195Got || 0]);
    }
    let body = null; try { const s = V.t1331Stat ? V.t1331Stat() : null; if (s && s.w) body = { alive: s.w.alive, by: s.w.by, mat: s.w.mat, died: s.w.st.died, born: s.w.st.born, start: s.w.st.start, mismatch: s.w.st.mismatch, cpuUs: s.cpuUs, huntKill: s.huntKill, home: (d % 50 === 0 || d <= 3) ? s.w.home : undefined }; } catch (e) { body = { err: e.message }; }
    let chase = null; try { chase = W.t1393Stat ? W.t1393Stat() : null; } catch (e) { chase = { err: e.message }; }
    let t1195 = null; try { const t = V.t1195Stat ? V.t1195Stat() : null; if (t) t1195 = { bodies: t.bodies, seenN: t.seenN, seenU: +t.seenU.toFixed(2), reachN: t.reachN, refuse: t.refuse, noReach: t.noReach, sp: t.sp }; } catch (e) {}
    return { d, cpu: (() => { const u = process.cpuUsage(); return u.user + u.system; })(), pop, hun, meat: +meat.toFixed(3), vil, body, chase, t1195, heap: process.memoryUsage().heapUsed };
  }
}

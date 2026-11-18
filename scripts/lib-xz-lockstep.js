'use strict';
// (@regress 없음 — 하네스 도구 · 쓰는 자: `e2e-xzone-caravan.js` 가상 시계 판 · T1352)
// === scripts/lib-xz-lockstep.js — 두 존 가상 시계 판의 **발맞춤 지휘**(T1320 자를 하네스 안으로) — 존이 죽고 다시 뜨는 판까지 ==========
//
// ★왜 [T1352 할 일 6 · T1324 회부 4]: `e2e-xzone-caravan` 은 실시간 판이라 흔들렸다(받는 존이 5초 넘게 바쁘면 "답 없음" → 다시 밂 · 기다림 창이
//   벽시계 · 다시 뜬 존이 따라잡는 사이). T1320 자(존마다 T745 가상 시계 + 가로대 H 까지만 돌림 · 존 사이 HTTP 는 가로대에서만 건넴)에 올리면 세계는
//   벽시계와 끊긴다. T1320 러너(`t1320-xz-vclock.js`) · T1324 판 자(`t1324-vclock-beast.js`)의 가로대 셈(`balanced` · `tryGo`)을 그대로 옮기고 셋을 더한다:
//   ⓐ 죽은 존 — 셈에서 뺀다(산 존이 죽은 존에 보낸 요청 = 받은 오류 · 보낸 수 = 받은 답 수만 본다) · 'exit' 이나 `kill()` 이 그 표지
//   ⓑ 다시 뜬 존 — 그 존 셈은 0 에서 · 다른 산 존의 그 존 셈은 그 존이 'start' 를 알린 순간 값을 밑으로(앞 판 몫을 뺀다)
//   ⓒ 걸음 꼴 — 'auto'(맞으면 곧장 다음 가로대 — T1320 러너 그대로) · 'step'(하네스가 `step()` 할 때만 한 가로대 — 표본이 가로대마다 하나씩 · 판끼리 같은 자리)
//   하네스 요청(`/perf` · `/handoff_prepare`)은 존 쪽에서 'ext' 로 받아 다음 가로대에서 처리된다(T1320 ⓑ) — `ask(z, fn)` 이 요청이 존 받은 줄에 든 것을 본 뒤 한 가로대를 민다.
// 존 아이 env(부르는 쪽이 준다): NODE_OPTIONS 앞자리 `--require scripts/t745-vclock.js --require scripts/t1320-lockstep.js` · `T745_VCLOCK=1` · `T577_SEED` ·
//   `T745_LOCKSTEP=1` · `T1320_PORTS` · `T745_V0`(다시 뜬 존 = 지금 가로대 `H`) · stdio 에 'ipc'.
// ★날짜 · 벽시계 0 — 가로대 시각은 존이 낸 가상 V 에서 · 하네스 기다림 상한(벽시계)은 부르는 쪽이 정한다(판정에 안 든다).
function create(o) {
  o = o || {};
  const Q = o.Q || 100;
  const Z = new Map();                    // 존 → { p, st, started, at, alive, base: { 다른 존: 셈 밑 } }
  let H = null, bars = 0, mode = o.mode || 'auto', want = 0;
  const waiters = new Set();
  const zeros = { reqSent: 0, resRecv: 0, reqRecv: 0, resSent: 0 };
  const cntOf = (st, b) => (st && st.cnt ? { reqSent: st.cnt.reqSent[b] | 0, resRecv: st.cnt.resRecv[b] | 0, reqRecv: st.cnt.reqRecv[b] | 0, resSent: st.cnt.resSent[b] | 0 } : Object.assign({}, zeros));
  const live = () => [...Z].filter(([, z]) => z.alive);
  function attach(zone, p) {
    const z = { p, st: null, started: false, at: false, alive: true, base: {} };
    Z.set(zone, z);
    p.on('message', (m) => {
      if (!m || m.zone !== zone || Z.get(zone) !== z) return;
      if (m.t === 'start' && !z.started) {
        z.started = true;
        for (const [a, za] of Z) if (a !== zone && za.alive && za.st) za.base[zone] = cntOf(za.st, zone);   // ⓑ 다른 산 존의 이 존 셈 밑
      }
      z.st = m; z.at = (m.t === 'at' || (m.t === 'upd' && z.at));
      if (o.debug) console.error(`[ls] ${zone} ${m.t} at=${z.at} st=${z.started} V=${m.V} H=${m.H} inbox=${m.inbox} K=${(m.inboxK || []).length} outW=${m.outW} held=${m.held} want=${want} mode=${mode}`);
      wake(); tryGo();
    });
    p.on('exit', () => { if (Z.get(zone) === z) { z.alive = false; z.at = false; wake(); tryGo(); } });
    return z;
  }
  function kill(zone, sig) { const z = Z.get(zone); if (!z) return; z.alive = false; z.at = false; try { z.p.kill(sig || 'SIGKILL'); } catch (e) {} wake(); tryGo(); }
  function balanced() {
    for (const [a, za] of live()) {
      if (!za.st) return false;
      const ca = cntOf(za.st, 'central'); if (ca.reqSent !== ca.resRecv) return false;
      for (const [b, zb] of Z) {
        if (a === b) continue;
        const x = cntOf(za.st, b), B = za.base[b] || zeros;
        if (!zb.alive) { if (x.reqSent !== x.resRecv) return false; continue; }   // ⓐ 죽은 존 — 보낸 요청은 오류로 다 돌아왔나만
        if (!zb.st) return false;
        const y = cntOf(zb.st, a), Bb = zb.base[a] || zeros;
        if (x.reqSent - B.reqSent !== y.reqRecv - Bb.reqRecv) return false;
        if (y.resSent - Bb.resSent !== x.resRecv - B.resRecv) return false;
      }
    }
    return true;
  }
  function tryGo() {
    const L = live(); if (!L.length) return;
    if (!L.every(([, z]) => z.started && z.st && z.at)) return;
    if (mode === 'step' && want <= 0) return;
    if (!balanced()) { if (o.debug) console.error(`[ls] 가로대 셈 안 맞음 — ${JSON.stringify(L.map(([zn, z]) => [zn, z.st && z.st.cnt, z.base]))}`); return; }
    H = (H == null ? Math.max(...L.map(([, z]) => z.st.V)) : H) + Q; bars++; if (want > 0) want--;
    for (const [, z] of L) { z.at = false; try { z.p.send({ t: 'go', H }); } catch (e) {} }
    wake();
  }
  function wake() { for (const w of [...waiters]) if (w.test()) { waiters.delete(w); w.res(true); } }
  function until(test, wallMs) {
    if (test()) return Promise.resolve(true);
    return new Promise((res) => {
      const w = { test, res }; waiters.add(w);
      if (wallMs) { const t = setTimeout(() => { if (waiters.delete(w)) res(false); }, wallMs); if (t.unref) t.unref(); }
    });
  }
  const allAt = () => { const L = live(); return L.length > 0 && L.every(([, z]) => z.started && z.st && z.at); };
  //   한 가로대 — 'step' 꼴이면 한 번 민다 · 'auto' 꼴이면 다음 가로대를 기다린다(벽시계 상한 · 넘으면 false — 존이 멈췄다)
  //   밀 걸음은 하나만 걸어 둔다(벽시계 상한으로 돌아온 걸음이 쌓여 가로대를 더 밀지 않게 — 가로대 차례가 벽시계에 안 달린다)
  async function step(wallMs) { const b0 = bars; if (mode === 'step') { if (want === 0) want++; tryGo(); } const r = await until(() => bars > b0 && allAt(), wallMs || 600000); return r; }
  //   가상 ms 만큼(가로대 몇 개)
  async function advance(ms, wallMs) { const H0 = H == null ? 0 : H; for (;;) { if (H != null && H - H0 >= ms) return true; if (!await step(wallMs)) return false; } }
  //   하네스 요청 하나 — 존이 받은 줄에 든 것을 본 뒤 한 가로대(그 가로대 머리에서 처리된다)
  async function ask(zone, fire, wallMs) { return (await askAll([[zone, fire]], wallMs))[0]; }
  //   여러 존에 한 가로대 — 요청이 다 그 존 받은 줄에 든 뒤 한 번 민다(같은 가로대 표본). 죽은 존 · 아직 안 뜬 존(가로채기 전)은 그대로 쏜다.
  async function askAll(list, wallMs) {
    const W = wallMs || 600000;
    //   기동 중인 존(띄웠지만 'start' 전) — 가로채기가 서는 순간과 요청이 닿는 순간이 벽시계로 갈린다 ⇒ 'start' 를 기다린 뒤 쏜다(가로대에서 처리 · 차례가 한 가지)
    await until(() => list.every(([zn]) => { const z = Z.get(zn); return !z || !z.alive || z.started; }), W);
    const lockd = list.filter(([zn]) => { const z = Z.get(zn); return z && z.alive && z.started; });
    if (mode === 'step' && lockd.length) await until(() => lockd.every(([zn]) => { const z = Z.get(zn); return !z.alive || z.at; }), W);   // 가로대에 섰다(그 사이 받은 요청은 'upd' 로 센다)
    const extN = (z) => (z.st ? (z.st.inbox | 0) - ((z.st.inboxK || []).length) : 0);   // 받은 줄 중 하네스 몫('ext' — 존 사이 요청은 `inboxK` 에 이름이 있다)
    const n0 = new Map(lockd.map(([zn]) => [zn, extN(Z.get(zn))]));
    const prs = list.map(([, fire]) => fire());
    if (mode === 'step' && lockd.length) {
      await until(() => lockd.every(([zn]) => { const z = Z.get(zn); return !z.alive || !z.at || extN(z) > n0.get(zn); }), W);   // 받은 줄에 들었다(또는 존이 이미 움직였다 · 죽었다)
      if (want === 0) want++; tryGo();   // 한 가로대(멈춘 존이 있으면 그 존이 죽거나 설 때 민다)
    }
    return Promise.all(prs);
  }
  return { attach, kill, step, advance, ask, askAll, until, allAt, setMode(m) { mode = m; if (m === 'auto') { want = 0; tryGo(); } }, get mode() { return mode; },
    get H() { return H; }, get bars() { return bars; }, Q, zone: (z) => Z.get(z), alive: (z) => !!(Z.get(z) && Z.get(z).alive), balanced, tryGo };
}
module.exports = { create };

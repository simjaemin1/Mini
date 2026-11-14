
// [T1322 진단 · 제품 아님] 걸음 문 무동작 몫 — 몸 1/8 표본 · 걸음 전후 몸 칸 견줌 · 쓴 시간은 결정 예산에서 뺀다
if (process.env.T1322_DIAG) { (function () {
  const OUT = process.env.T1322_DIAG, fs = require('fs');
  const S = {};   // key = 창|직업 → {n, gate, noop, ts, ts2, other, keys:{}, still, stillTs}
  const last = new WeakMap();
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return '?'; } };
  const snap = (o) => { const r = new Map(); for (const k of Object.keys(o)) { const v = o[k]; r.set(k, (v && typeof v === 'object') ? (Array.isArray(v) ? ['A', v, v.length, v.length <= 64 ? J(v) : ''] : ['O', v, Object.keys(v).length <= 40 ? J(v) : '']) : v); } return r; };
  const same = (a, b) => (Array.isArray(a) && Array.isArray(b)) ? (a.length === b.length && a.every((x, i) => Object.is(x, b[i]))) : Object.is(a, b);
  const f0 = npcStep;
  let ph = -1, phNow = -1;
  npcStep = function (npc, dt, now) {
    const pid = npc.pid || '';
    let h = 0; for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) | 0;
    if ((h & 7) !== 3) return f0(npc, dt, now);
    const t0 = Date.now();
    if (now !== phNow) { phNow = now; ph = worldPhase(now); }
    const W = Math.floor(ph * 20), job = npc.simJob || npc.npcJob || (npc.simVillageId ? 'vil' : 'none');
    const key = W + '|' + job;
    const st = S[key] || (S[key] = { n: 0, gate: 0, noop: 0, ts: 0, other: 0, keys: {}, moved: 0, tsStill: 0, v0: 0, beh: {} });
    st.n++;
    const gateOpen = !(T670_SKIP_IDLE && !npc.canadiaVillage && now < npc.nextDecisionAt);
    const L = last.get(npc), movedSince = !L || L.x !== npc.x || L.y !== npc.y;
    if (movedSince) st.moved++;
    if (npc.vx === 0 && npc.vy === 0) st.v0++;
    const a = snap(npc), sp = npc._stuckPos ? { x: npc._stuckPos.x, y: npc._stuckPos.y, at: npc._stuckPos.at } : null;
    const tA = Date.now();
    f0(npc, dt, now);
    const tB = Date.now();
    last.set(npc, { x: npc.x, y: npc.y });
    if (gateOpen) { st.gate++; _decT0 += (tA - t0) + (Date.now() - tB); return; }
    const b = snap(npc), ch = [];
    for (const [k, vb] of b) { const va = a.get(k); if (!a.has(k)) { ch.push(k + '+'); continue; }
      if (Array.isArray(va) && Array.isArray(vb)) { if (!same(va, vb) && va[0] === 'A' ? (va[1] !== vb[1] || va[2] !== vb[2] || va[3] !== vb[3]) : (va[1] !== vb[1] || va[2] !== vb[2])) ch.push(k); }
      else if (!Object.is(va, vb)) ch.push(k); }
    for (const k of a.keys()) if (!b.has(k)) ch.push(k + '-');
    const sp2 = npc._stuckPos;
    const spCh = !sp ? (sp2 ? ['_stuckPos.new'] : []) : [sp.x !== sp2.x ? '_stuckPos.x' : null, sp.y !== sp2.y ? '_stuckPos.y' : null, sp.at !== sp2.at ? '_stuckPos.at' : null].filter(Boolean);
    const all = ch.filter((k) => k !== '_stuckPos').concat(spCh);
    const TS = new Set(['_t540StepAt', '_pathAt', '_stuckPos.at']);
    const nonTs = all.filter((k) => !TS.has(k));
    if (all.length === 1 && all[0] === '_t540StepAt') st.noop++;
    else if (!nonTs.length) { st.ts++; if (!movedSince) st.tsStill++; }
    else { st.other++; const kk = nonTs.slice().sort().join(','); st.keys[kk] = (st.keys[kk] || 0) + 1; }
    st.beh[npc.behavior] = (st.beh[npc.behavior] || 0) + 1;
    _decT0 += (tA - t0) + (Date.now() - tB);
  };
  setInterval(() => { try { fs.writeFileSync(OUT, JSON.stringify(S)); } catch (e) {} }, 15000).unref();
})(); }


// [T1323 진단 · 제품 아님] 결정 문 무동작 몫 — 몸 1/8 표본 · 결정 전후 몸 칸 견줌(얕게 + 작은 객체 JSON) · 결정 시간(hrtime)
if (process.env.T1323_DDIAG) { (function () {
  const OUT = process.env.T1323_DDIAG, fs = require('fs');
  const S = {};
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return '?'; } };
  const snap = (o) => { const r = new Map(); for (const k of Object.keys(o)) { const v = o[k]; r.set(k, (v && typeof v === 'object') ? (Array.isArray(v) ? 'A' + v.length + (v.length <= 32 ? J(v) : '') : (Object.keys(v).length <= 30 ? 'O' + J(v) : 'R')) : v); } return r; };
  const f0 = decideNpcBehavior;
  let ph = -1, phNow = -1;
  decideNpcBehavior = function (npc, now) {
    const pid = npc.pid || ''; let h = 0; for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) | 0;
    if ((h & 7) !== 3 || npc.canadiaVillage || now < npc.nextDecisionAt) return f0(npc, now);
    if (now !== phNow) { phNow = now; ph = worldPhase(now); }
    const W = Math.floor(ph * 20), key = W + '';
    const st = S[key] || (S[key] = { n: 0, noop: 0, ns: 0, nsNoop: 0, lab: {}, labNoop: {}, keys: {} });
    const a = snap(npc), t0 = process.hrtime.bigint();
    f0(npc, now);
    const ns = Number(process.hrtime.bigint() - t0);
    const b = snap(npc), ch = [];
    for (const [k, v] of b) if (!a.has(k)) ch.push(k + '+'); else if (!Object.is(a.get(k), v)) ch.push(k);
    for (const k of a.keys()) if (!b.has(k)) ch.push(k + '-');
    const IGN = new Set(['nextDecisionAt', '_t540DecAt', '_lifeActAt']);
    const rest = ch.filter((k) => !IGN.has(k));
    st.n++; st.ns += ns; const lab = String(npc._lifeAct || '-'); st.lab[lab] = (st.lab[lab] || 0) + 1;
    if (!rest.length) { st.noop++; st.nsNoop += ns; st.labNoop[lab] = (st.labNoop[lab] || 0) + 1; }
    else { const kk = rest.sort().slice(0, 8).join(','); st.keys[kk] = (st.keys[kk] || 0) + 1; }
  };
  setInterval(() => { try { fs.writeFileSync(OUT, JSON.stringify(S)); } catch (e) {} }, 15000).unref();
})(); }

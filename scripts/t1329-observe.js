'use strict';
// (@regress 없음 — 러너 밖 · T1329 판 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1329-observe.js — 몸 영토 일감의 처리량 진단(T1329 할 일 1) ==============================================
//   마을마다 날마다: 일감 줄 길이 · 일감 몸 수(그날 영토 일을 한 몸) · 완공 칸 · 그 몸들의 시간 가름 · 여유 크루 수 · 다리 · 곳간 터 · 말뚝 재료.
//   시간 가름 = 영토 일 몸의 걸음마다(`terr-body.step` · `build-haul.step` 의 영토 일감 — 존 생활층이 부르는 그 함수) 앞 걸음 뒤 흐른 판 시계(가상 ms · 상한 =
//     몸 걸음 틈 `maxGap` — 제품과 같은 상한)를 앞 걸음의 칸에 더한다. 칸:
//       개간(그 칸에서 일한 시간) · 벌목(휘두름) · 통나무(벤 짐을 지고 곳간까지 · 부림) · 현장(빈 몸으로 칸까지) · 말뚝(곳간 → 칸 말뚝 나름 · 꺼냄 · 박음) ·
//       기다림(말뚝이 모자라고 손이 비었는데 곳간 잉여가 한 짐도 안 된다) · 밤(잠 — 낮 밖)
//   제품 함수를 감쌀 뿐(인자 · 반환 그대로 · ctx 의 `cut` 만 세려고 감싼다 — 같은 함수 · 같은 인자). `T1329_OBS=1` 일 때만 선다.
//   출력: <T577_OUT>.t1329-days.jsonl(날 줄) · <T577_OUT>.t1329.json(마디 끝 · 완공 칸 꼬리표 합)
const path = require('path'), fs = require('fs');
if (process.env.T1329_OBS !== '1' || !process.env.T577_SEED || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const ROOT = path.dirname(path.dirname(process.argv[1])), OUT = process.env.T577_OUT + '.t1329';
const Ev = require(path.join(ROOT, 'server/events'));
const TB = require(path.join(ROOT, 'server/terr-body')), BH = require(path.join(ROOT, 'server/build-haul'));
const E = require(path.join(ROOT, 'sim/economy-sim'));
let state = null;
const S = () => state || (state = require(path.join(ROOT, 'server/villages')).__p3Bind({}).state);
const CLS = ['개간', '벌목', '통나무', '현장', '말뚝', '기다림', '밤'];
const day0 = () => ({ ms: Object.fromEntries(CLS.map((k) => [k, 0])), px: Object.fromEntries(CLS.map((k) => [k, 0])), bodies: new Set(), cuts: 0, trips: 0, took: 0 });
const vd = new Map();          // 마을 dbId → 오늘 칸
const last = new WeakMap();    // 몸 → { at, cls, vid }
const rec = { days: 0, errors: [], tot: Object.fromEntries(CLS.map((k) => [k, 0])), cuts: 0 };
const V = (vid) => { let r = vd.get(vid); if (!r) vd.set(vid, r = day0()); return r; };
function note(npc, now, cls, vid, cap) {
  const L = last.get(npc);
  if (L && L.cls && Number.isFinite(now) && Number.isFinite(L.at)) { const dt = Math.max(0, Math.min(now - L.at, cap)); V(L.vid).ms[L.cls] += dt; rec.tot[L.cls] += dt;
    if (dt > 0 && Number.isFinite(npc.x) && Number.isFinite(L.x)) V(L.vid).px[L.cls] += Math.hypot(npc.x - L.x, npc.y - L.y); }
  if (cls) { last.set(npc, { at: now, cls, vid, x: npc.x, y: npc.y }); V(vid).bodies.add(npc.pid); }
  else last.delete(npc);
}
const tbStep = TB.step;
TB.step = function (npc, task, c) {
  const vid = task ? task.sourceVillageId : (npc._t1302Terr && npc._t1302Terr.sourceVillageId);
  if (c && typeof c.cut === 'function' && vid != null) { const cut = c.cut; c = Object.assign({}, c, { cut: (j) => { const l = cut(j); if (l) { V(vid).cuts++; rec.cuts++; } return l; } }); }
  const r = tbStep.call(this, npc, task, c);
  try {
    if (vid == null) return r;
    let cls = null;
    if (r) {
      if (!c.awake) cls = '밤';
      else { const a = npc._lifeAct; cls = a === '개간' ? '개간' : a === '벌목' ? '벌목' : (a === '운반' || a === '저장') ? '통나무' : '현장'; }
    }
    note(npc, c.now, cls, vid, c.maxGap);
  } catch (e) { if (rec.errors.length < 20) rec.errors.push(String(e.stack || e)); }
  return r;
};
const bhStep = BH.step;
BH.step = function (p, task, ctx) {
  const terr = (task && task.kind === 'terr') || (!task && p._t1181Haul && String(p._t1181Haul.key || '').startsWith('t/'));
  if (terr && task && ctx && typeof ctx.take === 'function') { const take = ctx.take, vid = task.sourceVillageId; ctx = Object.assign({}, ctx, { take: (k, n) => { const q = take(k, n); if (q > 0) { V(vid).trips++; V(vid).took += q; } return q; } }); }
  const r = bhStep.call(this, p, task, ctx);
  if (!terr) return r;
  try {
    const vid = task ? task.sourceVillageId : p.simVillageId;
    let cls = null;
    if (r) {
      if (!ctx.awake) cls = '밤';
      else {
        const H = p._t1181Haul, carrying = !!(H && H.n > 0);
        const need = task ? (task.need().wood || 0) : 0, have = task ? ((task.site.mat && task.site.mat.wood) || 0) : 0;
        const vil = S().byDbId && S().byDbId.get(vid);
        if (!carrying && have + 1e-9 < need && vil && vil.econ && E.woodSpare(vil.econ) < 1) cls = '기다림';
        else cls = '말뚝';
      }
    }
    note(p, ctx.now, cls, vid, ctx.maxGap);
  } catch (e) { if (rec.errors.length < 20) rec.errors.push(String(e.stack || e)); }
  return r;
};
const LIFE_CREW = () => { try { return require(path.join(ROOT, 'server/villages')).__labProbe._t400Probe.LIFE_CREW; } catch (e) { return 2; } };
const create = Ev.createLedger;
Ev.createLedger = function () {
  const L = create.apply(this, arguments), scan = L.scanDay;
  L.scanDay = function (world, day) {
    const result = scan.apply(this, arguments);
    try {
      const st = S(), P = st.deps.players, LC = LIFE_CREW();
      const vils = st.villages.map((v) => {
        const r = vd.get(v.dbId) || day0();
        const bodies = (v.npcPids || []).filter((pid) => P.has(pid));
        const fit = bodies.filter((pid) => { const p = P.get(pid); return p && !p.isDown && !(p.hp != null && !(p.hp > 0)) && !p._rest; }).length;
        const houseCrew = (E.T400_BUILD_ACT && v._site) ? LC : 0, granCrew = (E.T435_GRANARY_ACT && v._granPend) ? LC : 0;
        const T = v._t1207 || {};
        const pend = v._t1207Pend || [];
        const ms = {}, px = {}; for (const k of CLS) { ms[k] = Math.round(r.ms[k] / 1000); px[k] = Math.round(r.px[k]); }
        return { n: v.name, pop: (v.econ && v.econ.npcs) ? v.econ.npcs.length : 0, bodies: bodies.length, fit, spare: Math.max(0, bodies.length - houseCrew - granCrew),
          site: !!v._site, gran: !!v._granPend, bridge: (st._t527Sites || []).some((b) => !b.done && (b.v.indexOf(v.name) >= 0 || (v._seedName && b.v.indexOf(v._seedName) >= 0))),
          pend: pend.length, pendWood: +pend.reduce((a, j) => a + Math.max(0, (j.wood || 0) - ((j.mat && j.mat.wood) || 0)), 0).toFixed(2),
          held: pend.filter((j) => j._t1329By != null).length,
          done: T.body || 0, terr: v._terrSet ? v._terrSet.size : 0, jobBodies: r.bodies.size, cuts: r.cuts, trips: r.trips, took: +r.took.toFixed(2), s: ms, px,
          head: pend[0] ? { k: pend[0].key, wood: +(pend[0].wood || 0).toFixed(2), mat: +((pend[0].mat && pend[0].mat.wood) || 0).toFixed(2), work: Math.round(pend[0].workMs || 0), lab: +(pend[0].laborMin || 0).toFixed(2),
            m: +(pend[0].m || 0).toFixed(2), r: +Math.hypot(pend[0].cx - v.ccx, pend[0].cy - v.ccy).toFixed(1), by: pend[0]._t1329By != null ? 1 : 0 } : null,
          crew: ((v._t1329Crew && v._t1329Crew.pids) || (v._t1302Crew ? [v._t1302Crew.pid] : [])).map((pid) => { const p = P.get(pid); if (!p) return { pid, gone: 1 };
            const T2 = p._t1302Terr, H = p._t1181Haul, j = pend.find((q) => T2 ? 't/' + q.key === T2.key : H ? 't/' + q.key === H.key : false);
            return { act: p._lifeAct || null, tk: (T2 && T2.key) || null, cl: T2 && T2.cleared ? 1 : 0, cargo: T2 ? +Object.values(T2.cargo || {}).reduce((a, b) => a + b, 0).toFixed(2) : 0,
              hk: (H && H.key) || null, leg: (H && H.leg) || null, hn: (H && H.n) || 0, d: j ? Math.round(Math.hypot(p.x - (j.cx * 32 + 16), p.y - (j.cy * 32 + 16))) : null, rest: p._rest ? 1 : 0, hp: p.hp }; }),
          woodSpare: v.econ ? +E.woodSpare(v.econ).toFixed(2) : null, wood: v.econ ? +(v.econ.storage.wood || 0).toFixed(2) : null, need: v.econ ? (v.econ._t1207Need || 0) : 0 };
      });
      const row = { day, done: vils.reduce((a, v) => a + v.done, 0), pend: vils.reduce((a, v) => a + v.pend, 0), jobBodies: vils.reduce((a, v) => a + v.jobBodies, 0), vils };
      fs.appendFileSync(OUT + '-days.jsonl', JSON.stringify(row) + '\n');
      rec.days++; vd.clear();
      if (day % 10 === 0) fs.writeFileSync(OUT + '.json', JSON.stringify(rec));
    } catch (e) { if (rec.errors.length < 20) rec.errors.push(String(e.stack || e)); }
    return result;
  };
  return L;
};
process.on('exit', () => { try { fs.writeFileSync(OUT + '.json', JSON.stringify(rec)); } catch (e) {} });

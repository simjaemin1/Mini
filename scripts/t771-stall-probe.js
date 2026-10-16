// (@regress 없음 — 러너 밖 · T771 계측기 · 제품 무변 · 읽기만 · T764 관찰자(`t764-arms-probe.js`)의 꼴)
// === scripts/t771-stall-probe.js — **전쟁 교착 관찰자**: 한 쌍(공격 ↔ 방어)의 전쟁 몸 · 교전 상태를 날마다 · 표본마다 · 사건마다 적는다 ==========
//   쓰는 법(T650 · 전쟁 자): NODE_OPTIONS="--require <이 파일>" T771_PAIR=임업2>광산5 … node scripts/t577-server-run.js 50 <시드>
//     · 아이 존에서만 선다(`T577_OUT` 이 선 쪽 · 판 JSON 옆 `.t771.json`) · 주 스레드만(일꾼 스레드는 세계가 없다)
//     · `T771_PAIR` = "공격>방어"(기본 임업2>광산5) — 두 방향 다 잡는다 · `T771_SAMPLE_MS`(기본 1000) = 몸 표본 간격
//   ★잰다
//     · 날(하루 마감 장부 `scanDay` 앞): 그 쌍의 전쟁마다 war-core 칸 — 국면 · 작전 · 출격 표 · 방어 태세 · 도착 날 · 그날 교전 걸음(`stepFight` 부른 수) ·
//       그날 걸음 몫 남은 것(T681 `_t681q`) · 그날 사건 셈(접촉 시작 · 대치 · 궤주)
//     · 표본: 몸 국면 · 모드 · 방어 소집 여부 · 교전 상태(form/advance/engaged) · 진척 시계(t · gapT · contactT · bestGap) · 전진 칸(adv — 쪽 · 풀림 · s · sT) ·
//       두 쪽 무게중심 · 거리(m) · 두 대형 지휘관 자리 · 포진점 · 주둔점
//     · 사건(`stepFight` 감싸기 — 같은 인수 · 같은 반환): 접촉 시작 · 대치 · 궤주 — 그 순간 병사마다 [쪽 · 생존 · 상태 · 지휘 · 궤주 · x · y · 병종 · 막힌 칸 · hp] · 쪽마다 탄(화살 · 돌) ·
//       대치 시계(t − max(contactT, gapT) > standoffSec)
//   ★관찰만 한다 — 감싼 함수에 같은 인수를 그대로 넘기고 그 값을 그대로 돌려준다.
'use strict';
const OUT = process.env.T771_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t771.json' : '');
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN) {
  const fs = require('fs');
  const Module = require('module');
  const PAIR = String(process.env.T771_PAIR || '임업2>광산5').split('>');
  const SAMPLE_MS = +process.env.T771_SAMPLE_MS || 1000;
  let VIL = null, wrapped = false, B = null;
  const r1 = (x) => (Number.isFinite(x) ? +x.toFixed(1) : null);
  const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : null);
  const days = [], samples = [], events = [], perDay = new Map();
  const S = () => { try { return VIL && VIL.__p3Bind ? VIL.__p3Bind({}).state : null; } catch (e) { return null; } };
  const hit = (w) => !!(w && w.atk && w.def && ((w.atk.name === PAIR[0] && w.def.name === PAIR[1]) || (w.atk.name === PAIR[1] && w.def.name === PAIR[0])));
  const dayKey = (s, w) => (s && s.world ? s.world.day : null) + ':' + w.id;
  const pd = (s, w) => { const k = dayKey(s, w); let o = perDay.get(k); if (!o) { o = { steps: 0, contactOn: 0, standoff: 0, rout: 0 }; perDay.set(k, o); } return o; };
  const unitsOf = (f, s) => { const bl = (() => { try { return B && B._warBlockedCell; } catch (e) { return null; } })();
    return f.ctx.units.map((u) => [u.side, u.hp > 0 ? 1 : 0, u.st || null, u.ctl ? 1 : 0, u.routing ? 1 : 0, r1(u.x), r1(u.y), u.type, bl ? (bl(u.x, u.y) ? 1 : 0) : null, r1(u.hp)]); };
  const ammoOf = (f) => { const o = {}; try { for (const sd of ['A', 'B']) { const x = f.ctx.sides[sd] || {}; o[sd] = [x.arrows != null ? x.arrows : null, x.stones != null ? x.stones : null]; } } catch (e) {} return o; };
  const fightOf = (f, s) => {
    if (!f) return null; const WL = s.warLive; const ca = WL.centroid(f, 'A'), cb = WL.centroid(f, 'B');
    let sec = null; try { sec = WL.standoffSec(f); } catch (e) {}
    return { state: f.state, t: r3(f.t), gapT: r3(f.gapT), contactT: r3(f.contactT), bestGap: r1(f.bestGap), sec: r3(sec), engagedOnce: !!f.engagedOnce, contacts: f.contacts | 0, standoffs: f.standoffs | 0,
      holder: f.holder || null, adv: f.adv ? { side: f.adv.side, released: !!f.adv.released, s: r1(f.adv.s), sT: r1(f.adv.sT) } : null,
      A: ca ? [r1(ca.x), r1(ca.y), ca.n] : null, B: cb ? [r1(cb.x), r1(cb.y), cb.n] : null, gap: ca && cb ? r1(Math.hypot(ca.x - cb.x, ca.y - cb.y)) : null,
      ammo: ammoOf(f), units: unitsOf(f, s) };
  };
  const bodyOf = (b) => {
    if (!b) return null; const ag = b.atkGroup, dg = b.defGroup;
    return { phase: b.phase, mode: b.mode || null, defBuilt: !!b.defBuilt, q: b._t681q ? b._t681q.left : null, prog: r1(b.prog), campProg: r1(b.campProg), len: r1(b.len),
      cmd: b.cmd ? [r1(b.cmd.cx), r1(b.cmd.cy)] : null, campPt: b.campPt ? [r1(b.campPt.cx), r1(b.campPt.cy)] : null,
      ag: ag ? [r1(ag.cmd.cx), r1(ag.cmd.cy), ag.units.length] : null, dg: dg ? [r1(dg.cmd.cx), r1(dg.cmd.cy), dg.units.length] : null,
      holdPt: dg && dg.holdPt ? [r1(dg.holdPt.cx), r1(dg.holdPt.cy)] : null, pids: (b.pids || []).length, defPids: (b.defPids || []).length };
  };
  const warOf = (w) => ({ id: w.id, atk: w.atk.name, def: w.def.name, phase: w.phase, op: w.op || null, sortie: !!w._sortie, defMode: w._defMode || null, born: w.born, eta: w.eta, arrive: w._arriveDay != null ? w._arriveDay : null, force: w.force });
  const wrap = (s) => {
    if (wrapped || !s || !s.warLive || typeof s.warLive.stepFight !== 'function') return;
    wrapped = true;
    const WL = s.warLive, sf = WL.stepFight;
    WL.stepFight = function (f) {
      const pre = f && hit(f.w) ? { state: f.state, contactT: f.contactT } : null;
      const ev = sf.apply(this, arguments);
      try {
        if (pre) {
          const s2 = S(); const o = pd(s2, f.w); o.steps++;
          const on = ev.contact && pre.state !== 'engaged' && f.state === 'engaged';
          if (on) o.contactOn++; if (ev.standoff) o.standoff++; if (ev.rout) o.rout++;
          if (on || ev.standoff || ev.rout) events.push({ day: s2 && s2.world ? s2.world.day : null, at: Date.now(), kind: ev.rout ? 'rout:' + ev.rout : (ev.standoff ? 'standoff' : 'contact'), war: warOf(f.w),
            fight: fightOf(f, s2), body: bodyOf(s2.warBodies && s2.warBodies.get(f.w.id)), units: unitsOf(f, s2) });
          if (events.length > 4000) events.splice(0, events.length - 4000);
        }
      } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
      return ev;
    };
  };
  const sample = (tag) => {
    const s = S(); if (!s || !s.war) return; wrap(s);
    for (const w of s.war.WARS || []) { if (!hit(w)) continue; const b = s.warBodies && s.warBodies.get(w.id);
      samples.push({ tag, at: Date.now(), day: s.world ? s.world.day : null, war: warOf(w), body: bodyOf(b), fight: b ? fightOf(b.fight, s) : null }); }
    if (samples.length > 20000) samples.splice(0, samples.length - 20000);
  };
  const record = (world) => {
    try {
      const s = S(); if (!s || !s.war) return; wrap(s);
      const d = world && world.day; const row = { day: d, wars: [] };
      for (const w of s.war.WARS || []) { if (!hit(w)) continue; const b = s.warBodies && s.warBodies.get(w.id);
        row.wars.push(Object.assign(warOf(w), { body: bodyOf(b), fight: b ? fightOf(b.fight, s) : null, tally: perDay.get(dayKey(s, w)) || null })); }
      days.push(row); sample('d' + d);
    } catch (e) {}
  };
  const dump = () => { try {
    const s = S(); const log = (() => { try { return (s && s.world && s.world._warStats && s.world._warStats.log) || null; } catch (e) { return null; } })();
    fs.writeFileSync(OUT, JSON.stringify({ pair: PAIR, knobs: { T403_ARMS_LEDGER: process.env.T403_ARMS_LEDGER || null, T771: Object.fromEntries(Object.entries(process.env).filter(([k]) => /^T771_(?!OUT$|PAIR$|SAMPLE_MS$)/.test(k))) },
      at: Date.now(), days, events, samples, perDay: [...perDay.entries()], warStat: s && s._warStat ? Object.assign({}, s._warStat) : null, log: log ? log.filter((x) => x.indexOf(PAIR[0]) >= 0 || x.indexOf(PAIR[1]) >= 0) : null }));
  } catch (e) {} };
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && typeof m.createLedger === 'function' && !m.__t771) {
        m.__t771 = true; const mk = m.createLedger;
        m.createLedger = function () { const L = mk.apply(this, arguments); const sd = L.scanDay; L.scanDay = function (world) { record(world); return sd.apply(this, arguments); }; return L; };
      }
      if (m && !VIL && m.__p3Bind && typeof m.villageOfCell === 'function') { VIL = m; try { B = m.__p3Bind({}); } catch (e) { B = null; } }
    } catch (e) {}
    return m;
  };
  const t1 = setInterval(() => sample('t' + Math.round(Date.now() / 1000)), SAMPLE_MS); if (t1.unref) t1.unref();
  process.on('exit', dump);
}

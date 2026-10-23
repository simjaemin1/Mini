// (@regress 없음 — 러너 밖 · T874 계측기 · 제품 무변 · 읽기만)
// === scripts/t874-fight-probe.js — 교전 틱 µs · 대형 걸음 µs · 교전 객체 꼴(%HasFastProperties) ===============================
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t874-fight-probe.js" node scripts/t577-server-run.js 50 1020   (전쟁 자 조건 그대로)
//   존 아이 프로세스(T577_OUT 있는 본 실)만 잰다 · 판 JSON 곁 `<판>-<시드>.json.t874.json`.
//   war-live 객체의 문 셋(stepFight · _muStepFollow · _muDefHold)을 감싸 같은 인수 · 같은 반환으로 부르고 그 시간만 더한다(hrtime).
//   ★[T900] 손잡이 칸 `knob` — 켬 기본이라 `T874_BATTLE_FAST=0` 만 끔(null) · 빈 값 = '기본'(켬) · 다른 글자는 그 글자(켬).
//   꼴 표본: 교전 30스텝마다(교전 1초) 그 교전의 핸들 · ctx · 병사 전부 · 대형 걸음 30번마다 그 대형의 병사 · 지휘관 — 빠른 꼴 / 사전 수(겹쳐 센다 · 객체 수는 WeakSet 으로 따로).
'use strict';
const OUT = process.env.T577_OUT ? process.env.T577_OUT + '.t874.json' : '';
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN) {
  const fs = require('fs'), Module = require('module');
  require('v8').setFlagsFromString('--allow-natives-syntax');
  const HFP = new Function('o', 'return %HasFastProperties(o)'), SM = new Function('a', 'b', 'return %HaveSameMap(a, b)');
  let VIL = null, S = null, wrapped = false;
  const rec = { knob: process.env.T874_BATTLE_FAST === '0' ? null : (process.env.T874_BATTLE_FAST || '기본'), fight: { calls: 0, ns: 0, units: 0, alive: 0 }, follow: { calls: 0, ns: 0, units: 0 }, hold: { calls: 0, ns: 0, units: 0 },
    shape: { handle: [0, 0], ctx: [0, 0], unit: [0, 0], gu: [0, 0], cmd: [0, 0] }, objs: { handle: [0, 0], unit: [0, 0], gu: [0, 0] }, fights: 0, days: {},
    unitKeys: {}, unitMaps: [0, 0], guKeys: {}, guMaps: [0, 0] };   // 병사 · 대형 병사 칸 꼴(앞 칸 뒤 이름 줄) · 표본마다 그 교전 병사 · 그 대형 병사들이 쓰는 지도 수(합 · 표본 수)
  const keyTally = (u) => { const k = Object.keys(u).slice(17).join(','); if (rec.unitKeys[k] != null || Object.keys(rec.unitKeys).length < 40) rec.unitKeys[k] = (rec.unitKeys[k] || 0) + 1; };
  const guTally = (u) => { const k = Object.keys(u).slice(4).join(','); if (rec.guKeys[k] != null || Object.keys(rec.guKeys).length < 40) rec.guKeys[k] = (rec.guKeys[k] || 0) + 1; };
  const mapCount = (us) => { const reps = []; for (const u of us) if (!reps.some((r) => SM(r, u))) reps.push(u); return reps.length; };
  const seen = { handle: new WeakSet(), unit: new WeakSet(), gu: new WeakSet() };
  const tally = (k, o) => { if (!o || typeof o !== 'object') return; const f = HFP(o) ? 0 : 1; rec.shape[k][f]++;
    if (seen[k] && !seen[k].has(o)) { seen[k].add(o); rec.objs[k][f]++; } };
  const day = () => (S && S.world ? S.world.day | 0 : -1);
  const fseen = new WeakSet();
  const wrap = () => {
    if (wrapped || !VIL) return; try { S = VIL.__p3Bind({}).state; } catch (e) { return; } if (!S || !S.warLive) return; wrapped = true;
    const WL = S.warLive, now = process.hrtime.bigint;
    const st = WL.stepFight; WL.stepFight = function (f) {
      const t0 = now(); const r = st.apply(this, arguments); const dt = Number(now() - t0);
      const F = rec.fight; F.calls++; F.ns += dt;
      if (f && f.ctx) { const us = f.ctx.units; F.units += us.length; let a = 0; for (const u of us) if (u.hp > 0) a++; F.alive += a;
        if (!fseen.has(f)) { fseen.add(f); rec.fights++; }
        const d = day(), D = rec.days[d] || (rec.days[d] = [0, 0, 0]); D[0]++; D[1] += dt; D[2] += us.length;
        if (F.calls % 30 === 1) { tally('handle', f.handle); tally('ctx', f.ctx); for (const u of us) { tally('unit', u); keyTally(u); } if (us.length) { rec.unitMaps[0] += mapCount(us); rec.unitMaps[1]++; } } }
      return r; };
    const sf = WL._muStepFollow; WL._muStepFollow = function (g) {
      const t0 = now(); const r = sf.apply(this, arguments); const dt = Number(now() - t0);
      const F = rec.follow; F.calls++; F.ns += dt; if (g && g.units) { F.units += g.units.length; if (F.calls % 30 === 1) { for (const u of g.units) { tally('gu', u); guTally(u); } tally('cmd', g.commander); if (g.units.length) { rec.guMaps[0] += mapCount(g.units); rec.guMaps[1]++; } } }
      return r; };
    const dh = WL._muDefHold; WL._muDefHold = function (g) {
      const t0 = now(); const r = dh.apply(this, arguments); const dt = Number(now() - t0);
      const F = rec.hold; F.calls++; F.ns += dt; if (g && g.units) { F.units += g.units.length; if (F.calls % 30 === 1) { for (const u of g.units) { tally('gu', u); guTally(u); } tally('cmd', g.commander); if (g.units.length) { rec.guMaps[0] += mapCount(g.units); rec.guMaps[1]++; } } }
      return r; };
  };
  const t = setInterval(() => { try { wrap(); } catch (e) {} }, 200); if (t.unref) t.unref();
  const _load = Module._load;
  Module._load = function () { const m = _load.apply(this, arguments);
    try { if (m && !VIL && m.__p3Bind && typeof m.villageOfCell === 'function') VIL = m; } catch (e) {}
    return m; };
  process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
}

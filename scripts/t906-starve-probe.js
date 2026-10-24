// (@regress 없음 — 러너 밖 · T906 계측기 · 제품 무변 · 읽기만 · `t886-ration-probe` 의 꼴)
// === scripts/t906-starve-probe.js — **원정이 굶으면(T906) 관찰자**: 원정 몸 굶주림 사다리 · 굶어 죽음 · 결판 · 사상 · 귀환 ==================
//   쓰는 법: NODE_OPTIONS="--require <이 파일>" … node scripts/t577-server-run.js 50 <시드>(아이 존 · `T577_OUT` 이 선 쪽 · 판 JSON 옆 `.t906.json`)
//   ★잰다 — econ 날마다(하루 마감 장부 `scanDay` 앞) · 원정(`S.war.WARS`)마다:
//     · 국면 날 수 · 산 짐꾼 몸 수(`_warPackOf === w.id` · hp > 0) · 사다리 표 `w._starve`(손잡이 켤 때만 선다 — 몸마다 게이지 · 최저 · 잃은 HP · 굶은 날)
//     · 장부 칸(T886 `unfed` · `hungryDays` + T906 `starveDead` · `starveEcon` · `starveWiped` — 몸이 다 굶어 죽은 날)
//   ★결판 · 귀환 — war-core 가 찍는 그 줄(전투 → 공격승|방어승 사상 · 귀환 — 징발 해제)을 그 순간 살아 있는 원정에 붙인다(console.log 를 감싸 읽기만)
//   ★판 끝: 원정마다 위 칸 + 마지막 국면 · 국면마다 마지막으로 본 산 짐꾼(귀환 몸 = 귀환 국면의 값) · 세계 셈(`_warStat.t906` — 손잡이 켤 때만) · 마을 인구(공격 · 방어 econ)
//   ★관찰만 한다 — 세계에 아무것도 안 쓴다.
'use strict';
const OUT = process.env.T906_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t906.json' : '');
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN) {
  const fs = require('fs');
  const Module = require('module');
  let VIL = null;
  const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(4) : null);
  const st = () => { try { return VIL && VIL.__p3Bind ? VIL.__p3Bind({}).state : null; } catch (e) { return null; } };
  const R = { samples: 0, wars: new Map() };
  const alive = (S, w) => { const P = S.deps && S.deps.players; let n = 0; if (!P) return 0; for (const [, p] of P) if (p && p._warPackOf === w.id && (p.hp == null || p.hp > 0)) n++; return n; };
  const look = (S, w, tag) => {
    const o = R.wars.get(w.id) || (R.wars.set(w.id, { w, id: w.id, atk: w.atk && w.atk.name, def: w.def && w.def.name, first: tag, phases: {}, bearersMax: 0, alivePhase: {}, phaseLast: null,
      atkPop0: w.atk && w.atk.econ ? w.atk.econ.npcs.length : null, defPop0: w.def && w.def.econ ? w.def.econ.npcs.length : null, day0: S.world ? S.world.day : null, battles: [], home: [] }), R.wars.get(w.id));
    const a = alive(S, w); o.bearersMax = Math.max(o.bearersMax, a);
    if (!o.closed) { o.phaseLast = w.phase || null; o.opLast = w.op || null; if (a > 0) o.alivePhase[w.phase || '-'] = a; }   // 국면마다 마지막으로 본 산 짐꾼(내려놓으면 짐꾼 표식이 풀린다 — 귀환 몸 = 귀환 국면의 마지막 값)
    if (tag[0] === 'd') o.phases[w.phase || '-'] = (o.phases[w.phase || '-'] || 0) + 1;
  };
  const sample = (tag) => {
    const S = st(); if (!S || !S.war) return; R.samples++;
    for (const w of (S.war.WARS || [])) look(S, w, tag);
    for (const o of R.wars.values()) if (!(S.war.WARS || []).includes(o.w) && !o.closed) { o.closed = tag; o.day1 = S.world ? S.world.day : null; }
  };
  //   ★결판 · 귀환 줄 — war-core 가 찍는 그 줄(`D<날> 전투 <공> vs <방>[…] → 공격승|방어승 사상 공X·방Y` · `D<날> <공> 귀환 — … 징발 해제 N명`)을 그 순간 살아 있는 원정(이름 짝)에 붙인다(읽기만)
  //   줄은 하루 마감 뒤 링 버퍼에서 찍힌다(VILLAGE_WAR_LOG — 그때 원정은 이미 목록 밖일 수 있다) ⇒ 본 원정 기록(이름 짝 · 첫 날 ≤ 그 날 ≤ 닫힌 날 + 1) 중 가장 늦게 선 것
  const pick = (day, atk, def) => { let best = null; for (const o of R.wars.values()) { if (o.atk !== atk || (def && o.def !== def)) continue; if (o.day0 != null && o.day0 > day) continue; if (o.day1 != null && day > o.day1 + 1) continue; if (!best || (o.day0 || 0) >= (best.day0 || 0)) best = o; } return best; };
  const _cl = console.log;
  console.log = function () {
    try { const s = String(arguments[0] || ''); const S = s.indexOf('⚔️ D') >= 0 ? st() : null; if (S && S.war) {
      let m = /⚔️ D(\d+) 전투 (\S+) vs (\S+?)\[[^\]]*\] → (공격승|방어승) 사상 공(\d+)·방(\d+)/.exec(s);
      if (m) { const o = pick(+m[1], m[2], m[3]); if (o) o.battles.push({ day: +m[1], win: m[4] === '공격승' ? 'A' : 'B', atkCas: +m[5], defCas: +m[6] }); }
      m = /⚔️ D(\d+) (\S+) 귀환 — (.*?)징발 해제 (\d+)명/.exec(s);
      if (m) { const o = pick(+m[1], m[2], null); if (o) o.home.push({ day: +m[1], why: m[3].replace(/ — $/, '').trim(), freed: +m[4] }); } } } catch (e) {}
    return _cl.apply(this, arguments);
  };
  const dump = () => {
    try {
      const S = st();
      const ws = S && S.world && S.world._warStats;
      const t906 = S && S._warStat ? (S._warStat.t906 || null) : null;
      const wars = [...R.wars.values()].map((o) => { const w = o.w, b = w._rationBook || {}, tb = w._starve;
        const bodies = tb ? [...tb.entries()].map(([pid, e]) => ({ pid, h: r3(e.h), min: r3(e.min), lost: r3(e.lost), days: e.days, hungry: e.hungry })) : null;
        return { id: o.id, atk: o.atk, def: o.def, first: o.first, closed: o.closed || null, day0: o.day0, day1: o.day1 == null ? null : o.day1, battles: o.battles, home: o.home, phaseDays: o.phases, phaseLast: o.phaseLast, opLast: o.opLast || null, bearersMax: o.bearersMax, alivePhase: o.alivePhase,
          unfed: r3(b.unfed || 0), hungryDays: b.hungryDays || 0, starveDead: b.starveDead || 0, starveEcon: b.starveEcon || 0, starveWiped: b.starveWiped == null ? null : b.starveWiped, drop: r3(b.drop || 0), back: r3(b.back || 0), eaten: r3(b.eaten || 0),
          atkPop0: o.atkPop0, atkPop: w.atk && w.atk.econ ? w.atk.econ.npcs.length : null, defPop0: o.defPop0, defPop: w.def && w.def.econ ? w.def.econ.npcs.length : null, bodies }; });
      const tot = (k) => r3(wars.reduce((a, x) => a + (x[k] || 0), 0));
      fs.writeFileSync(OUT, JSON.stringify({ knobs: { T906_ARMY_STARVE: process.env.T906_ARMY_STARVE == null ? null : process.env.T906_ARMY_STARVE, T295_RATION_MRL: process.env.T295_RATION_MRL == null ? null : process.env.T295_RATION_MRL },
        ws: ws ? { decl: ws.decl, battle: ws.battle, atkWin: ws.atkWin, defWin: ws.defWin, cas: ws.cas } : null, t906: t906 ? Object.assign({}, t906, { deadDays: (t906.deadDays || []).slice(0, 64) }) : null,
        samples: R.samples, wars: wars.length, sum: { unfed: tot('unfed'), hungryDays: tot('hungryDays'), starveDead: tot('starveDead'), starveEcon: tot('starveEcon'), drop: tot('drop'), back: tot('back'), eaten: tot('eaten') }, list: wars }));
    } catch (e) {}
  };
  const _load = Module._load;
  let hooked = false;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && !hooked && typeof m.createLedger === 'function') {
        hooked = true; const mk = m.createLedger;
        m.createLedger = function () { const L = mk.apply(this, arguments); const sd = L.scanDay; L.scanDay = function (world) { try { sample('d' + (world && world.day)); } catch (e) {} return sd.apply(this, arguments); }; return L; };
      }
      if (m && !VIL && m.__p3Bind && typeof m.villageOfCell === 'function') VIL = m;
    } catch (e) {}
    return m;
  };
  const t = setInterval(() => { try { sample('s'); } catch (e) {} }, 1000); if (t.unref) t.unref();
  process.on('exit', () => { try { sample('end'); } catch (e) {} dump(); });
}

// (@regress 없음 — 러너 밖 · T906 계측기 · 제품 무변 · 읽기만 · `t886-ration-probe` 의 꼴)
// === scripts/t906-starve-probe.js — **원정이 굶으면(T906) 관찰자**: 원정 몸 굶주림 사다리 · 굶어 죽음 · 결판 · 사상 · 귀환 ==================
//   쓰는 법: NODE_OPTIONS="--require <이 파일>" … node scripts/t577-server-run.js 50 <시드>(아이 존 · `T577_OUT` 이 선 쪽 · 판 JSON 옆 `.t906.json`)
//   ★잰다 — econ 날마다(하루 마감 장부 `scanDay` 앞) · 원정(`S.war.WARS`)마다:
//     · 국면 날 수 · 산 짐꾼 몸 수(`_warPackOf === w.id` · hp > 0) · 사다리 표 `w._starve`(손잡이 켤 때만 선다 — 몸마다 게이지 · 최저 · 잃은 HP · 굶은 날)
//     · 장부 칸(T886 `unfed` · `hungryDays` + T906 `starveDead` · `starveEcon`)
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
      atkPop0: w.atk && w.atk.econ ? w.atk.econ.npcs.length : null, defPop0: w.def && w.def.econ ? w.def.econ.npcs.length : null }), R.wars.get(w.id));
    const a = alive(S, w); o.bearersMax = Math.max(o.bearersMax, a);
    if (!o.closed) { o.phaseLast = w.phase || null; o.opLast = w.op || null; if (a > 0) o.alivePhase[w.phase || '-'] = a; }   // 국면마다 마지막으로 본 산 짐꾼(내려놓으면 짐꾼 표식이 풀린다 — 귀환 몸 = 귀환 국면의 마지막 값)
    if (tag[0] === 'd') o.phases[w.phase || '-'] = (o.phases[w.phase || '-'] || 0) + 1;
  };
  const sample = (tag) => {
    const S = st(); if (!S || !S.war) return; R.samples++;
    for (const w of (S.war.WARS || [])) look(S, w, tag);
    for (const o of R.wars.values()) if (!(S.war.WARS || []).includes(o.w) && !o.closed) { o.closed = tag; }
  };
  const dump = () => {
    try {
      const S = st();
      const ws = S && S.world && S.world._warStats;
      const t906 = S && S._warStat ? (S._warStat.t906 || null) : null;
      const wars = [...R.wars.values()].map((o) => { const w = o.w, b = w._rationBook || {}, tb = w._starve;
        const bodies = tb ? [...tb.entries()].map(([pid, e]) => ({ pid, h: r3(e.h), min: r3(e.min), lost: r3(e.lost), days: e.days, hungry: e.hungry })) : null;
        return { id: o.id, atk: o.atk, def: o.def, first: o.first, closed: o.closed || null, phaseDays: o.phases, phaseLast: o.phaseLast, opLast: o.opLast || null, bearersMax: o.bearersMax, alivePhase: o.alivePhase,
          unfed: r3(b.unfed || 0), hungryDays: b.hungryDays || 0, starveDead: b.starveDead || 0, starveEcon: b.starveEcon || 0, drop: r3(b.drop || 0), back: r3(b.back || 0), eaten: r3(b.eaten || 0),
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

// 서버 판 계측(세계 0 · 읽기만) — T1405: 떠나는 주민 — 누가 · 왜 떠나나(행복 h = 느린 S − 부담 B · 출생 깎임 · 들어온 이주 · 영토 · K 셋)
//   싣는 법: 아이 존 프리로드(`NODE_OPTIONS=--require <이 파일>`) · `T577_OUT` 이 있을 때만 깬다(판 자가 아이에 준다) · 레포 뿌리 = `T1405_ROOT`.
//   마을-날 줄(`COLS` 차례 · econ 하루 끝 — 장부 `scanDay` 뒤 · T1363 · T1391 훅과 같은 자리):
//     사람 N · 영토 T(생활층 `_terrSet` 셀 수) · 목표 영토 Tt(econ 땅 size × 25 — 맵층 목표 `EXPAND_CELLS_PER_SLOT`) ·
//     행복 h · 느린 S · 부담 B · 좋은 것 G(사치품 몫 포함) · 사치품 몫 · 겪은 일 E · S 의 목표 ·
//     난 사람(그 마을 계수기 id 가 새로 선 사람 — T731 `n<마을>.<번호>`) · 들어온 사람(다른 마을 id 가 새로 든 사람 — 이주 · 도착) · 그 들어온 사람의 떠난 마을(이름 → 수) ·
//     떠난 사람(econ `_emigTot` 차) · 0.25 에 닿아 멈춘 날(`_t1205Stop` 차) · 죽음 셋(굶어 · 자연사 · K 위 — 누계 차) ·
//     인구 식(`_dpDebug` — K · 로지스틱 · 행복 항 · 건강 · 위신 · dP · 주거 막힘) · K 셋(`_kDbg` — 자리 · 식량 흐름 · 땔감) ·
//     곳간 날 수 · 주거 · 지은 침상 · 이탈 압력(`_emigAccum`) · 그날 불행 이탈 문(부른 수 · 이주 · 남음 — `world.t1075Emigrate` 를 같은 인자로 그대로 부르는 겉싸개) · 도구 몫(T1363 칸)
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 칸을 읽고 순수 함수(식량 환산)만 부른다(끈 판이 기준선과 같아야 한다). 30날마다 · 끝에 `<T577_OUT>.t1405.json`.
//   ★반사실(판 자 · 제품 손 0 · `T1405_CF_STOP=1` 일 때만): 느린 행복 S 의 위 끝을 h 의 위 끝(1)에 — 그날 줄을 적은 뒤 마을마다 `_t1205S` 를 1 로 내린다
//     (다음 날 S 는 1 에서 목표로 한 걸음 — 반감기 30날 한 날 몫 ≤ 2.3% 만 1 위로 · 그날 끝에 다시 1). "200명 벽"이 S 가 1 언저리일 때 서는지 보는 판 자다(T1380 PM 셈의 전제).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1405_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const COLS = ['day', 'v', 'N', 'T', 'Tt', 'h', 'S', 'B', 'G', 'lux', 'E', 'Seq', 'born', 'imm', 'immFrom', 'emig', 'stop', 'fd', 'nat', 'kov', 'dead',
    'K', 'logi', 'happy', 'health', 'prest', 'dP', 'gated', 'Kslot', 'Kprod', 'Kfuel', 'fdays', 'housing', 'beds', 'acc', 'emTry', 'emMove', 'emStay', 'tc'];
  const names = [], nameIdx = new Map(), rows = [];
  const vi = (name) => { let i = nameIdx.get(name); if (i === undefined) { i = names.length; names.push(name); nameIdx.set(name, i); } return i; };
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  const r1 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 10) / 10;
  const prev = new Map(), ids = new Map();   // 마을 이름 → 누계 · 어제 사람 id 집합
  let lastDay = -1, lastWrite = -1;
  const sv = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')], VS = vm && vm.exports; return VS && VS.__labProbe && VS.__labProbe._t569Probe ? (VS.__labProbe._t569Probe.setup().villages || []) : []; };
  //   불행 이탈 문 겉싸개(T1391 훅 그 꼴 · 값 · 차례 무변) — 마을마다 그날 부른 수 · 참(이주) · 거짓(남음)
  const emToday = new Map();
  const wrapEmig = (W) => {
    if (!W || typeof W.t1075Emigrate !== 'function' || W.t1075Emigrate.__t1405) return;
    const og = W.t1075Emigrate;
    const f = function (v) {
      const r = og.apply(this, arguments);
      try { const o = emToday.get(v) || { n: 0, move: 0, stay: 0 }; o.n++; if (r) o.move++; else o.stay++; emToday.set(v, o); } catch (_) {}
      return r;
    };
    f.__t1405 = true; W.t1075Emigrate = f;
  };
  const prefixOf = (id) => { const s = String(id || ''); const m = /^n([^.]+)\./.exec(s); return m ? m[1] : null; };
  const dayRows = (day, world) => {
    const out = [], vils = sv(), idName = new Map();
    for (const vil of vils) { const e = vil && vil.econ; if (e && e.id != null) idName.set(String(e.id), vil.name); }
    for (const vil of vils) {
      const e = vil && vil.econ; if (!e || e.founder) continue;
      const i = vi(vil.name), N = (e.npcs || []).length, own = String(e.id);
      const cur = { emig: e._emigTot || 0, stop: e._t1205Stop || 0, fd: e._fdDeadTot || 0, nat: e._natDeadTot || 0, dead: e._deadTot || 0 };
      const p = prev.get(vil.name) || cur; prev.set(vil.name, cur);
      const seen = ids.get(vil.name), now = new Set();
      let born = 0, imm = 0; const from = {};
      for (const q of e.npcs || []) {
        now.add(q.id);
        if (seen && !seen.has(q.id)) {
          const pf = prefixOf(q.id);
          if (pf === own) born++;
          else { imm++; const nm = (pf != null && idName.get(pf)) || '?'; from[nm] = (from[nm] || 0) + 1; }
        }
      }
      ids.set(vil.name, now);
      const ls = e.lastStats || {}, dd = e._dpDebug || {}, k = e._kDbg || {};
      let fe = null; try { fe = N ? E.totalFoodEquivalent(e) / N : null; } catch (_) {}
      const em = emToday.get(e) || null;
      const kovC = cur.dead - cur.fd - cur.nat, kovP = p.dead - p.fd - p.nat;
      out.push([day, i, N, vil._terrSet ? vil._terrSet.size : null, e.land && e.land.size != null ? r1(e.land.size * 25) : null,
        r3(ls.happiness), r3(ls.happinessSlow), r3(ls.happinessBurden), r3(ls.happinessGoods), r3(ls.happinessLux), r3(e._t1134E), r3(ls.happinessEq),
        seen ? born : null, seen ? imm : null, imm ? from : null, cur.emig - p.emig, cur.stop - p.stop, cur.fd - p.fd, cur.nat - p.nat, kovC - kovP, cur.dead - p.dead,
        dd.K == null ? null : dd.K, dd.logi == null ? null : dd.logi, dd.happy == null ? null : dd.happy, dd.health == null ? null : dd.health, dd.prestige == null ? null : dd.prestige,
        dd.dP == null ? null : dd.dP, dd.gated ? 1 : 0, k.slot == null ? null : k.slot, k.prod == null ? null : k.prod, k.fuel == null ? null : k.fuel,
        r1(fe), e.housing == null ? null : r1(+e.housing), e._mapBeds == null ? null : e._mapBeds, r3(e._emigAccum), em ? em.n : 0, em ? em.move : 0, em ? em.stay : 0,
        (e._toolDeps > 0) ? r3(((e.storage && ((e.storage.tool || 0) + (e.storage.bronze_tool || 0) + (e.storage.iron_tool || 0))) || 0) / e._toolDeps) : null]);   // 도구 몫(곳간 도구 ÷ 도구 쓰는 일꾼 — T1363 칸)
    }
    emToday.clear();
    if (CF_STOP) for (const vil of vils) { const e = vil && vil.econ; if (e && !e.founder && e._t1205S > 1) { e._t1205S = 1; cfN++; } }   // 반사실(위 머리말) — 적은 뒤에
    return out;
  };
  const CF_STOP = process.env.T1405_CF_STOP === '1'; let cfN = 0;
  const dump = () => fs.writeFileSync(OUT + '.t1405.json', JSON.stringify({ env: { T1405_RECV: process.env.T1405_RECV || null, T1405_BIRTH: process.env.T1405_BIRTH || null, BUNDLE: process.env.T1334_BUNDLE || null, CF_STOP: CF_STOP ? cfN : null },
    cols: COLS, names, rows, last: lastDay, err: dayRows._err || null }));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      try { wrapEmig(world); } catch (_) {}
      const r = sd.apply(this, arguments);
      try {
        if ((day | 0) === lastDay) return r; lastDay = day | 0;
        for (const q of dayRows(lastDay, world)) rows.push(q);
        if (lastDay - lastWrite >= 30) { lastWrite = lastDay; dump(); }
      } catch (e) { if (!dayRows._err) { dayRows._err = String(e && e.stack || e); } }
      return r;
    };
    return Lg;
  };
  process.on('exit', () => { try { dump(); } catch (e) { try { fs.writeFileSync(OUT + '.t1405.json', JSON.stringify({ err: String(e && e.stack || e) })); } catch (_) {} } });
}

// === scripts/t449-probe.js — 존 프로세스 안 생활층을 들여다보는 **계측 전용** 예비 적재(T449 ②) =====================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 레포의 `server/villages.js` 는 **한 글자도 안 만진다**.
//   `node -r scripts/t449-probe.js server/zone.js` 로 띄우면 **적재 순간**에만 villages.js 원문 **뒤에** 한 줄을 덧붙여
//   컴파일한다(`state` 를 읽는 창 · 동작 0). `t432-probe.js` 와 같은 문법이다.
//
// ★읽는 법 — 존 프로세스에 `SIGUSR2` 를 보내면 `T449_PROBE_OUT` 파일에 JSON 을 쓴다(tmp + rename · 틱을 멈추지 않는다):
//   { t, day(게임일 · state.world.day), rows:[마을마다 한 줄] }
//   한 줄 = 이름 · dbId · 중심 셀 · 인구(econ 명부) · 곳간(`storage` 전부 — 회계 정본 그대로) · 식량등가(`totalFoodEquivalent` 정본) ·
//          집 채 수 · 결산 문 누계(`_t449`) · 나무꾼/채집 하루 칸(`_t325Dbg`·`_t347Dbg`) · 헤드리스 농부 몸/일괄(`_t368HlBody·Batch`) ·
//          행위 입고 누계(`_t312Deliv`·`_t325Deliv`·`_t347Deliv`·`_t368Deliv`) · 어제/오늘 개간·건설·작물 일(`d*`·`m*`)
//   `T449_PROBE_FULL=0` 이면 곳간은 합만(가볍게) — 기본은 전부.
'use strict';
const Module = require('module');
const fs = require('fs');
const path = require('path');
const OUT = process.env.T449_PROBE_OUT || '';
const VJS = path.join('server', 'villages.js');
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith(VJS)) content += '\n;globalThis.__t449st = function () { return state; };\n';
  return _compile.call(this, content, filename);
};
const r4 = (x) => (typeof x === 'number' && isFinite(x)) ? +x.toFixed(4) : (x == null ? null : x);
process.on('SIGUSR2', () => {
  if (!OUT) return;
  try {
    const st = typeof globalThis.__t449st === 'function' ? globalThis.__t449st() : null;
    let E = null; try { E = require(path.join(__dirname, '..', 'sim', 'economy-sim.js')); } catch (e) { E = null; }
    const full = process.env.T449_PROBE_FULL !== '0';
    const rows = [];
    for (const v of (st && st.villages) || []) {
      const e = v.econ || null, s = (e && e.storage) || {};
      let fe = null; try { fe = (E && e) ? r4(E.totalFoodEquivalent(e)) : null; } catch (err) { fe = null; }
      const sto = {}; if (full) for (const k of Object.keys(s)) { const q = s[k]; if (typeof q === 'number' && q !== 0) sto[k] = r4(q); }
      const wd = v._t325Dbg || null, fd = v._t347Dbg || null;
      rows.push({ n: v.name, id: v.dbId, cx: v.ccx, cy: v.ccy, pop: e && e.npcs ? e.npcs.length : null, fe, food: r4(s.food || 0), wood: r4(s.wood || 0),
        sto: full ? sto : undefined, houses: v._houseCells ? v._houseCells.length : 0, gran: v._granList ? v._granList.length : 0,
        t449: v._t449 || null, wd: wd ? { on: wd.on, walked: wd.walked, ln: wd.ln, cells: wd.cells, cap: wd.cap, cut: wd.cut } : null,
        fd: fd ? { on: fd.on, walked: fd.walked, fg: fd.fg, cells: fd.cells, cap: fd.cap, pick: fd.pick } : null,
        hlB: v._t368HlBody || 0, hlX: v._t368HlBatch || 0,
        del: { fish: r4(v._t312Deliv || 0), wood: r4(v._t325Deliv || 0), forage: r4(v._t347Deliv || 0), farm: r4(v._t368Deliv || 0) },
        dCl: v._dCl || 0, dSt: v._dSt || 0, dTk: v._dTk || 0, mCl: v._mCl || 0, mSt: v._mSt || 0, mTk: v._mTk || 0 });
    }
    const day = st && st.world ? st.world.day : null;
    fs.writeFileSync(OUT + '.tmp', JSON.stringify({ t: Date.now(), day, rows }));
    fs.renameSync(OUT + '.tmp', OUT);
  } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e && e.message || e) })); } catch (_) {} }
});

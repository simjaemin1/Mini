// (@regress 없음 — 러너 밖 · T790 계측기 · 제품 무변 · 읽기만 · T781 관찰자(`t781-return-probe.js`)의 꼴)
// === scripts/t790-speed-probe.js — **전쟁 몸 빠르기 관찰자**: 전쟁 몸(공격 · 방어 · 귀환)에 든 병사마다 **걸음당** 빠르기 · 모는 쪽(대형 | 교전) · 튐 ==========
//   쓰는 법(T650 · 전쟁 자): NODE_OPTIONS="--require <이 파일>" … node scripts/t577-server-run.js 50 <시드>(아이 존 · 판 JSON 옆 `.t790.json`) · 주 스레드만
//   ★왜 걸음당인가: 전쟁 몸은 벽시계가 아니라 **걸음**(교전 스텝 dt = 1/TICK_HZ)으로 움직인다. T681 은 그날 몫(`_t681q` — 하루 길이 × TICK_HZ)을
//     틱마다 하나씩 쓰고, 틱이 못 쓴 몫은 하루 마감 첫 자리(`_t681Flush`)가 한꺼번에 쓴다 — 벽시계 1초에 걸음 수백이 들 수 있다.
//     그래서 빠르기 = 표본 사이 자리 차 ÷ (그 사이 그 몸이 쓴 걸음 × 스텝 초). 걸음 = 행군 · 교전 몸은 `_t681q.left` 가 줄어든 만큼(날이 바뀌면 몫을 더한다) ·
//     귀환 몸은 전쟁 틱 수(`_warPerf.n` — 귀환은 몫을 안 쓰고 틱마다 걷는다).
//   ★잰다(1초 표본 · 존 NPC 몸 전부 — 징발 순간 마을 → 진 놓기까지 잡으려고 전쟁 밖 몸도 앞 표본으로 둔다):
//     · 칸 — 대형(그 병사의 교전 몸이 없거나 `ctl` 참) | 교전(battle-core 가 모는 몸 — `ctl` 거짓 · 두 표본 중 하나라도) ·
//       표본 수 · 최대 빠르기(px/s) · 몸 걸음(존 `moveSpeed`) 넘은 수 · 튐 수(`JUMP_PXS` 320 px/s — T764 · T781 관찰자와 같은 문턱) · 가장 빠른 표본 다섯
//     · 판 끝 — 전쟁 셈(`_warStat` — `t790Late` 포함) · `_t790Stat` · war-core 로그 전부(전투 줄로 결판을 견준다) · 전쟁마다 처음 · 끝 날 · 국면 표본 수
//   ★관찰만 한다 — 상태를 읽기만 하고 세계의 함수를 감싸지 않는다(`createLedger` 만 감싸 `scanDay` 앞에서 표본 · 같은 인수 · 같은 반환).
'use strict';
const OUT = process.env.T790_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t790.json' : '');
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN) {
  const fs = require('fs'); const Module = require('module');
  const JUMP_PXS = 320;   // 튐 문턱(T764 관찰자와 같은 값 — 10 m/s)
  let VIL = null, H = null;
  const S = () => { try { if (VIL && VIL.__p3Bind) { H = VIL.__p3Bind({}); return H.state; } } catch (e) {} return null; };
  const r1 = (x) => (Number.isFinite(x) ? +x.toFixed(1) : null);
  const cls = () => ({ n: 0, max: 0, overWalk: 0, jump: 0, top: [] });
  const C = { form: cls(), battle: cls() }, wars = new Map(), bodySteps = new Map(), prev = new Map();
  let walkPxs = null, stepS = null;
  const put = (c, v, row) => { c.n++; if (v > c.max) c.max = v; if (walkPxs && v > walkPxs * (1 + 1e-9)) c.overWalk++; if (v > JUMP_PXS) c.jump++;
    if (c.top.length < 5 || v > c.top[c.top.length - 1][5]) { c.top.push(row.concat([r1(v)])); c.top.sort((a, z) => z[5] - a[5]); if (c.top.length > 5) c.top.length = 5; } };
  const stepsOf = (s, id, b, nCalls) => {   // 그 몸이 지금까지 쓴 걸음(관찰자 쪽 누계)
    const quota = Math.max(1, Math.round((s.dayMs || 0) * ((s.warLive && s.warLive.TICK_HZ) || 30) / 1000)), day = s.world ? s.world.day | 0 : 0;
    let o = bodySteps.get(id);
    const q = b._t681q, left = q && q.day === day ? q.left : quota;
    if (!o) { o = { cum: b.phase === 'return' ? 0 : quota - left, prevCum: null, day, left, calls: nCalls, phase: b.phase }; bodySteps.set(id, o); return o; }
    o.prevCum = o.cum;
    if (b.phase === 'return') o.cum += Math.max(0, nCalls - o.calls);
    else if (day === o.day) o.cum += Math.max(0, o.left - left);
    else o.cum += Math.max(0, o.left) + Math.max(0, day - o.day - 1) * quota + (quota - left);
    o.day = day; o.left = left; o.calls = nCalls; o.phase = b.phase;
    return o;
  };
  const sample = () => {
    const s = S(); if (!s || !s.warBodies || !s.deps || !s.deps.players) return;
    if (walkPxs == null && s.deps.moveSpeed > 0) walkPxs = s.deps.moveSpeed;
    if (stepS == null && s.warLive && s.warLive.STEP_DT > 0) stepS = s.warLive.STEP_DT;
    const P = s.deps.players, day = s.world ? s.world.day : null, nCalls = s._warPerf ? s._warPerf.n : 0, inWar = new Map();
    for (const [id, b] of s.warBodies) {
      let wo = wars.get(id); if (!wo) { wo = { id, atk: b.w && b.w.atk ? b.w.atk.name : null, def: b.w && b.w.def ? b.w.def.name : null, first: day, last: day, phases: {} }; wars.set(id, wo); }
      wo.last = day; wo.phases[b.phase] = (wo.phases[b.phase] || 0) + 1;
      const o = stepsOf(s, id, b, nCalls), f = b.fight;
      for (const pid of [...(b.pids || []), ...(b.defPids || [])]) { if (inWar.has(pid)) continue; const bu = f && f.byPid ? f.byPid.get(pid) : null;
        inWar.set(pid, { id, phase: b.phase, cum: o.cum, joined: o.prevCum == null ? o.cum : o.cum - o.prevCum, k: bu && bu.hp > 0 && bu.ctl === false ? 'battle' : 'form' }); }
    }
    for (const [pid, p] of P) {
      if (!p || !p.isNpc) continue;
      const w = inWar.get(pid), q = prev.get(pid);
      if (w && q) {
        const steps = (q.w && q.w.id === w.id) ? w.cum - q.w.cum : w.joined;   // 같은 몸이면 그 사이 쓴 걸음 · 이 표본 사이에 몸에 들었으면(징발 · 방어 소집) 그 몸이 그 사이 쓴 걸음(몸이 처음 보이면 그날 쓴 걸음)
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d > 0 || steps > 0) { const v = d / (Math.max(1, steps) * (stepS || 1 / 30)); put(C[(w.k === 'battle' || (q.w && q.w.k === 'battle')) ? 'battle' : 'form'], v, [day, w.id, w.phase, pid, steps]); }
      }
      prev.set(pid, { x: p.x, y: p.y, w: w || null });
    }
  };
  const dump = () => { try {
    const s = S(); const log = (() => { try { return (s && s.world && s.world._warStats && s.world._warStats.log) || null; } catch (e) { return null; } })();
    const fin = (c) => Object.assign({}, c, { max: r1(c.max) });
    fs.writeFileSync(OUT, JSON.stringify({ at: Date.now(), knobs: { T790: process.env.T790_NO_SNAP || null, T771: process.env.T771_SORTIE_MISS || null, T403: process.env.T403_ARMS_LEDGER || null },
      walkPxs, stepS, jumpPxs: JUMP_PXS, form: fin(C.form), battle: fin(C.battle), wars: [...wars.values()],
      warStat: s && s._warStat ? Object.assign({}, s._warStat) : null, t790: H && H._t790Stat ? Object.assign({}, H._t790Stat) : null, log }));
  } catch (e) {} };
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && typeof m.createLedger === 'function' && !m.__t790s) { m.__t790s = true; const mk = m.createLedger; m.createLedger = function () { const L = mk.apply(this, arguments); const sd = L.scanDay; L.scanDay = function (world) { try { sample(); } catch (e) {} return sd.apply(this, arguments); }; return L; }; }
      if (m && !VIL && m.__p3Bind && typeof m.villageOfCell === 'function') VIL = m;
    } catch (e) {}
    return m;
  };
  const t1 = setInterval(() => { try { sample(); } catch (e) {} }, 1000); if (t1.unref) t1.unref();
  process.on('exit', dump);
}

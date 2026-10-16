// (@regress 없음 — 러너 밖 · T764 계측기 · 제품 무변 · 읽기만 · T743 관찰자(`t743-job-probe.js`)의 꼴)
// === scripts/t764-arms-probe.js — **무기 반출 · 반납(T403) 관찰자**: 곳간 무기 · 원정 짐 · 거울 · 전쟁 몸 걸음 ==========
//   쓰는 법:
//     (a) T650 자 — NODE_OPTIONS="--require <이 파일>" … node scripts/t577-server-run.js 400 <시드>(아이 존 · `T577_OUT` 이 선 쪽 · 판 JSON 옆 `.t764.json`)
//         기준선 게이트(`server-baseline-check.js`)도 같은 env 를 아이에 물려준다(그 판 폴더의 `sbc-<시드>.json.t764.json`).
//     (b) T686 실제 하루 판 — `T686_PRELOAD=<이 파일>` · `T764_OUT=<경로>`(그 경로에 20초마다 덮어쓴다 · 판 끝 SIGUSR2 에도 · 존이 SIGKILL 로 끝나므로)
//   ★잰다(econ 날마다 한 번 — 하루 마감 장부 `scanDay` 앞):
//     · 마을 — 곳간 `weapon` · `_weapQ` · 전사 수 · 징발 표(`_warDraft`) 수 · 원정 짐 거울(`_warArmsOut` — T764 켬 칸)
//       · 그날 무기 생산(`dailyProductionBuf.weapon` — 세금 떼기 전) · 봉헌검 누계(`_riteWeapon` — 잉여 무기 매납) · 대장장이 · 석공 수(econ 무기 부족 채용 — 곳간 무기 < N×0.5)
//     · 전쟁 — `world._warWars` 마다 [번호 · 공격 · 방어 · 병력 · 국면 · 작전 · 선포 날 · 도착 날 · 짐(반출 · 지금 · 민병 · 반납 · 끝)]
//     · 전쟁 셈 — 선포 · 전투 · 공승 · 방승 · 활성
//   ★몸(실체 전쟁 몸 `state.warBodies` — 호스트 문 `__p3Bind({})` 가 내주는 그 상태를 읽기만): 표본(econ 날마다 · 실제 하루 판은 10초마다 · `T764_SAMPLE_MS` 로 덮어씀)
//     · 전쟁 몸마다 지휘관 진척(`prog` / 길이 `len` · 주둔 링 `campProg` · px) · 하루 몫(`pxPerDay`) · 병사 pid 수 · 손에 든 무기 품목 수
//     · 병사 몸 위치 차(표본 사이) — 속도 문턱(`T764_JUMP_PXS` · 기본 320px/s) 아래 = **걸음**, 위 = **튐**(슬롯 스냅 · 순간 자리)으로 갈라 더한다
//   ★다시 뜸 — war-core `createWar` 가 낸 `rebuildFromEcon` 을 감싸 그 앞 · 뒤 곳간 무기 합 · 거울(`_warArmsOut`) 합 · 거울 선 마을 수를 적는다(`boot`)
//   ★관찰만 한다 — 감싼 함수에 같은 인수를 그대로 넘기고 그 값을 그대로 돌려준다.
'use strict';
const OUT = process.env.T764_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t764.json' : '');
//   ★주 스레드에서만 — preload 는 일꾼 스레드(존 DB 체크포인트 · 경계 걸음표)에도 실린다. 일꾼은 세계가 없어 빈 판을 같은 파일에 덮어쓴다.
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN) {
  const fs = require('fs');
  const Module = require('module');
  let EV = null, VIL = null, WC = null;
  let names = null, last = null;
  const days = [], V = [], W = new Map(), B = new Map(), BOOT = [];
  const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : null);
  const WEAP_ITEMS = ['weapon', 'sword', 'spear', 'pike', 'axe', 'bow', 'arrow', 'sling'];   // 몸 손에 무기 품목이 서나(곳간 통칭 + T403 일곱 칸 이름 · 플레이어 제작 검 · 도끼)
  const st = () => { try { return VIL && VIL.__p3Bind ? VIL.__p3Bind({}).state : null; } catch (e) { return null; } };
  //   걸음 · 튐 — 표본 사이 위치 차를 속도(px/s)로 가른다: 문턱(`T764_JUMP_PXS` · 기본 320px/s = 10m/s — 걷는 몸 `MOVE_SPEED` 64px/s 의 다섯 배) 넘으면 **튐**(슬롯 스냅 · 순간 자리) · 아래면 **걸음**
  const JUMP_PXS = +process.env.T764_JUMP_PXS || 320;
  const bodySample = (tag) => {
    const S = st(); if (!S || !S.warBodies) return;
    const P = S.deps && S.deps.players; const now = Date.now();
    for (const [id, b] of S.warBodies) {
      let o = B.get(id);
      if (!o) { o = { id, atk: b.w && b.w.atk ? b.w.atk.name : null, def: b.w && b.w.def ? b.w.def.name : null, len: r3(b.len), pxPerDay: r3(b.pxPerDay), campProg: r3(b.campProg), first: [tag, now], samples: [], walk: {}, jump: {}, jumpN: 0, pos: {}, hand: 0, nMax: 0 }; B.set(id, o); }
      let n = 0, moved = 0, hand = 0;
      for (const pid of (b.pids || [])) {
        const p = P && P.get(pid); if (!p) continue; n++;
        const q = o.pos[pid];
        if (q) { const d = Math.hypot(p.x - q[0], p.y - q[1]); if (d > 0) { const v = d / Math.max(0.001, (now - q[2]) / 1000);
          if (v > JUMP_PXS) { o.jump[pid] = (o.jump[pid] || 0) + d; o.jumpN++; } else { o.walk[pid] = (o.walk[pid] || 0) + d; moved++; } } }
        o.pos[pid] = [p.x, p.y, now];
        const inv = p.inventory || {}; for (const k of WEAP_ITEMS) if ((inv[k] || 0) > 0) hand += inv[k];
      }
      o.hand = Math.max(o.hand, hand); o.nMax = Math.max(o.nMax, n);
      o.samples.push([tag, now, b.phase || null, b.mode || null, r3(b.prog), n, moved, r3(Object.values(o.walk).reduce((a, x) => a + x, 0)), r3(Object.values(o.jump).reduce((a, x) => a + x, 0))]);
      if (o.samples.length > 4000) o.samples.splice(0, o.samples.length - 4000);
    }
  };
  const record = (world) => {
    try {
      const d = world && world.day;
      if (!Number.isFinite(d) || d === last) return;
      last = d;
      const S = st(); const VS = (S && S.villages) || [];
      if (!names) names = VS.map((v) => v.name);
      days.push(d);
      const row = [];
      for (const v of VS) { const e = v.econ || {}; let dr = 0; for (const n of (e.npcs || [])) if (n._warDraft) dr++;
        row.push([r3((e.storage && e.storage.weapon) || 0), r3(e._weapQ), (e.counts && e.counts.warrior) || 0, dr, e._warArmsOut != null ? r3(e._warArmsOut) : 0,
          r3((e.dailyProductionBuf && e.dailyProductionBuf.weapon) || 0), r3(e._riteWeapon || 0), (e.counts && e.counts.smith) || 0, (e.counts && e.counts.mason) || 0]); }
      V.push(row);
      for (const w of (world._warWars || [])) {
        let o = W.get(w.id);
        if (!o) { o = { id: w.id, atk: w.atk && w.atk.name, def: w.def && w.def.name, force: w.force, born: w.born, eta0: w.eta, casus: w.casus, first: d, last: d, arms0: w._arms ? Object.assign({}, w._arms) : null, rows: [] }; W.set(w.id, o); }
        o.last = d;
        const a = w._arms;
        o.rows.push([d, w.phase, w.op || null, w.eta, a ? [a.out, r3(a.weapon), a.militia, r3(a.back), a.done ? 1 : 0] : null]);
        if (o.rows.length > 800) o.rows.splice(0, o.rows.length - 800);
      }
      const ws = world._warStats; if (ws) { const L = V[V.length - 1]; L.ws = [ws.decl | 0, ws.battle | 0, ws.atkWin | 0, ws.defWin | 0, ws.active | 0, ws.withdraw | 0, ws.surrender | 0]; }
      bodySample('d' + d);
    } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
  };
  const dump = () => {
    try {
      const S = st(); const warsLive = []; try { for (const w of (S && S.war && S.war.WARS) || []) warsLive.push(w.id); } catch (e) {}
      const bodies = [...B.values()].map((o) => { const walk = Object.values(o.walk), jump = Object.values(o.jump); return Object.assign({}, o, { pos: undefined, walk: undefined, jump: undefined, walkers: walk.filter((x) => x > 0).length, walkSum: r3(walk.reduce((a, x) => a + x, 0)), walkMax: r3(walk.length ? Math.max(...walk) : 0), jumpers: jump.filter((x) => x > 0).length, jumpSum: r3(jump.reduce((a, x) => a + x, 0)) }); });
      fs.writeFileSync(OUT, JSON.stringify({ knobs: { T403_ARMS_LEDGER: process.env.T403_ARMS_LEDGER || null, WAR_FIXTURE: process.env.WAR_FIXTURE || null, VILLAGE_DAY_MS: process.env.VILLAGE_DAY_MS || null },
        at: Date.now(), boot: BOOT, names, days, v: V.map((r) => ({ row: r, ws: r.ws || null })), wars: [...W.values()], warsLive, bodies,
        log: (() => { try { return (S && S.world && S.world._warStats && S.world._warStats.log) || null; } catch (e) { return null; } })() }));
    } catch (e) {}
  };
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && !EV && typeof m.createLedger === 'function') {
        EV = m;
        const mk = m.createLedger;
        m.createLedger = function () {
          const L = mk.apply(this, arguments);
          const sd = L.scanDay;
          L.scanDay = function (world) { record(world); return sd.apply(this, arguments); };
          return L;
        };
      }
      if (m && !VIL && m.__p3Bind && typeof m.villageOfCell === 'function') VIL = m;
      if (m && !WC && typeof m.warArmsOut === 'function') {
        WC = m;
        //   다시 뜸(재부팅) 앞뒤 — `rebuildFromEcon` 을 감싸 곳간 무기 합 · 거울 합 · 거울 선 마을 수를 앞 · 뒤로 적는다(같은 인수 · 같은 값)
        const cw = m.createWar;
        if (typeof cw === 'function') m.createWar = function (opts) {
          const o = cw.apply(this, arguments);
          try {
            const rb = o && o.rebuildFromEcon;
            if (typeof rb === 'function') o.rebuildFromEcon = function () {
              const sum = () => { let g = 0, a = 0, n = 0; for (const v of (opts && opts.villages) || []) { const e = v.econ || {}; g += (e.storage && e.storage.weapon) || 0; if (e._warArmsOut != null) { a += e._warArmsOut; n++; } } return [r3(g), r3(a), n]; };
              const pre = sum(); const r = rb.apply(this, arguments); BOOT.push({ at: Date.now(), day: opts && opts.world ? opts.world.day : null, pre, post: sum() }); return r;
            };
          } catch (e) {}
          return o;
        };
      }
    } catch (e) { /* 감싸기 실패도 세계에 아무것도 안 한다 */ }
    return m;
  };
  //   몸 표본 간격 — `T764_SAMPLE_MS`(없으면 실제 하루 판 10초 · T650 자 0 = econ 날마다만)
  const SAMPLE_MS = +process.env.T764_SAMPLE_MS || (process.env.T764_OUT ? 10000 : 0);
  if (SAMPLE_MS > 0) { const t1 = setInterval(() => bodySample('t' + Math.round(Date.now() / 1000)), SAMPLE_MS); if (t1.unref) t1.unref(); }
  if (process.env.T764_OUT) {
    //   실제 하루 판 — 존이 SIGKILL 로 끝난다 ⇒ 20초마다 덮어쓰기 · SIGUSR2(판 끝 신호)에도
    const t2 = setInterval(dump, 20000); if (t2.unref) t2.unref();
    process.on('SIGUSR2', dump);
  }
  process.on('exit', dump);
}

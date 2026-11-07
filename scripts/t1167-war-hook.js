'use strict';
// (@regress 없음 — 러너 밖 · T1167 계측기 · 제품 무변)
// === scripts/t1167-war-hook.js — 진행 중 전쟁 재기동 자(`t1167-war-restart.js`)의 아이 존 프리로드 ==========================
//   `t722-stop-hook.js`(STOP 없이 — villages `__t722` 상태 읽기 한 줄 · `T722_NOJUMP` 날 뜀 끔) 뒤에 얹는다.
//   env:
//     T1167_H_MODE=stop    날 장부 문(econ 하루 끝)에서 원하는 꼴의 전쟁(`T1167_H_WANT`)이 서 있으면 → 날 얼림 → 마감 · 저장 큐 드레인 → 덤프 → SIGTERM(제품 종료 문)
//     T1167_H_MODE=resume  준비가 서는 순간 덤프(`.boot`) · 그 뒤 날마다 전쟁 줄 · `T1167_H_AFTER` 날 뒤 덤프(`.end`) 하고 나간다
//     T1167_H_WANT=march|march0|siege|battle|return   march = 행군(몸 징발 뒤) · march0 = 몸이 서기 전 행군 · siege = 주둔 · 포위 · battle = 교전 · return = 귀환
//     T1167_H_MIN=날        이 날 전엔 멈추지 않는다 · T1167_H_OUT=<파일 머리>
//   읽기만 한다 — 세계에 쓰는 것은 멈춤(얼림 · SIGTERM — t722 자와 같은 문)뿐이다.
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const VILL = path.join(ROOT, 'server', 'villages.js');
const MODE = process.env.T1167_H_MODE || '';
const WANT = process.env.T1167_H_WANT || 'march';
const MIN = parseInt(process.env.T1167_H_MIN || '0', 10) || 0;
const AFTER = parseInt(process.env.T1167_H_AFTER || '30', 10) || 30;
const OUT = process.env.T1167_H_OUT || '';
const R6 = (x) => +(+x || 0).toFixed(6);

function stOf() { try { return require(VILL).__t722(); } catch (e) { return null; } }
function warRows(st) {
  const WC = st.war, P = st.deps && st.deps.players; if (!WC) return [];
  return WC.WARS.map((w) => {
    const body = st.warBodies && st.warBodies.get(w.id);
    const cnt = (vil) => { let k = 0, kp = 0; for (const n of ((vil && vil.econ && vil.econ.npcs) || [])) if (n._warDraft === w.id) { k++; if (n._warPid != null) kp++; } return [k, kp]; };
    let bearers = 0, bag = 0, armsBody = 0;
    const keys = w._packKeys || [];
    for (const vil of [w.atk, w.def]) for (const pid of ((vil && vil.npcPids) || [])) { const p = P && P.get(pid); if (!p) continue;
      if (p._warPackOf === w.id) { bearers++; for (const k of keys) bag += +((p.inventory || {})[k] || 0); } }
    if (w._armsPack instanceof Map) for (const [, m] of w._armsPack) armsBody += +m || 0;
    return { id: w.id, atk: w.atk && w.atk.name, def: w.def && w.def.name, phase: w.phase, op: w.op, eta: w.eta, born: w.born, force: w.force,
      packRem: R6(w._packRem), onBodies: w._packOnBodies || 0, arms: w._arms ? R6(w._arms.weapon) : null, armsPack: w._armsPack instanceof Map ? w._armsPack.size : null, armsBody: R6(armsBody),
      draftA: cnt(w.atk), draftD: cnt(w.def), bearers, bag: R6(bag), siege: !!w._siegeOn, sortie: !!w._sortie,
      body: body ? { phase: body.phase, pids: (body.pids || []).length, defPids: (body.defPids || []).length, fight: !!body.fight, inst: !!body.instantiated, mode: body.mode || null } : null };
  });
}
function worldRow(st) {
  const WC = st.war, ids = new Set((WC ? WC.WARS : []).map((w) => w.id));
  let marks = 0, orphan = 0, stalePid = 0, weapon = 0, armsOut = 0, ledger = 0;
  for (const vil of st.villages || []) { const e = vil.econ; if (!e) continue;
    weapon += +((e.storage || {}).weapon || 0); armsOut += +(e._warArmsOut || 0);
    for (const n of e.npcs || []) if (n._warDraft) { marks++; if (!ids.has(n._warDraft)) orphan++; if (n._warPid != null && !(st.deps.players.has(n._warPid))) stalePid++; } }
  for (const w of (WC ? WC.WARS : [])) if (w._arms && !w._arms.done) ledger += +(w._arms.weapon || 0);
  let V = null; try { V = require(VILL); } catch (e) {}
  return { day: st.world ? st.world.day : null, wars: ids.size, marks, orphan, stalePid, weapon: R6(weapon), armsOut: R6(armsOut), ledger: R6(ledger), weaponAll: R6(weapon + ledger),
    t1167: V && V.t1167Stat ? V.t1167Stat() : null, warSeq: st.world ? st.world._warSeq : null };
}
function want(w, st) {
  const body = st.warBodies && st.warBodies.get(w.id);
  let dr = 0; for (const n of ((w.atk && w.atk.econ && w.atk.econ.npcs) || [])) if (n._warDraft === w.id) dr++;
  if (!dr) return false;   // 징발 중(econ 표가 서 있는 원정만)
  if (WANT === 'march') return w.phase === 'march' && w.op === 'march' && body && body.instantiated && (w.eta - st.world.day) >= 2;
  if (WANT === 'march0') return w.phase === 'march' && w.op === 'march' && !(body && body.instantiated);   // ★[T1167 · 11-05] 몸이 서기 전 행군(빠른 시계 판은 행군이 하루 — 선포 날 경계에서 멈춘다 · 다시 뜬 뒤 `_warEnsureBody` 가 몸을 세운다)
  if (WANT === 'siege') return w.phase === 'march' && (w.op === 'camp' || w.op === 'siege') && body && body.instantiated;
  if (WANT === 'battle') return w.phase === 'battle' && body && body.fight;
  if (WANT === 'return') return w.phase === 'return' && (w.eta - st.world.day) >= 2 && w._packOnBodies;
  return false;
}
const dump = (tag, extra) => { if (!OUT) return; const st = stOf(); try { fs.writeFileSync(OUT + '.' + tag + '.json', JSON.stringify(Object.assign({ tag, world: worldRow(st), wars: warRows(st) }, extra || {}))); } catch (e) { console.error('[t1167] 덤프 실패', e.message); } };

const Ev = require(path.join(ROOT, 'server', 'events'));
const mk = Ev.createLedger;
let armed = false, bootDay = null;
const daily = [];
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    const r = sd.apply(this, arguments);
    const st = stOf(); if (!st || !st.war) return r;
    if (MODE === 'stop' && !armed && (day | 0) >= MIN) {
      const hit = st.war.WARS.find((w) => want(w, st));
      if (hit) {
        armed = true;
        st.dayFreeze = true;
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (st.tickJobs || (st.saveQueue && st.saveQueue.length)) return;
          clearInterval(iv);
          dump('stop', { hit: hit.id, want: WANT, drainMs: Date.now() - t0 });
          console.log(`[t1167] 멈춤 — econ day ${st.world.day} · 전쟁 ${hit.id}(${hit.phase}/${hit.op}) · SIGTERM`);
          process.kill(process.pid, 'SIGTERM');
        }, 5);
      }
    }
    if (MODE === 'resume' && bootDay != null) {
      daily.push({ day: day | 0, world: worldRow(st), wars: warRows(st) });
      if ((day | 0) >= bootDay + AFTER) { dump('end', { daily }); console.log(`[t1167] 끝 — econ day ${day}`); process.exit(0); }
    }
    return r;
  };
  return L;
};
if (MODE === 'resume') {
  const iv = setInterval(() => {
    const st = stOf(); if (!st || !st.ready) return;
    clearInterval(iv);
    bootDay = st.world.day | 0;
    dump('boot');
    console.log(`[t1167] 다시 뜸 — econ day ${bootDay}`);
  }, 2);
}

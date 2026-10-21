'use strict';
// (@regress 없음 — 러너 밖 · T833 다시 뜬 판 탐침의 아이 존 프리로드 · 제품 무변 · 읽기만)
// === scripts/t833-probe-hook.js — 명부 몸의 주사위 신원(`_sh`) 겹침을 econ 날마다 세고 · 정해진 날에 제품 종료 문(SIGTERM)으로 내린다 ===
//   `scripts/t833-restart-probe.js` 가 NODE_OPTIONS 로 얹는다. 제품 모듈은 존 판(argv[1] 의 server/)의 것을 그대로 읽는다(트리 무관 — main 트리도 잰다).
//   env: T833P_OUT=<파일>(판 끝에 쓴다) · T833P_STOP=<econ 날>(그날 장부를 본 뒤 SIGTERM — 제품 종료 저장 `t728Shutdown` 이 마을 · 메타 · T747 몸 칸을 쓴다)
//   센다(명부 몸 = 마을 `npcPids` 에 든 몸 — 마을 몸 주사위를 굴리는 몸): 몸 수 · `_sh` 없음 · 겹친 열쇠 수 · 겹친 몸 수 · 같은 마을 겹침 짝.
//   덤프: 부팅 순간(첫 존 틱 · 되살림 뒤) · 종료 저장 순간(`saveVillagesAndMeta` 직전) 명부 [마을 · 자리 · pid · _sh].
if (!/server[\/\\]zone\.js$/.test(process.argv[1] || '')) return;
const OUT = process.env.T833P_OUT; if (!OUT) return;
const path = require('path');
const fs = require('fs');
const SRV = path.dirname(path.resolve(process.argv[1]));
const STOP = parseInt(process.env.T833P_STOP || '', 10) || 0;
const V = require(path.join(SRV, 'villages'));
const st = () => V.__p3Bind({}).state;   // 운영 경로는 이 함수를 안 부른다(하네스 문) — 빈 객체를 얹으니 상태 무변 · 상태 객체만 받는다
function roster() {
  const S = st(), P = S && S.deps && S.deps.players; if (!P || !S.villages) return null;
  const a = [];
  for (const vil of S.villages) for (let i = 0; i < vil.npcPids.length; i++) { const b = P.get(vil.npcPids[i]); if (b) a.push([vil.dbId, i, b.pid, b._sh === undefined ? null : b._sh]); }
  return a;
}
function census(a) {
  if (!a) return null;
  const by = new Map(); let undef = 0;
  for (const r of a) { if (r[3] == null) { undef++; continue; } const k = r[3]; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  let dupKeys = 0, dupBodies = 0, sameVil = 0, crossVil = 0;
  for (const L of by.values()) if (L.length > 1) {
    dupKeys++; dupBodies += L.length;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) (L[i][0] === L[j][0] ? sameVil++ : crossVil++);
  }
  return { n: a.length, undef, dupKeys, dupBodies, sameVil, crossVil };
}
const doc = { tree: path.dirname(SRV), knob: process.env.T822_BODY_SEED == null ? '(없음)' : process.env.T822_BODY_SEED, stop: STOP, rows: [], boot: null, save: null, stopV: null };
//   부팅 순간 — 첫 존 틱(마을 준비 뒤 · init 의 되살림 다 끝난 뒤)
{
  const g = V.onGameTick;
  if (typeof g === 'function') V.onGameTick = function () { if (!doc.boot) { const S = st(); if (S && S.ready) { const a = roster(); doc.boot = { V: Date.now(), day: S.world && S.world.day, c: census(a), roster: a }; } } return g.apply(this, arguments); };
}
let last = -1, stopping = false;
const Ev = require(path.join(SRV, 'events'));
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    const r = sd.apply(this, arguments);
    try {
      const d = day | 0;
      if (d !== last) {
        last = d;
        doc.rows.push(Object.assign({ d, V: Date.now() }, census(roster())));
        if (STOP && d >= STOP && !stopping) {
          stopping = true; doc.stopV = Date.now();
          const S = st(), db = S && S.db;
          if (db && typeof db.saveVillagesAndMeta === 'function') {
            const orig = db.saveVillagesAndMeta;
            db.saveVillagesAndMeta = function () { const a = roster(); doc.save = { V: Date.now(), day: S.world && S.world.day, c: census(a), roster: a }; return orig.apply(this, arguments); };
          }
          process.emit('SIGTERM', 'SIGTERM');   // 제품 종료 문 그대로(`gracefulShutdown` → `t728Shutdown` — 날을 얼리고 마감 뒤 저장) · 신호를 안 보낸다(가상 시계는 실제 I/O 에 드물게 양보해 신호가 몇 날 늦게 닿는다)
        }
      }
    } catch (e) { doc.err = String(e && e.message); }
    return r;
  };
  return L;
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(doc)); } catch (e) {} });

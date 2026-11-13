'use strict';
// (@regress 없음 — 러너 밖 · T1303 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1303-observe.js — 몸 죽음 꼬리표 ↔ econ 까닭 일치 · 날마다 세계 지문(앞/뒤 판 바이트 맞대기) — 서버 판 자 곁 프리로드 ===
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1303-observe.js" node scripts/t577-server-run.js 120 1020   (판 JSON 곁 `<판>-<시드>.t1303.json`)
//   ⓐ 마을마다 까닭 줄(`vil._bxQ`)을 엿보는 장부(`lib-t1303-why` — 하네스와 같은 자): 적힌 꼬리표(굶음 · 늙음) · econ 까닭(식량 빚 · 나이 · 나머지) · 맞음 · 어긋남.
//   ⓑ 날마다(econ `tickVillage` 첫 마을 머리 = 앞 날 econ · 몸 동기가 다 끝난 뒤) 세계 지문 — 마을마다 [이름 · 곳간 전 칸(1e-6) · 주민 [id · 나이 · 직업 · 허기 · hp] · 주거 · 확장 · 해체]
//      (`server-baseline-check` 훅의 econ 칸 넷 중 금고만 뺀 꼴) → sha1 앞 12자리. 앞(고침 전) · 뒤(고침) 두 판의 이 줄이 같으면 세계 결과 무변.
//   ⓒ 10날마다 · 끝 — 날 줄(세계 합): [날 · 인구 · 적힌 굶음 · 늙음 · econ 굶음 · 늙음 · 맞음 · 어긋남] · 몸 층 `bodyExitStats().died`(몸이 받은 꼬리표).
//   쓰기: 10날마다 · 끝(`exit`) — 판이 끊겨도 그날까지 남는다.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1303.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const W = require('./lib-t1303-why');
const H = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const R6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const stor = (st) => { const o = {}; for (const k of Object.keys(st || {}).sort()) o[k] = R6(st[k]); return o; };
const rec = { v: 1, farmOn: process.env.T1243_FARM_ON === '1', debtWorld: !!V1.T1074_FOOD_DEBT, cols: ['day', 'pop', 'notedStarve', 'notedOld', 'econStarve', 'econOld', 'agree', 'miss'],
  rows: [], fp: [], snaps: [], err: null };
let last = -1, VIL = null;
const tallies = new Map();   // 마을 이름 → 장부
function sum() { for (const T of tallies.values()) T.pull(); return W.sumTally([...tallies.values()]); }
function fingerprint(P) {
  const all = [];
  for (const vil of (P.villages || [])) {
    const v = vil.econ; if (!v) continue;
    all.push(vil.name, JSON.stringify(stor(v.storage)),
      JSON.stringify([(v.npcs || []).length, (v.npcs || []).map((n) => [n.id, R6(n.age), n.currentJob || null, R6(n.hunger), R6(n.hp)])]),
      JSON.stringify([R6(v.housing), v.expansions || 0, v._banditized ? 1 : 0]));
  }
  return H(all.join('\n'));
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
const DAYS = +(process.env.T577_DAYS || 0);
function snap(day, P, why) {
  const S = sum();
  let pop = 0; for (const vil of (P.villages || [])) pop += ((vil.econ && vil.econ.npcs) || []).length;
  let bx = null; try { bx = VIL.bodyExitStats ? VIL.bodyExitStats().died : null; } catch (x) { bx = null; }
  rec.rows.push([day, pop, S.noted.starve, S.noted.old, S.econ.starve, S.econ.old, S.agree, S.miss]);
  rec.snaps.push({ day, why, pop, sum: S, bodyDied: bx });
}
function onDay(day) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  const P = VIL.__labProbe._t569Probe.setup();
  for (const vil of (P.villages || [])) if (vil && vil.econ && !tallies.has(vil.name)) tallies.set(vil.name, W.tally(vil, rec.debtWorld));
  rec.fp.push([day, fingerprint(P)]);
  if (day % 10 === 0 || (DAYS && day >= DAYS)) { snap(day, P, 'ten'); write(); }
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; onDay(day); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); write(); }
  return _t.apply(this, arguments);
};
process.on('exit', () => {
  try { if (VIL) { const P = VIL.__labProbe._t569Probe.setup(), B = VIL.__p3Bind({}); const d = (B.state && B.state.world && B.state.world.day) | 0;
    rec.fp.push([d, fingerprint(P), 'exit']); snap(d, P, 'exit'); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  write();
});

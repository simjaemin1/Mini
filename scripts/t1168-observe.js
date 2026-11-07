'use strict';
// (@regress 없음 — 러너 밖 · T1168 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1168-observe.js — 전쟁 팔 켬 기본 판(K2 원정 사기 · K28 노획 몸 싣기 · K5 출격 승산의 탄) — 서버 판 자 곁 프리로드 ===
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1168-observe.js" … node scripts/server-baseline-check.js … --war   (또는 t577-server-run.js)
//            아이 존만(`T577_SEED` · argv 가 server/zone.js) · 판 JSON 곁 `<판>.t1168.json`.
//   장부 하루(`events.createLedger` 의 `scanDay`)마다 war-core 진행 전쟁(`world._warWars`)을 읽는다 — 원정마다 마지막으로 본 값:
//     ① 사기(`_mrl` · 최저) · 짐 남은 날 · 굶은 몸-날(`_rationBook.hungryDays`) · 끝 국면 · 작전
//     ② 노획 장부(T466 `_rationBook.loot*` · T826 `w._arms.loot`)
//     ③ 방어 편 몸의 탄(`w._defAmmo` — 호스트 T1168) · 그날 승산 몫(war-core `_opAmmoShare`) · 몫 < 1 인 날 · 최저 · 출격(`_sortie`) 날
//   판 끝: 원정 표 + war-core 누계(`world._warStats`) 사본.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1168.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const Ev = require(path.join(ROOT, 'server', 'events'));
const WC = require(path.join(ROOT, 'sim', 'war-core.js'));
const K = ['T1076_ARMY_MORALE', 'T466_LOOT_ACT', 'T826_LOOT_BODY', 'T1168_SORTIE_AMMO', 'VILLAGE_NPC_CAP', 'WAR_FIXTURE', 'WAR_FIXTURE_DAY'];
const rec = { ver: 1, seed: +(process.env.T577_SEED || 0), knob: {}, wars: {}, stats: null, lastDay: -1, errs: [] };
for (const k of K) rec.knob[k] = process.env[k] == null ? null : process.env[k];
const r3 = (x) => (x == null || !Number.isFinite(+x) ? null : Math.round(+x * 1000) / 1000);
let W0 = null;
function snap(world, day) {
  W0 = world;
  for (const w of (world && world._warWars) || []) {
    if (!w || w.id == null) continue;
    const o = rec.wars[w.id] || (rec.wars[w.id] = { id: w.id, atk: w.atk && w.atk.name, def: w.def && w.def.name, born: w.born, force: w.force, casus: w.casus, minMrl: null, days: 0, ammoDays: 0, ammoLow: 0, minShare: null, sortieDays: 0, sortieLow: 0 });
    o.days++; o.last = day; o.phase = w.phase; o.op = w.op; o.pack = r3(w._packRem);
    const bk = w._rationBook;
    if (bk) {
      o.hungry = bk.hungryDays || 0; o.unfed = r3(bk.unfed || 0);
      for (const f of ['lootP', 'lootG', 'lootPB', 'lootLost', 'lootKg', 'lootDay', 'homeDay', 'lootSettle', 'lootLeftG', 'drop', 'back']) if (bk[f] != null) o[f] = typeof bk[f] === 'number' ? r3(bk[f]) : bk[f];
    }
    if (w._arms) { o.armsLoot = r3(w._arms.loot || 0); o.armsW = r3(w._arms.weapon); }
    if (w._mrl != null) { o.mrl = r3(w._mrl); o.minMrl = o.minMrl == null ? o.mrl : Math.min(o.minMrl, o.mrl); }
    if (w._defAmmo) {
      const sh = WC._opAmmoShare(w._defAmmo);
      o.ammoDays++; if (sh < 1) o.ammoLow++; o.minShare = o.minShare == null ? r3(sh) : Math.min(o.minShare, r3(sh));
      o.lastAmmo = Object.assign({}, w._defAmmo);
      if (w._sortie) { o.sortieDays++; if (sh < 1) o.sortieLow++; }
    } else if (w._sortie) o.sortieDays++;
  }
  rec.lastDay = day;
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  if (typeof sd === 'function') L.scanDay = function (world, day) { try { snap(world, day | 0); } catch (e) { if (rec.errs.length < 20) rec.errs.push(String(e && e.message || e)); } return sd.apply(this, arguments); };
  return L;
};
process.on('exit', () => { try { rec.stats = W0 && W0._warStats ? JSON.parse(JSON.stringify(W0._warStats)) : null; fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });

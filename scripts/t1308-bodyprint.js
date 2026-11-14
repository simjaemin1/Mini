'use strict';
// (@regress 없음 — 러너 밖 · T1308 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1308-bodyprint.js — 몸 자리 지문: econ 하루 끝(장부 `scanDay`)마다 마을 몸 전부의 [짝 사람 · 자리 · HP] 해시 ===========
//   `NODE_OPTIONS="-r scripts/t1308-bodyprint.js"` 로 아이 존에 얹는다(`T577_OUT` 이 있을 때만 — 판 곁 `<판>.t1308b.json`).
//   몸 열쇠 = 짝 사람 id(`_econId` · T1197 짝) → 없으면 마을 이름 + 명부 자리(`npcPids` 의 차례). pid 는 다시 뜬 판에서 새로 나니 열쇠로 안 쓴다.
//   값 = x · y(1/100 칸) · HP(정수) · 하는 일(`simJob`) · 누움(`_bxExit`). 날마다 { d, n, h } — h = 열쇠 순으로 이은 줄의 sha1 앞 12자.
//   T1308_BODY_DUMP_DAYS=a,b — 그 날엔 줄 통째를 `<판>.t1308b.d<날>.json` 에(첫 갈림 들여다보기).
const OUT0 = process.env.T577_OUT || '';
if (!OUT0 || !process.env.T577_SEED) return;
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const OUT = OUT0.replace(/\.json$/, '') + '.t1308b.json';
const DUMP = new Set(String(process.env.T1308_BODY_DUMP_DAYS || '').split(',').filter(Boolean).map(Number));
const days = [];
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
function snap(d) {
  let V; try { V = require(path.join(ROOT, 'server', 'villages')); } catch (e) { return; }
  const st = V.__t740 ? V.__t740() : null; if (!st || !st.deps || !st.deps.players) return;
  const P = st.deps.players, rows = [];
  for (const vl of st.villages || []) {
    (vl.npcPids || []).forEach((pid, i) => {
      const b = P.get(pid); if (!b) return;
      const key = b._econId != null ? 'e' + b._econId : `${vl.name}#${i}`;
      rows.push([key, r2(b.x), r2(b.y), Math.round(+b.hp || 0), b.simJob || '', b._bxExit ? 1 : 0]);
    });
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const h = crypto.createHash('sha1').update(JSON.stringify(rows)).digest('hex').slice(0, 12);
  days.push({ d, n: rows.length, h });
  if (DUMP.has(d)) try { fs.writeFileSync(OUT.replace(/\.json$/, `.d${d}.json`), JSON.stringify(rows)); } catch (e) {}
  if (days.length % 10 === 0) try { fs.writeFileSync(OUT, JSON.stringify({ days })); } catch (e) {}
}
const Ev = require(path.join(ROOT, 'server', 'events'));
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments); const sd = L.scanDay;
  L.scanDay = function (world, day) { try { snap(day | 0); } catch (e) { console.error('[t1308b] 관측 실패:', e.message); } return sd.apply(this, arguments); };
  return L;
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify({ days })); } catch (e) {} });

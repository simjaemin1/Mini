'use strict';
// (@regress 없음 — 러너 밖 · T1385 판 자 · 제품 무변 · 읽기만)
// === scripts/t1385-war.js — 서버 자 판(400날 · 전쟁은 평형 뒤 365날부터 연다) 로그의 전쟁 날 줄 · 긴급 소집(막는 마을)을 관찰기 마을 칸(청동 근접검)과 잇는다 ==========
//   쓰는 법: node scripts/t1385-war.js <판 폴더 뿌리> <태그-시드> ...   → 표 줄(JSON 한 줄씩)
//   읽는 것: <뿌리>/<태그-시드>/<태그-시드>.log 의 `⚔️ 전쟁 day N: 선포 a[…] 전투 b(공승 c/방승 d) 사상 e 노획 f` (누계) · `⚔️ <마을> ★긴급 소집` ·
//            <태그-시드>.t1385.json 의 `snaps`(50날마다 + 끝) 마을 칸 — 막는 마을이 그날 가장 가까운 앞 꾸러미에서 청동 근접검을 쥐었나(≥ 1 자루).
//   로그에 치는 마을 이름은 없다(전쟁 날 줄은 누계 · 긴급 소집 줄만 마을 이름) — 그래서 "막는 마을"만 잇는다.
const fs = require('fs'), path = require('path');
const [ROOT, ...TAGS] = process.argv.slice(2);
for (const tag of TAGS) {
  const dir = path.join(ROOT, tag);
  const logF = path.join(dir, `${tag}.log`);
  if (!fs.existsSync(logF)) { console.log(JSON.stringify({ tag, err: 'no log' })); continue; }
  const lines = fs.readFileSync(logF, 'utf8').split('\n');
  let last = null, lastDay = -1; const scr = []; const perDay = {};
  for (const ln of lines) {
    let m = /⚔️ 전쟁 day (\d+): 선포 (\d+)\[[^\]]*\] 전투 (\d+)\(공승(\d+)\/방승(\d+)\) 사상 (\d+) 노획 (\d+)/.exec(ln);
    if (m) { lastDay = +m[1]; last = { day: +m[1], decl: +m[2], battle: +m[3], atkWin: +m[4], defWin: +m[5], cas: +m[6], loot: +m[7] }; perDay[lastDay] = last; continue; }
    m = /⚔️ (\S+) ★긴급 소집/.exec(ln);
    if (m) scr.push({ day: lastDay + 1, v: m[1] });
  }
  let t = null; try { t = JSON.parse(fs.readFileSync(path.join(dir, `${tag}.t1385.json`), 'utf8')); } catch (e) { /* 없음 */ }
  const snapAt = (d) => { if (!t || !t.snaps) return null; const ks = Object.keys(t.snaps).map(Number).filter((k) => k <= d).sort((a, b) => b - a); return ks.length ? { day: ks[0], rows: t.snaps[ks[0]] } : null; };
  const vc = t && t.vcols ? t.vcols : []; const iN = vc.indexOf('name'), iB = vc.indexOf('bronzeS'), iM = vc.indexOf('melee'), iP = vc.indexOf('pop');
  const defs = scr.map((s) => { const sn = snapAt(s.day); const r = sn && sn.rows.find((x) => x[iN] === s.v); return { day: s.day, v: s.v, snap: sn && sn.day, pop: r ? r[iP] : null, melee: r ? +(+r[iM]).toFixed(1) : null, bronze: r ? +(+r[iB]).toFixed(2) : null }; });
  // 막는 마을의 그날 뒤 전투 결과 — 소집 다음 날 누계 차이(공승 · 방승)
  for (const d of defs) { const a = perDay[d.day - 1] || { atkWin: 0, defWin: 0, cas: 0 }; let b = null; for (let k = d.day; k <= d.day + 3; k++) if (perDay[k]) { b = perDay[k]; if (b.atkWin + b.defWin > a.atkWin + a.defWin) break; } d.res = b ? (b.atkWin > a.atkWin ? '공승' : b.defWin > a.defWin ? '방승' : '없음') : '—'; d.cas = b ? b.cas - a.cas : null; }
  // 판 끝 청동 쥔 마을
  const endS = t && t.snaps ? snapAt(1e9) : null; const holders = endS ? endS.rows.filter((r) => +r[iB] >= 1).map((r) => r[iN]) : [];
  console.log(JSON.stringify({ tag, last, defs, holders }));
}

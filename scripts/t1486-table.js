#!/usr/bin/env node
// === scripts/t1486-table.js — T1486 표(손 셈 0): 판 자료(runs/<팔>-<시드>.json = 봇 프리로드 기록 · .sbc.json = 판 자 JSON · done.txt)에서 낸다 ===
//   쓰는 법: R=<자료 폴더> node scripts/t1486-table.js   → <R>/table.txt · table.json · first-line.txt
//   짝 = 같은 시드의 끔(off) ↔ 켬. 끔 판은 시드마다 하나(네 손잡이가 같이 쓴다 — 가상 시계 판은 결정론이라 같은 시드 끔 판은 바이트 같다).
//   "돈 횟수" = 그 손잡이의 길이 켬 판에서 실제로 닿은 수(손잡이마다 아래 FIRE 에 적은 셈 · 끔 판에서는 0 이어야 한다).
//   등급(스크립트가 낸다): 안 돎 = 켬 판 열 개 합 돈 횟수 0 · 다) = 인구 끔비 가운데 < 0.98 또는 빈 마을 합 + 2 이상 또는 하루 걸린 초 ×1.3 넘음 또는 굶어 죽음 합 +10% 넘음 ·
//            나) = (인구 끔비 가운데 > 1.02 또는 하루 걸린 초 ×0.7 밑) 이고 빈 마을 · 굶어 죽음이 안 늚 · 가) = 그 밖(돌았고 해 없음).
const fs = require('fs'), path = require('path');
const R = process.env.R || process.argv[2]; if (!R) { console.error('R=<폴더>'); process.exit(2); }
const RUNS = path.join(R, 'runs');
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const done = {}; try { for (const l of fs.readFileSync(path.join(R, 'done.txt'), 'utf8').split('\n')) { const [tag, rc, dt] = l.trim().split(/\s+/); if (tag) done[tag] = { rc: +rc, sec: +dt }; } } catch (e) {}
const ARMS = ['nobuild', 'react', 'npcdeath', 'terrseq'];
const NAME = { nobuild: 'T1423 NO_BUILD', react: 'T1423 BLOCK_REACT', npcdeath: 'T1432 NPC_DEATH', terrseq: 'T1433 TERR_SEQ' };
const sum = (o) => Object.values(o || {}).reduce((a, v) => a + (+v || 0), 0);
const med = (a) => { a = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const f = (x, n = 2) => x == null ? '—' : (+x).toFixed(n);
const mb = (b) => b == null ? '—' : (b / 1048576).toFixed(1);
function load(tag) {
  const rec = J(path.join(RUNS, tag + '.json')), sbc = J(path.join(RUNS, tag + '.sbc.json')), d = done[tag];
  if (!d) return null;
  const days = (rec && rec.days) || [], last = days[days.length - 1] || null, db = (rec && rec.db && rec.db[rec.db.length - 1]) || null;
  const ok = d.rc === 0 && !!rec && !!rec.end && !!sbc && last && sbc.days != null && last.d >= (sbc.days - 1);
  return { tag, rc: d.rc, sec: d.sec, rec, sbc, last, db, ok, days: last ? last.d : 0 };
}
const seeds = [...new Set(fs.readdirSync(RUNS).map((x) => (x.match(/^off-(\d+)\.done$/) || [])[1]).filter(Boolean))].sort((a, b) => a - b);
const OFF = {}; for (const s of seeds) OFF[s] = load('off-' + s);
// 손잡이마다 돈 횟수(켬 판 하나)
const FIRE = {
  nobuild: (r) => sum(r.rec.refuse || (r.last && r.last.ref)),                                  // 물 · 다리 · 다리 머리 거절(`_t1423A.refuse` 합)
  react: (r) => { const z = r.rec.zone || {}, t = r.rec.t1423 || {}; return (t.meet | 0) + (t.breaks | 0); },   // 캐러밴이 막는 물건을 만난 수 + 몸이 부순 수(걸음마다 세는 stopSleep · hits 는 셈 말고 풀이에만)
  npcdeath: (r) => (r.rec.t1432 && r.rec.t1432.died) | 0,                                      // 진짜 죽은 몸
  terrseq: (r) => (r.rec.terrCalls ? (r.rec.terrCalls.insertTerrSeq | 0) : 0),                  // 영토 묶음 행 쓰는 문 부른 수
};
const FIRE_DETAIL = {
  nobuild: (r) => { const o = r.rec.refuse || {}; return Object.keys(o).filter((k) => o[k]).map((k) => `${k}:${o[k]}`).join(' ') || '0'; },
  react: (r) => { const z = r.rec.zone || {}, t = r.rec.t1423 || {}; return `걸음 걸림 ${z.hits | 0} · 부숨 ${z.breaks | 0} · 벌 ${(z.vpOnline | 0) + (z.vpOffline | 0)} · 서고 ${t.stopSleep | 0} · 돌아감 ${t.resp | 0} · 만남 ${t.meet | 0}`; },
  npcdeath: (r) => { const t = r.rec.t1432 || {}; return `죽음 ${t.died | 0} (짐승 ${t.wild | 0} · 사람 손 ${t.other | 0})`; },
  terrseq: (r) => { const c = r.rec.terrCalls || {}; return `쓰기 ${c.insertTerrSeq | 0}번 ${c.rows | 0}행 · 묶기 ${c.terrCompact | 0}`; },
};
const out = { seeds, days: null, arms: {}, bots: null, dead: [], notes: [] };
const L = [];
const W = (s = '') => L.push(s);
for (const s of seeds) { const o = OFF[s]; if (o && o.rec) { out.days = out.days || (o.sbc && o.sbc.days) || o.days; out.bots = o.rec.bots; } }
for (const a of ARMS) {
  const pairs = [];
  for (const s of seeds) {
    const off = OFF[s], on = load(a + '-' + s);
    if (!on) { out.notes.push(`${a}-${s}: 판 없음`); continue; }
    if (!on.ok) out.dead.push(`${a}-${s}(rc ${on.rc} · ${on.days}날)`);
    if (off && !off.ok && !out.dead.some((x) => x.startsWith('off-' + s))) out.dead.push(`off-${s}(rc ${off.rc} · ${off.days}날)`);
    pairs.push({ s, off, on, both: !!(off && off.ok && on.ok) });
  }
  const live = pairs.filter((p) => p.both);
  const fires = live.map((p) => FIRE[a](p.on.rec ? p.on : { rec: {} }));
  const fireOff = live.map((p) => FIRE[a](p.off));
  const ratio = live.map((p) => p.on.last.pop / p.off.last.pop);
  const dEmpty = live.map((p) => p.on.last.empty - p.off.last.empty);
  const dFd = live.map((p) => p.on.last.fd - p.off.last.fd), fdOff = live.reduce((x, p) => x + p.off.last.fd, 0);
  const spd = (r) => { const d0 = r.rec.days.find((x) => x.d >= 1 + (r.rec.day0 | 0)) || r.rec.days[0]; return (r.last.wall - d0.wall) / Math.max(1, r.last.d - d0.d); };   // 부팅을 뺀 날 사이 벽시계 초(봇 손짓 첫 날 다음 날부터 끝까지)
  const sOn = med(live.map((p) => spd(p.on))), sOff = med(live.map((p) => spd(p.off)));
  const g = (r, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), r.rec.g);
  const A = {
    name: NAME[a], pairs: live.length, fires, fireTot: fires.reduce((x, y) => x + y, 0), fireRuns: fires.filter((x) => x > 0).length, fireOffTot: fireOff.reduce((x, y) => x + y, 0),
    ratioMed: med(ratio), ratioMin: ratio.length ? Math.min(...ratio) : null, ratioMax: ratio.length ? Math.max(...ratio) : null, dEmptySum: dEmpty.reduce((x, y) => x + y, 0), dFdSum: dFd.reduce((x, y) => x + y, 0), fdOff,
    secOn: sOn, secOff: sOff, secRatio: sOn && sOff ? sOn / sOff : null,
    popOn: med(live.map((p) => p.on.last.pop)), popOff: med(live.map((p) => p.off.last.pop)), emptyOn: live.reduce((x, p) => x + p.on.last.empty, 0), emptyOff: live.reduce((x, p) => x + p.off.last.empty, 0),
    deadOn: live.reduce((x, p) => x + p.on.last.dead, 0), deadOff: live.reduce((x, p) => x + p.off.last.dead, 0), emigOn: live.reduce((x, p) => x + p.on.last.emig, 0), emigOff: live.reduce((x, p) => x + p.off.last.emig, 0),
    notOn: live.reduce((x, p) => x + (p.on.rec.notice_n | 0), 0), notOff: live.reduce((x, p) => x + (p.off.rec.notice_n | 0), 0),
    vpOn: live.reduce((x, p) => x + p.on.last.vp, 0), vpOff: live.reduce((x, p) => x + p.off.last.vp, 0), vpMaxOn: Math.max(0, ...live.map((p) => p.on.last.vpMax)), vpMaxOff: Math.max(0, ...live.map((p) => p.off.last.vpMax)),
    blockPlacedOn: live.reduce((x, p) => x + g(p.on, 'block.placed'), 0), blockRefOn: live.reduce((x, p) => x + g(p.on, 'block.refused'), 0), blockPlacedOff: live.reduce((x, p) => x + g(p.off, 'block.placed'), 0), blockRefOff: live.reduce((x, p) => x + g(p.off, 'block.refused'), 0),
    bridgeOkOn: live.reduce((x, p) => x + g(p.on, 'bridge.ok'), 0), bridgeRefOn: live.reduce((x, p) => x + g(p.on, 'bridge.refused'), 0), bridgeOkOff: live.reduce((x, p) => x + g(p.off, 'bridge.ok'), 0), bridgeRefOff: live.reduce((x, p) => x + g(p.off, 'bridge.refused'), 0),
    landOkOn: live.reduce((x, p) => x + g(p.on, 'land.ok'), 0), landRefOn: live.reduce((x, p) => x + g(p.on, 'land.refused'), 0), landOkOff: live.reduce((x, p) => x + g(p.off, 'land.ok'), 0), landRefOff: live.reduce((x, p) => x + g(p.off, 'land.refused'), 0),
    hitTriesOn: live.reduce((x, p) => x + g(p.on, 'hit.tries'), 0), hitDiedOn: live.reduce((x, p) => x + g(p.on, 'hit.died'), 0), hitDownOn: live.reduce((x, p) => x + g(p.on, 'hit.down'), 0), hitDownOff: live.reduce((x, p) => x + g(p.off, 'hit.down'), 0), hitDiedOff: live.reduce((x, p) => x + g(p.off, 'hit.died'), 0),
    reconOn: live.reduce((x, p) => x + g(p.on, 'recon.owed'), 0), reconTry: live.reduce((x, p) => x + g(p.on, 'recon.tries'), 0),
    vbOn: med(live.map((p) => p.on.db && p.on.db.vb)), vbOff: med(live.map((p) => p.off.db && p.off.db.vb)), seqOn: med(live.map((p) => p.on.db && p.on.db.seq)), terrOn: med(live.map((p) => p.on.db && p.on.db.terr)), terrOff: med(live.map((p) => p.off.db && p.off.db.terr)), seqOff: med(live.map((p) => p.off.db && p.off.db.seq)),
    dbOn: med(live.map((p) => p.on.db && (p.on.db.db + p.on.db.wal))), dbOff: med(live.map((p) => p.off.db && (p.off.db.db + p.off.db.wal))),
    bldOn: med(live.map((p) => p.on.db && p.on.db.bld)), bldOff: med(live.map((p) => p.off.db && p.off.db.bld)),
    detail: live.slice(0, 10).map((p) => `${p.s}: ${FIRE_DETAIL[a](p.on)}`),
  };
  // 갈린 날(끔 ↔ 켬 인구 줄이 처음 달라진 날)
  A.divergeDay = live.map((p) => { const a1 = p.off.rec.days, b1 = p.on.rec.days; for (let i = 0; i < Math.min(a1.length, b1.length); i++) if (a1[i].pop !== b1[i].pop || a1[i].dead !== b1[i].dead) return a1[i].d; return null; });
  A.sameWorld = live.filter((p) => JSON.stringify(p.off.last && [p.off.last.pop, p.off.last.dead, p.off.last.fd, p.off.last.empty]) === JSON.stringify([p.on.last.pop, p.on.last.dead, p.on.last.fd, p.on.last.empty])).length;
  let cls;
  if (!A.pairs) cls = '자료 없음';
  else if (A.fireTot === 0) cls = '안 돎';
  else if ((A.ratioMed != null && A.ratioMed < 0.98) || A.dEmptySum >= 2 || (A.secRatio != null && A.secRatio > 1.3) || (A.fdOff > 0 && A.dFdSum / A.fdOff > 0.10)) cls = '다';
  else if ((A.ratioMed > 1.02 || (A.secRatio != null && A.secRatio < 0.7)) && A.dEmptySum <= 0 && A.dFdSum <= 0) cls = '나';
  else cls = '가';
  A.cls = cls; out.arms[a] = A;
}
// ── 글 ──
const days = out.days, B = out.bots;
W(`# T1486 표 — 봇 ${B}명 든 세계 · ${days}날 · 시드 ${seeds.length}개(${seeds.join(' · ')}) · 짝 = 같은 시드 끔 ↔ 켬`);
W('');
W('| 손잡이 | 짝 | 돈 횟수(켬 열 판 합 · 판 수) | 끔 판의 같은 셈 | 인구 끔비 가운데(최소 ~ 최대) | 빈 마을(끔 → 켬 합) | 굶어 죽음(끔 → 켬 합) | 하루 걸린 초(끔 → 켬) | 켬 = 끔 세계 지문 같은 짝 | 등급 |');
W('|---|---|---|---|---|---|---|---|---|---|');
for (const a of ARMS) { const A = out.arms[a]; W(`| ${A.name} | ${A.pairs} | ${A.fireTot} · ${A.fireRuns}/${A.pairs} | ${A.fireOffTot} | ${f(A.ratioMed, 3)} (${f(A.ratioMin, 3)} ~ ${f(A.ratioMax, 3)}) | ${A.emptyOff} → ${A.emptyOn} | ${A.deadOff} → ${A.deadOn} | ${f(A.secOff)} → ${f(A.secOn)} | ${A.sameWorld}/${A.pairs} | ${A.cls === '다' ? '다)' : A.cls === '나' ? '나)' : A.cls === '가' ? '가)' : A.cls} |`); }
W('');
W('돈 횟수 풀이: ' + ARMS.map((a) => `${out.arms[a].name} = ${{ nobuild: '물 · 다리 · 다리 머리 짓기 거절', react: '캐러밴이 막는 물건 만난 수 + 부순 수', npcdeath: '진짜 죽은 마을 몸', terrseq: '영토 묶음 행 쓰는 문 부른 수' }[a]}`).join(' · '));
W('');
W('## 봇이 겪은 것(켬 열 판 합 · 끔 열 판 합)');
W('');
W('| 손잡이 | 알림(거절 · 벌 글) 끔 → 켬 | 봇 벌점 합 끔 → 켬 (가장 큰 봇) | 길막기 울타리 선 것 끔 → 켬 (거절) | 다리 머리 울타리 선 것 끔 → 켬 (거절) | 남의 땅 안 울타리 끔 → 켬 (거절) | NPC 쓰러짐 끔 → 켬 (진짜 죽음 끔 → 켬) | 접속 끊었다 붙기(쌓인 몫 받은 수) |');
W('|---|---|---|---|---|---|---|---|');
for (const a of ARMS) { const A = out.arms[a]; W(`| ${A.name} | ${A.notOff} → ${A.notOn} | ${A.vpOff} → ${A.vpOn} (${A.vpMaxOff} → ${A.vpMaxOn}) | ${A.blockPlacedOff} → ${A.blockPlacedOn} (${A.blockRefOff} → ${A.blockRefOn}) | ${A.bridgeOkOff} → ${A.bridgeOkOn} (${A.bridgeRefOff} → ${A.bridgeRefOn}) | ${A.landOkOff} → ${A.landOkOn} (${A.landRefOff} → ${A.landRefOn}) | ${A.hitDownOff} → ${A.hitDownOn} (${A.hitDiedOff} → ${A.hitDiedOn}) | ${A.reconOn}/${A.reconTry} |`); }
W('');
W('## 마을(날 ' + days + ' 가운데 · 켬 열 판)');
W('');
W('| 손잡이 | NPC 인구 끔 → 켬 | 건물 행 `buildings` 끔 → 켬 | 죽음 합 끔 → 켬 | 떠남 합 끔 → 켬 | 인구가 처음 갈린 날(짝마다) |');
W('|---|---|---|---|---|---|');
for (const a of ARMS) { const A = out.arms[a]; W(`| ${A.name} | ${f(A.popOff, 0)} → ${f(A.popOn, 0)} | ${f(A.bldOff, 0)} → ${f(A.bldOn, 0)} | ${A.deadOff} → ${A.deadOn} | ${A.emigOff} → ${A.emigOn} | ${A.divergeDay.map((x) => x == null ? '안 갈림' : x).join(' · ')} |`); }
W('');
const T = out.arms.terrseq;
W('## T1433 건물 행 · DB (켬 열 판 가운데 · 날 ' + days + ')');
W('');
W('| 칸 | 끔 | 켬 |');
W('|---|---|---|');
W(`| \`village_buildings\` 행 | ${f(T.vbOff, 0)} | ${f(T.vbOn, 0)} |`);
W(`| 그 가운데 영토 낱칸 \`terr\` | ${f(T.terrOff, 0)} | ${f(T.terrOn, 0)} |`);
W(`| 그 가운데 묶음 \`terrseq\` | ${f(T.seqOff, 0)} | ${f(T.seqOn, 0)} |`);
W(`| DB 파일(본체 + WAL) MB | ${mb(T.dbOff)} | ${mb(T.dbOn)} |`);
W(`| 하루 걸린 초 | ${f(T.secOff)} | ${f(T.secOn)} |`);
W('');
W('## 켬 판 손잡이 셈(짝마다)');
W('');
for (const a of ARMS) { W(`- ${out.arms[a].name}: ${out.arms[a].detail.join(' / ') || '—'}`); }
W('');
W('## 죽은 판');
W('');
W(out.dead.length ? out.dead.map((x) => '- ' + x).join('\n') : '없음(판 모두 rc 0 · 끝 날까지)');
for (const n of out.notes) W('- ' + n);
// 첫 줄
const cnt = (c) => ARMS.filter((a) => out.arms[a].cls === c).length;
const tot = ARMS.map((a) => out.arms[a].fireTot);
const first = `넷 — 돈 횟수 ${tot.join(' · ')} · 가) ${cnt('가')} · 나) ${cnt('나')} · 다) ${cnt('다')} · 안 돎 ${cnt('안 돎')} · 건물 행 ${f(T.vbOff, 0)} → ${f(T.vbOn, 0)} · DB ${mb(T.dbOff)} → ${mb(T.dbOn)} MB · 죽은 판 ${out.dead.length} · 회부 ${process.env.REFER || '○'}`;
fs.writeFileSync(path.join(R, 'table.txt'), L.join('\n') + '\n');
fs.writeFileSync(path.join(R, 'table.json'), JSON.stringify(out));
fs.writeFileSync(path.join(R, 'first-line.txt'), first + '\n');
console.log(first);

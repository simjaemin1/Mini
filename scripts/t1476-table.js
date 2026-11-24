#!/usr/bin/env node
// (@regress 없음 — 러너 밖 표 입 · T1476)
// =============================================================================
// scripts/t1476-table.js — T1476 표 입. 세계를 안 띄운다 · 제품 코드 · 자를 안 부른다 · 판 요약 파일만 읽는다.
//
// ① 못 지은 여섯 판의 까닭(T1428 · T1458 판 요약에서) ② 켬 ↔ 끔 같은 세계 스무 짝 ③ 아홉 칸 막힘 마을 셋 다섯 판씩(켬)
// ④ `e2e-membership` ⑦ 켬 · 끔 스무 판씩 · ⑤ 죽은 판 · 40분 끊은 판(따로).
//
// 쓰는 법
//   표   node scripts/t1476-table.js --md <out.md> --json <out.json> --old <T1428 판 디렉터리> <T1458 판 디렉터리> --pairs <T1476 봇 디렉터리> --m7 <T1476 m7 디렉터리> [--m7ctl <혼자 돌린 ⑦ 디렉터리>]
//   묶기 node scripts/t1476-table.js --pack <raw 디렉터리> <out 디렉터리>      (raw 판 JSON · 끝 표시 · 귀 로그 → 작은 요약 gz · 한 번만 · 표와는 따로)
//
// 판 이름(`--pairs`): `<짝 id>-<on|off>-t<n>` — 짝 id = `p01-어촌2-봄` · 덧판(켬만) `x1-어촌2-봄재`. 같은 이름의 가장 늦은 t 만 센다.
// 끔 = `T1305_DEEDS=0 T1392_FIRST_LOT=0 T1402_SPLIT_OK=0` · 켬 = 기본(main 그대로).
// 막힌 까닭 = 존이 보낸 `lot_preview` 칸마다의 까닭(`scripts/t1476-lotlog.js` 귀 · 켬 판만 나온다).
// 가르기(판정 아닌 셈 · 글자 그대로): 여섯 판 까닭 = 막힘(아홉 칸 막힌 뒤 집터 5분 넘게 늦음 · 집터 25분 넘음) → 시간(집터 25분 넘음)
//   → 추위(추위 걸음 `warm` 합 ≥ 5분 또는 추위 0.8 넘음) → 재료(그 밖 — 움집 ③ 이엉 · 풀 · 서까래 · 곡괭이 쪽). 추위 낀 판(합 ≥ 2분)은 덧으로 따로 센다.
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const list = (f) => { const i = argv.indexOf(f); if (i < 0) return []; const o = []; for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) o.push(argv[j]); return o; };
const readJ = (f) => JSON.parse(/\.gz$/.test(f) ? zlib.gunzipSync(fs.readFileSync(f)).toString('utf8') : fs.readFileSync(f, 'utf8'));
const r2 = (x) => (x == null ? null : +x.toFixed(2));
const ms = (r, k) => (r.milestones && r.milestones[k] ? r.milestones[k].min : null);
const f = (v) => (v == null ? '—' : String(v));
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const WHY_KO = { claim: '남의 땅', mine: '풀린 내 땅', water: '물', rock: '바위', ditch: '도랑', village: '마을 시설', building: '건물', vacant: '빈 집', bridge: '다리', head: '다리 끝' };
const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };

// ───────────────────────── 묶기 ─────────────────────────
if (argv.includes('--pack')) {
  const [rawDir, outDir] = list('--pack');
  fs.mkdirSync(outDir, { recursive: true });
  for (const g of fs.readdirSync(rawDir).sort()) {
    if (!/\.done$/.test(g)) continue;
    const base = g.replace(/\.done$/, '');
    if (/^(lane|worker)/.test(base)) continue;
    const doneTxt = fs.readFileSync(path.join(rawDir, g), 'utf8');
    if (/^m7-/.test(base)) { fs.writeFileSync(path.join(outDir, base + '.txt'), doneTxt); continue; }
    fs.writeFileSync(path.join(outDir, base + '.done'), doneTxt.split('\n')[0] + '\n');
    const jf = path.join(rawDir, base + '.json');
    let r = null; try { r = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { r = null; }
    if (r) {
      const s = r.samples || [];
      const last = s[s.length - 1] || {};
      const step = s.length > 1 ? (s[s.length - 1].t - s[0].t) / (s.length - 1) : 5;
      const warm = (r.legs || []).filter((l) => l.kind === 'warm').reduce((a, l) => a + (l.sec || 0), 0);
      let lot = []; try { lot = fs.readFileSync(path.join(rawDir, base + '.lot.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((x) => JSON.parse(x)); } catch (e) { lot = []; }
      const at = r.arrival && r.arrival.at;
      const lotlog = {
        previews: lot.filter((x) => x.k === 'lot').map((x) => ({ min: at ? r2((x.ms - at) / 60000) : null, cx: x.cx, cy: x.cy, cells: x.cells, gate: x.gate })).slice(0, 400),
        notices: lot.filter((x) => x.k === 'notice').map((x) => ({ min: at ? r2((x.ms - at) / 60000) : null, text: x.text })).slice(0, 40),
      };
      const out = {
        tag: r.tag, season: r.season, seasonDay: r.seasonDay, pickVid: r.pickVid, capMin: r.capMin, village: r.village, arrival: r.arrival ? { at: r.arrival.at } : null,
        milestones: r.milestones, blockers: r.blockers, notes: (r.notes || []).slice(0, 60), legs: (r.legs || []).map((l) => ({ t: l.t, kind: l.kind, need: l.need, ok: l.ok, reason: l.reason, sec: l.sec, cells: l.cells, gate: l.gate })),
        panelSeq: r.panelSeq, notices: (r.notices || []).slice(-60), final: { inv: r.final && r.final.inv }, hutReach: r.hutReach, stucks: (r.stucks || []).length, explore: r.explore,
        errors: r.errors, fatal: r.fatal || null, fps: r.fps,
        sampleStats: { n: s.length, stepSec: r2(step), endT: last.t, maxCold: s.length ? Math.max(...s.map((x) => x.cold || 0)) : null,
          coldOver05Min: r2(s.filter((x) => (x.cold || 0) > 0.5).length * step / 60), nightFrac: s.length ? r2(s.filter((x) => x.night).length / s.length) : null,
          last: { hunger: last.hunger, thirst: last.thirst, cold: last.cold, night: last.night } },
        warmSec: r2(warm), lotlog,
      };
      fs.writeFileSync(path.join(outDir, base + '.json.gz'), zlib.gzipSync(JSON.stringify(out)));
    } else {
      // 죽은 판 · 끊은 판 — 판 글 꼬리만
      try { const t = fs.readFileSync(path.join(rawDir, base + '.log'), 'utf8').split('\n').slice(-12).join('\n').slice(-2500); fs.writeFileSync(path.join(outDir, base + '.log-tail.gz'), zlib.gzipSync(t)); } catch (e) { /* 없음 */ }
    }
  }
  console.log('묶음 끝 →', outDir);
  process.exit(0);
}

// ───────────────────────── 표 ─────────────────────────
const MD = val('--md'), JS = val('--json');
const oldDirs = list('--old'), pairDirs = list('--pairs'), m7Dirs = list('--m7');
if (!oldDirs.length && !pairDirs.length && !m7Dirs.length) { console.log('쓰는 법: node scripts/t1476-table.js --md out.md --json out.json --old <dir…> --pairs <dir> --m7 <dir>   |   --pack <raw> <out>'); process.exit(2); }

const filesOf = (dirs, re) => { const o = []; for (const d of dirs) for (const g of fs.readdirSync(d).sort()) if (re.test(g)) o.push(path.join(d, g)); return o; };
const rcOf = (file) => { try { const m = /EXIT\s+(-?\d+)/.exec(fs.readFileSync(file.replace(/\.json(\.gz)?$/, '.done'), 'utf8')); return m ? +m[1] : null; } catch (e) { return null; } };

// 판 하나 → 셈(옛 판 · 새 판 같은 입)
function metrics(r) {
  const notes = r.notes || [];
  const nine = notes.filter((n) => /아홉 칸 막힘/.test(n)).map((n) => +(parseFloat(n) / 60).toFixed(2));
  const away = notes.filter((n) => /\[자\] 영토 밖/.test(n)).length;
  const lotLegs = (r.legs || []).filter((l) => l.kind === 'lot-preview-blocked');
  const lot = ms(r, '집터'), done = ms(r, '움집 완공');
  const ll = r.lotlog || { previews: [], notices: [] };
  // (자의 시계와 귀의 시계는 도착 때 기준이 몇 초 어긋난다 — 창을 앞 0.4분 · 뒤 0.3분 넓혔다)
  // 첫 막힘 = 자가 선포를 시도하다 막힌 첫 때(`lot-preview-blocked` 걸음 · 없으면 자 글 "아홉 칸 막힘") — 미리보기는 도착 때부터 나와 쓸 수 없다
  const firstTry = lotLegs.length ? r2(Math.min(...lotLegs.map((l) => l.t)) / 60) : (nine.length ? nine[0] : null);
  const whyAll = {}, whyFirst = {};
  let firstDone = false;
  for (const p of ll.previews) {
    if (firstTry == null || p.min == null || p.min < firstTry - 0.4) continue;      // 시도하는 동안(첫 시도부터)의 미리보기만
    if (lot != null && p.min > lot + 0.3) continue;
    const keys = [];
    for (const c of p.cells || []) if (!keys.includes(c[2])) keys.push(c[2]);
    if (p.gate) keys.push(/영토 안 집터|인정받은/.test(String(p.gate)) ? '영토 문(인정받은 구성원만)' : '문(' + String(p.gate).replace(/^\S+\s/, '').slice(0, 16) + ')');
    for (const k of keys) { whyAll[k] = (whyAll[k] || 0) + 1; if (!firstDone) whyFirst[k] = (whyFirst[k] || 0) + 1; }
    if (keys.length) firstDone = true;
  }
  const firstBlockMin = firstTry;
  const usual = ['첫 도구', '첫 불', '열매', '첫 잠자리', '첫 열매/갈대', '물', '첫 밥'];
  const blk = (r.blockers || []).filter((b) => !usual.includes(b.need)).map((b) => `${b.need}@${r2(b.t / 60)}: ${String(b.reason).slice(0, 50)}`);
  return {
    lot: r2(lot), dig: r2(ms(r, '움집터(① 굴착)')), done: r2(done), nine: nine.length, nineFirst: nine.length ? nine[0] : null,
    away, lotTries: lotLegs.length, previews: ll.previews.length, whyAll, whyFirst, firstBlockMin,
    blockToLot: firstBlockMin != null && lot != null ? r2(lot - firstBlockMin) : null, nineToLot: nine.length && lot != null ? r2(lot - nine[0]) : null,
    claimNotices: (ll.notices || []).map((x) => x.text).filter((x) => !/두었습니다/.test(x)).concat([...new Set(ll.previews.filter((q) => q.gate).map((q) => String(q.gate)))]), deedsBlk: blk, hutReach: r.hutReach || null,
    err: (r.errors || []).length, fatal: r.fatal || null, village: (r.village && r.village.name) || '?', season: r.season, vid: r.village ? r.village.vid : r.pickVid,
    endMin: r.sampleStats ? r2(r.sampleStats.endT / 60) : null,
  };
}

// ── ① 여섯 판 ──
const SIX = [['g-v4', '광산4'], ['r03-임업1', '임업1'], ['r04-광산1', '광산1'], ['r09-농촌9', '농촌9'], ['r11-임업4', '임업4'], ['r15-임업6', '임업6']];
function oneRun(file) {
  const r = readJ(file); const end = r.samples && r.samples.length ? r.samples[r.samples.length - 1].t : (r.sampleStats ? r.sampleStats.endT : 0);
  return { r, end };
}
const oldFiles = filesOf(oldDirs, /\.json(\.gz)?$/);
const oldRuns = [];   // 스무 판(철마다 셈)
for (const file of oldFiles) {
  const base = path.basename(file).replace(/\.json(\.gz)?$/, '');
  const m = /^(.*)-t(\d+)$/.exec(base); const id = m ? m[1] : base;
  let r; try { r = readJ(file); } catch (e) { continue; }
  oldRuns.push({ id, file, r, m: metrics(r) });
}
const seasonOld = {};
for (const x of oldRuns) { const k = SEASON_KO[x.r.season] || x.r.season; const s = seasonOld[k] || (seasonOld[k] = { n: 0, lot: 0, done: 0 }); s.n++; if (x.m.lot != null) s.lot++; if (x.m.done != null) s.done++; }

function stageLine(r) {
  const keys = [['집터', '집터'], ['곡괭이(손 제작)', '곡괭이'], ['움집터(① 굴착)', '① 굴착'], ['움집 ② 단계', '②'], ['움집 ③ 단계', '③'], ['움집 완공', '완공']];
  return keys.filter(([k]) => ms(r, k) != null).map(([k, n]) => `${n} ${r2(ms(r, k))}`).join(' → ');
}
function longestGap(r) {
  const keys = ['첫 통나무', '첫 돌', '집터', '곡괭이(손 제작)', '움집터(① 굴착)', '움집 ② 단계', '움집 ③ 단계', '움집 완공'];
  const pts = keys.filter((k) => ms(r, k) != null).map((k) => [k, ms(r, k)]).sort((a, b) => a[1] - b[1]);
  const endMin = ((r.sampleStats && r.sampleStats.endT) || (r.samples && r.samples[r.samples.length - 1].t) || 2100) / 60;
  pts.push(['판 끝', endMin]);
  let best = null;
  for (let i = 1; i < pts.length; i++) { const d = pts[i][1] - pts[i - 1][1]; if (!best || d > best.d) best = { from: pts[i - 1][0], to: pts[i][0], d: r2(d), at: pts[i - 1][1] }; }
  return best;
}
const sixRows = [];
for (const [id] of SIX) {
  const x = oldRuns.find((o) => o.id === id || o.id.startsWith(id));
  if (!x) { sixRows.push({ id, missing: true }); continue; }
  const r = x.r, m = x.m;
  const s = r.samples || [];
  const endT = s.length ? s[s.length - 1].t : (r.sampleStats ? r.sampleStats.endT : 2100);
  const step = s.length > 1 ? (s[s.length - 1].t - s[0].t) / (s.length - 1) : 5;
  const maxCold = s.length ? Math.max(...s.map((q) => q.cold || 0)) : null;
  const coldMin = s.length ? s.filter((q) => (q.cold || 0) > 0.5).length * step / 60 : null;
  const nightFrac = s.length ? s.filter((q) => q.night).length / s.length : null;
  const warmSec = (r.legs || []).filter((l) => l.kind === 'warm').reduce((a, l) => a + (l.sec || 0), 0);
  const lastSite = [...(r.panelSeq || [])].reverse().find((p) => /^site:/.test(p.ps));
  const lastPs = (r.panelSeq || []).length ? r.panelSeq[r.panelSeq.length - 1] : null;
  const inv = (r.final && r.final.inv) || {};
  const gap = longestGap(r);
  const tail = (r.legs || []).filter((l) => l.t > endT - 300).map((l) => `${r2(l.t / 60)}분 ${l.kind}${l.need ? '/' + l.need : ''}${l.ok === false ? '(실패 ' + (l.reason || '') + ')' : ''}`);
  const tailNotes = (r.notes || []).filter((n) => parseFloat(n) > endT - 300).map((n) => n.slice(0, 60)).slice(-4);
  const tailNot = (r.notices || []).filter((n) => n.t > endT - 300).map((n) => `${r2(n.t / 60)}분 ${String(n.x).slice(0, 36)}`).slice(-6);
  const lot = m.lot;
  let cause, why;
  if (m.nine && lot != null && lot - m.nineFirst >= 5 && lot >= 25) { cause = '막힘'; why = `아홉 칸 막힘 ${m.nine}번 · 첫 막힘 ${m.nineFirst}분 → 집터 ${lot}분`; }
  else if (lot == null || lot >= 25) { cause = '시간'; why = `집터가 ${f(lot)}분 — 첫 돌 ${f(r2(ms(r, '첫 돌')))}분 · 첫 통나무 ${f(r2(ms(r, '첫 통나무')))}분`; }
  else if (warmSec >= 300 || (maxCold != null && maxCold >= 0.8)) { cause = '추위'; why = `추위 걸음 ${r2(warmSec)}초 · 추위 가장 ${r2(maxCold)}`; }
  else { cause = '재료'; why = `${r.hutReach || '?'} — 끝 칸 ${lastSite ? lastSite.ps : f(lastPs && lastPs.ps)} · 가장 긴 칸 ${gap.from}→${gap.to} ${gap.d}분`; }
  sixRows.push({
    id, village: m.village, season: SEASON_KO[r.season] || r.season, seasonRaw: r.season, cause, why, hutReach: r.hutReach, stages: stageLine(r), gap,
    endMin: r2(endT / 60), stageMinAtEnd: (() => { const k = r.hutReach === '움집 ③ 단계' ? '움집 ③ 단계' : r.hutReach === '움집 ② 단계' ? '움집 ② 단계' : '움집터(① 굴착)'; const t0 = ms(r, k); return t0 != null ? r2(endT / 60 - t0) : null; })(),
    lastPanel: lastPs ? `${r2(lastPs.t / 60)}분 ${lastPs.ps}` : null, lastSite: lastSite ? lastSite.ps : null,
    bag: Object.entries(inv).map(([k, v]) => `${k} ${v}`).join(' · '),
    maxCold: r2(maxCold), coldOver05Min: r2(coldMin), nightFrac: r2(nightFrac), warmSec: r2(warmSec),
    lost: { stucks: Array.isArray(r.stucks) ? r.stucks.length : r.stucks, exploreSec: r.explore && r2(r.explore.sec), unfreeNotes: (r.notes || []).filter((n) => /갇힘 풀기/.test(n)).length },
    tail: { legs: tail, notes: tailNotes, notices: tailNot },
    thirstEnd: s.length ? s[s.length - 1].thirst : null, hungerEnd: s.length ? s[s.length - 1].hunger : null,
    nine: m.nine, nineFirst: m.nineFirst,
  });
}
const sixCount = { 재료: 0, 추위: 0, 시간: 0, 막힘: 0 };
for (const x of sixRows) if (x.cause) sixCount[x.cause]++;
const sixWarm = sixRows.filter((x) => x.warmSec >= 120).map((x) => x.id);

// ── ② 짝 ──
const pairFiles = filesOf(pairDirs, /\.json\.gz$|\.log-tail\.gz$|\.done$/);
const byTag = new Map();   // 'p01-어촌2-봄|on' → {tries: Map(t → {json?, done, tail?})}
for (const file of pairFiles) {
  const base = path.basename(file).replace(/\.(json\.gz|log-tail\.gz|done)$/, '');
  const m = /^(.*)-(on|off)-t(\d+)$/.exec(base); if (!m) continue;
  const key = m[1] + '|' + m[2];
  const e = byTag.get(key) || { pid: m[1], mode: m[2], tries: new Map() };
  const t = e.tries.get(+m[3]) || {}; e.tries.set(+m[3], t);
  if (/\.json\.gz$/.test(file)) t.json = file; else if (/\.done$/.test(file)) t.done = file; else t.tail = file;
  byTag.set(key, e);
}
const runs = [];   // 판마다 한 줄(가장 늦은 t)
for (const e of byTag.values()) {
  const ts = [...e.tries.keys()].sort((a, b) => a - b); const t = e.tries.get(ts[ts.length - 1]);
  let rc = null; try { const mm = /EXIT\s+(-?\d+)/.exec(fs.readFileSync(t.done, 'utf8')); rc = mm ? +mm[1] : null; } catch (er) { /* 없음 */ }
  let m = null; if (t.json) { try { m = metrics(readJ(t.json)); } catch (er) { m = null; } }
  const cut = rc === 124 || rc === 137;
  const dead = !m || m.fatal || (rc != null && rc !== 0 && !cut);
  runs.push({ pid: e.pid, mode: e.mode, tries: ts.length, rc, cut: !!cut, dead: !!(dead && !cut), m });
}
runs.sort((a, b) => a.pid.localeCompare(b.pid, 'ko') || a.mode.localeCompare(b.mode));
const isPair = (pid) => /^p\d\d-/.test(pid);
const pids = [...new Set(runs.filter((x) => isPair(x.pid)).map((x) => x.pid))].sort();
const get = (pid, mode) => runs.find((x) => x.pid === pid && x.mode === mode);
const okRun = (x) => x && x.m && !x.cut && !x.dead;
const pairRows = pids.map((pid) => {
  const off = get(pid, 'off'), on = get(pid, 'on');
  return { pid, off, on };
});
function modeSum(mode) {
  const rs = pairRows.map((p) => p[mode]);
  const valid = rs.filter(okRun);
  const lots = valid.filter((x) => x.m.lot != null).map((x) => x.m.lot), dones = valid.filter((x) => x.m.done != null).map((x) => x.m.done);
  return {
    n: pairRows.length, valid: valid.length, dead: rs.filter((x) => !x || x.dead).length, cut: rs.filter((x) => x && x.cut).length,
    lot: lots.length, done: dones.length, lotMed: r2(med(lots)), lotMean: r2(mean(lots)), doneMed: r2(med(dones)), doneMean: r2(mean(dones)),
    nineRuns: valid.filter((x) => x.m.nine > 0).length, nineTotal: valid.reduce((a, x) => a + x.m.nine, 0), lotTries: valid.reduce((a, x) => a + x.m.lotTries, 0),
  };
}
const sumOff = pairDirs.length ? modeSum('off') : null, sumOn = pairDirs.length ? modeSum('on') : null;
// 짝으로 견줌(둘 다 집터를 선 짝)
const both = pairRows.filter((p) => okRun(p.on) && okRun(p.off) && p.on.m.lot != null && p.off.m.lot != null);
const pairCmp = pairDirs.length ? {
  bothLot: both.length, onFaster: both.filter((p) => p.on.m.lot < p.off.m.lot).length, offFaster: both.filter((p) => p.on.m.lot > p.off.m.lot).length,
  diffMed: r2(med(both.map((p) => p.on.m.lot - p.off.m.lot))),
  bothDone: pairRows.filter((p) => okRun(p.on) && okRun(p.off) && p.on.m.done != null && p.off.m.done != null).length,
  onOnlyDone: pairRows.filter((p) => okRun(p.on) && p.on.m.done != null && !(okRun(p.off) && p.off.m.done != null)).map((p) => p.pid),
  offOnlyDone: pairRows.filter((p) => okRun(p.off) && p.off.m.done != null && !(okRun(p.on) && p.on.m.done != null)).map((p) => p.pid),
} : null;
// 철마다
const bySeasonPair = {};
for (const p of pairRows) for (const mode of ['off', 'on']) {
  const x = p[mode]; if (!x || !x.m) continue; const k = x.m.season; const s = (bySeasonPair[k] = bySeasonPair[k] || { off: { n: 0, done: 0 }, on: { n: 0, done: 0 } }); s[mode].n++; if (x.m.done != null) s[mode].done++;
}
// 끔 판의 막힘 글(고정 글 모음)
function noticeTally(mode) {
  const t = {};
  for (const x of runs.filter((q) => q.mode === mode && q.m)) for (const k of new Set((x.m.claimNotices || []).map((s) => s.replace(/^[^가-힣A-Za-z0-9(]+/, '').replace(/\d+/g, '#').slice(0, 70)))) t[k] = (t[k] || 0) + 1;
  return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 8);
}
const noticeOn = pairDirs.length ? noticeTally('on') : [], noticeOff = pairDirs.length ? noticeTally('off') : [];

// ── ③ 아홉 칸 막힘(켬 · 마을 셋 다섯 판) ──
const NINE_V = ['어촌2', '광산4', '어촌7'];
const nineRuns = runs.filter((x) => x.mode === 'on' && x.m && NINE_V.includes(x.m.village)).sort((a, b) => a.m.village.localeCompare(b.m.village, 'ko') || a.pid.localeCompare(b.pid, 'ko'));
const nineBy = {};
for (const v of NINE_V) {
  const rs = nineRuns.filter((x) => x.m.village === v);
  const causeRuns = {}, causeFirst = {};
  for (const x of rs) { for (const w of Object.keys(x.m.whyAll)) causeRuns[w] = (causeRuns[w] || 0) + 1; for (const w of Object.keys(x.m.whyFirst)) causeFirst[w] = (causeFirst[w] || 0) + 1; }
  const blocked = rs.filter((x) => x.m.previews > 0 || x.m.nine > 0);
  nineBy[v] = { runs: rs.length, blocked: blocked.length, causeRuns, causeFirst, blockToLotMed: r2(med(blocked.filter((x) => x.m.blockToLot != null).map((x) => x.m.blockToLot))), blockToLotMax: r2(Math.max(0, ...blocked.map((x) => x.m.blockToLot || 0))), lotMed: r2(med(rs.filter((x) => x.m.lot != null).map((x) => x.m.lot))), done: rs.filter((x) => x.m.done != null).length };
}
const nineCauseAll = {};
for (const x of nineRuns) for (const w of Object.keys(x.m.whyAll)) nineCauseAll[w] = (nineCauseAll[w] || 0) + 1;

// ── ④ ⑦ ──
const readM7 = (dirs) => filesOf(dirs, /^m7-(on|off)-\d+\.txt$/).map((file) => {
  const t = fs.readFileSync(file, 'utf8'); const mode = /m7-(on|off)-/.exec(path.basename(file))[1];
  const rc = (/EXIT\s+(-?\d+)/.exec(t) || [])[1];
  const pf = /PASS (\d+) \/ FAIL (\d+)/.exec(t);
  const l7 = t.split('\n').find((l) => /⑦ 곳간은 촌장만/.test(l));
  const l7b = t.split('\n').find((l) => /⑦b/.test(l));
  const red = l7 ? /✗/.test(l7) : null;
  return { name: path.basename(file, '.txt'), mode, rc: rc == null ? null : +rc, pass: pf ? +pf[1] : null, fail: pf ? +pf[2] : null, red, redB: l7b ? /✗/.test(l7b) : null,
    msg: l7 ? ((/\[(.*)\]\s*$/.exec(l7) || [])[1] || '').slice(0, 60) : null, dead: !pf || !l7 };
}).sort((a, b) => a.name.localeCompare(b.name));
const sumM7 = (arr) => { const o = {}; for (const mode of ['on', 'off']) { const rs = arr.filter((x) => x.mode === mode), ok = rs.filter((x) => !x.dead); o[mode] = { n: rs.length, valid: ok.length, dead: rs.length - ok.length, red: ok.filter((x) => x.red).length, redB: ok.filter((x) => x.redB).length, otherFail: ok.filter((x) => x.fail > 0 && !x.red).length, msgs: [...new Set(ok.filter((x) => x.red).map((x) => x.msg))] }; } return o; };
const m7 = readM7(m7Dirs), m7Sum = sumM7(m7);
const m7ctl = readM7(list('--m7ctl')), m7ctlSum = sumM7(m7ctl);

// ───────────────────────── 쓰기 ─────────────────────────
const L = [];
const sec = (t) => { L.push('', `## ${t}`, ''); };
if (oldFiles.length) {
  sec('① 못 지은 여섯 판의 까닭');
  L.push('| 판 | 마을 · 철 | 갈린 까닭 | 멈춘 단계(분) | 끝 칸 · 가장 긴 칸 | 가방(끝) | 추위(가장 · 0.5 넘은 분 · 추위 걸음 초) | 밤 비율 | 길 잃음(갇힘 · 둘러봄 초) | 아홉 칸 막힘 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const x of sixRows) {
    if (x.missing) { L.push(`| ${x.id} | (판 없음) |`); continue; }
    L.push(`| ${x.id} | ${x.village} · ${x.season} | **${x.cause}** — ${x.why} | ${x.stages} · 끝 ${x.endMin}분(그 단계 ${f(x.stageMinAtEnd)}분째) | ${x.lastSite || x.lastPanel} · ${x.gap.from}→${x.gap.to} ${x.gap.d}분 | ${x.bag} | ${f(x.maxCold)} · ${f(x.coldOver05Min)} · ${f(x.warmSec)} | ${f(x.nightFrac)} | ${x.lost.stucks} · ${f(x.lost.exploreSec)} | ${x.nine ? x.nine + '번(첫 ' + x.nineFirst + '분)' : '—'} |`);
  }
  L.push('', `까닭 셈 — 재료 ${sixCount.재료} · 추위 ${sixCount.추위} · 시간 ${sixCount.시간} · 막힘 ${sixCount.막힘}(가르기 줄은 이 파일 머리 주석) · 추위 걸음 2분 넘게 낀 판 ${sixWarm.length}(${sixWarm.join(' · ') || '—'})`);
  L.push('', '마지막 5분 행동 줄(판마다):', '');
  for (const x of sixRows) { if (x.missing) continue; L.push(`* **${x.id}** — 걸음: ${x.tail.legs.join(' ; ') || '—'} · 알림: ${x.tail.notices.join(' ; ') || '—'} · 자 글: ${x.tail.notes.join(' ; ') || '—'} · 「지금 할 일」 끝: ${x.lastPanel}`); }
  L.push('', `철마다(스무 판 · 집터/완공/판): ${Object.entries(seasonOld).map(([k, s]) => `${k} ${s.lot}/${s.done}/${s.n}`).join(' · ')}`);
  // 갈래마다 완공/판 — 옛 스무 판(켬) · 짝 끔 · 짝 켬(이름 머리로 센다)
  const kindOf = (n) => (/^(농촌|어촌|임업|광산)/.exec(n || '') || ['?'])[0];
  const kindTab = {};
  const addK = (grp, name, done) => { const k = kindOf(name); const t = (kindTab[k] = kindTab[k] || {}); const g = (t[grp] = t[grp] || { n: 0, done: 0 }); g.n++; if (done != null) g.done++; };
  for (const x of oldRuns) addK('옛 스무 판(켬)', x.m.village, x.m.done);
  for (const p of pairRows) for (const [grp, x] of [['짝 끔', p.off], ['짝 켬', p.on]]) if (x && x.m) addK(grp, x.m.village, x.m.done);
  const kindOrder = ['농촌', '어촌', '임업', '광산'];
  L.push('', `갈래마다 완공/판(옛 스무 판 켬 | 짝 끔 | 짝 켬): ${kindOrder.filter((k) => kindTab[k]).map((k) => { const t = kindTab[k]; const c = (g) => (t[g] ? `${t[g].done}/${t[g].n}` : '—'); return `${k} ${c('옛 스무 판(켬)')} | ${c('짝 끔')} | ${c('짝 켬')}`; }).join(' · ')}`);
}
if (sumOn) {
  sec('② 켬 ↔ 끔 같은 세계 짝 스무 판');
  L.push('세계 하나 = 전수 시딩(`--villages all` · 마을 51곳) · 줄 = `e2e-first30 --season <철> --start day --panel-bot --own --guide --cap 35 --no-align --villages all:<vid>` · 끔 = `T1305_DEEDS=0 T1392_FIRST_LOT=0 T1402_SPLIT_OK=0`.', '');
  L.push('| 짝 | vid | 끔 집터 | 끔 완공 | 끔 아홉 칸 막힘 | 끔 rc | 켬 집터 | 켬 완공 | 켬 아홉 칸 막힘 | 켬 rc | 켬 첫 막힘→집터 | 켬 막힌 까닭(그 까닭이 낀 미리보기 수) |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  const cell = (x, k) => (x ? (x.cut ? '끊음' : x.dead || !x.m ? '죽음' : f(x.m[k])) : '—');
  for (const p of pairRows) {
    const vid = (p.on && p.on.m && p.on.m.vid) || (p.off && p.off.m && p.off.m.vid);
    L.push(`| ${p.pid} | ${f(vid)} | ${cell(p.off, 'lot')} | ${cell(p.off, 'done')} | ${p.off && p.off.m ? p.off.m.nine : '—'} | ${f(p.off && p.off.rc)} | ${cell(p.on, 'lot')} | ${cell(p.on, 'done')} | ${p.on && p.on.m ? p.on.m.nine : '—'} | ${f(p.on && p.on.rc)} | ${p.on && p.on.m ? f(p.on.m.blockToLot) : '—'} | ${p.on && p.on.m ? Object.entries(p.on.m.whyAll).map(([k, v]) => `${WHY_KO[k] || k} ${v}`).join(' · ') || '—' : '—'} |`);
  }
  L.push('', '| 무엇 | 끔 | 켬 |', '|---|---|---|');
  L.push(`| 판(짝 스무 · 셈에 든 판 / 죽은 / 40분 끊은) | ${sumOff.valid} / ${sumOff.dead} / ${sumOff.cut} | ${sumOn.valid} / ${sumOn.dead} / ${sumOn.cut} |`);
  L.push(`| 집터 선 판 / 20 | ${sumOff.lot}/20 | ${sumOn.lot}/20 |`);
  L.push(`| 완공 / 20 | **${sumOff.done}/20** | **${sumOn.done}/20** |`);
  L.push(`| 집터까지 분 가운데(평균) — 집터 선 판만 | ${f(sumOff.lotMed)}(${f(sumOff.lotMean)}) | ${f(sumOn.lotMed)}(${f(sumOn.lotMean)}) |`);
  L.push(`| 완공까지 분 가운데(평균) — 완공한 판만 | ${f(sumOff.doneMed)}(${f(sumOff.doneMean)}) | ${f(sumOn.doneMed)}(${f(sumOn.doneMean)}) |`);
  L.push(`| 아홉 칸 막힘 난 판 · 막힘 합 | ${sumOff.nineRuns} · ${sumOff.nineTotal} | ${sumOn.nineRuns} · ${sumOn.nineTotal} |`);
  L.push(`| 집터 미리보기 막힌 걸음(자 글) 합 | ${sumOff.lotTries} | ${sumOn.lotTries} |`);
  L.push('', `짝으로 견줌(둘 다 집터가 선 ${pairCmp.bothLot}짝): 켬이 빠름 ${pairCmp.onFaster} · 끔이 빠름 ${pairCmp.offFaster} · 켬 − 끔 가운데 ${f(pairCmp.diffMed)}분 · 둘 다 완공 ${pairCmp.bothDone}짝 · 켬만 완공 ${pairCmp.onOnlyDone.length}(${pairCmp.onOnlyDone.join(' · ') || '—'}) · 끔만 완공 ${pairCmp.offOnlyDone.length}(${pairCmp.offOnlyDone.join(' · ') || '—'})`);
  const stageTally = (mode) => { const t = {}; for (const p of pairRows) { const x = p[mode]; if (!okRun(x) || x.m.done != null) continue; const k = x.m.lot == null ? '집터 못 섬' : (x.m.hutReach || '?'); (t[k] = t[k] || []).push(p.pid.replace(/^p\d+-/, '')); } return Object.entries(t).map(([k, v]) => `${k} ${v.length}(${v.join(' · ')})`).join(' · ') || '—'; };
  L.push('', `완공 못 한 판이 멈춘 단계 — 끔: ${stageTally('off')} | 켬: ${stageTally('on')}`);
  L.push('', `철마다 완공/판 — ${Object.entries(bySeasonPair).map(([k, s]) => `${SEASON_KO[k] || k} 끔 ${s.off.done}/${s.off.n} · 켬 ${s.on.done}/${s.on.n}`).join(' | ')}`);
  L.push('', '막힘 글(서버 거절 글 · 판마다 한 번씩 센 판 수):', '');
  L.push(`* 켬: ${noticeOn.map(([k, v]) => `"${k}" ${v}판`).join(' · ') || '—'}`);
  L.push(`* 끔: ${noticeOff.map(([k, v]) => `"${k}" ${v}판`).join(' · ') || '—'}`);
  const blkOff = runs.filter((x) => x.mode === 'off' && x.m && x.m.deedsBlk.length).map((x) => `${x.pid} ${x.m.deedsBlk.join(' / ')}`);
  const blkOn = runs.filter((x) => x.mode === 'on' && x.m && x.m.deedsBlk.length).map((x) => `${x.pid} ${x.m.deedsBlk.join(' / ')}`);
  L.push(`* 자의 늘 보던 것 밖 막힘 — 끔 ${blkOff.length}판 · 켬 ${blkOn.length}판${blkOff.length || blkOn.length ? ': ' + [...blkOff.map((s) => '끔 ' + s), ...blkOn.map((s) => '켬 ' + s)].join(' ; ') : ''}`);

  sec('③ 아홉 칸 막힘 — 어촌2 · 광산4 · 어촌7 (켬 · 마을마다 다섯 판 · 짝 켬 판 + 덧판)');
  L.push('| 판 | 마을 | 집터 | 완공 | 첫 막힌 미리보기(분) | 그 뒤 집터까지 | 자 글 아홉 칸 막힘(수 · 첫 분 · 그 뒤 집터까지) | 막힌 까닭(그 까닭이 낀 미리보기 수 · 첫 미리보기) | 거절 글 |', '|---|---|---|---|---|---|---|---|---|');
  for (const x of nineRuns) L.push(`| ${x.pid}${x.cut ? ' (끊음)' : x.dead ? ' (죽음)' : ''} | ${x.m.village} | ${f(x.m.lot)} | ${f(x.m.done)} | ${f(x.m.firstBlockMin)} | ${f(x.m.blockToLot)} | ${x.m.nine ? x.m.nine + ' · ' + x.m.nineFirst + ' · ' + f(x.m.nineToLot) : '0'} | ${Object.entries(x.m.whyAll).map(([k, v]) => `${WHY_KO[k] || k} ${v}`).join(' · ') || '—'}(첫: ${Object.entries(x.m.whyFirst).map(([k, v]) => `${WHY_KO[k] || k} ${v}`).join(' · ') || '—'}) | ${(x.m.claimNotices || []).map((s) => s.slice(0, 40)).slice(0, 2).join(' / ') || '—'} |`);
  L.push('', '| 마을 | 판 | 막힌 판 | 막는 것(그 까닭이 나온 판 수) | 첫 미리보기가 말한 것 | 첫 막힘→집터 가운데 · 가장 | 집터 가운데 | 완공 |', '|---|---|---|---|---|---|---|---|');
  for (const v of NINE_V) { const b = nineBy[v]; L.push(`| ${v} | ${b.runs} | ${b.blocked} | ${Object.entries(b.causeRuns).sort((a, c) => c[1] - a[1]).map(([k, n]) => `${WHY_KO[k] || k} ${n}`).join(' · ') || '—'} | ${Object.entries(b.causeFirst).sort((a, c) => c[1] - a[1]).map(([k, n]) => `${WHY_KO[k] || k} ${n}`).join(' · ') || '—'} | ${f(b.blockToLotMed)} · ${f(b.blockToLotMax)} | ${f(b.lotMed)} | ${b.done}/${b.runs} |`); }
  L.push('', `세 마을 합친 까닭(판 수 · ${nineRuns.length}판): ${Object.entries(nineCauseAll).sort((a, c) => c[1] - a[1]).map(([k, n]) => `${WHY_KO[k] || k} ${n}`).join(' · ') || '—'}`);

  sec('⑤ 죽은 판 · 40분 끊은 판 (표 밖 따로)');
  const deadRuns = runs.filter((x) => x.cut || x.dead);
  L.push(deadRuns.length ? deadRuns.map((x) => `* ${x.pid} ${x.mode === 'on' ? '켬' : '끔'} — ${x.cut ? '40분 넘어 끊음' : '죽음'}(rc ${f(x.rc)}${x.tries > 1 ? ' · 다시 ' + (x.tries - 1) : ''})`).join('\n') : '없음');
  const retried = runs.filter((x) => x.tries > 1 && !x.cut && !x.dead);
  L.push('', `다시 돌려 산 판: ${retried.length ? retried.map((x) => x.pid + ' ' + x.mode).join(' · ') : '없음'}`);
}
if (m7.length) {
  sec('④ `e2e-membership` ⑦');
  L.push('| 가지 | 판 | ⑦ 빨강 | ⑦b 빨강 | ⑦ 말고 빨강 | 죽은 판 | ⑦ 빨강 글 |', '|---|---|---|---|---|---|---|');
  for (const mode of ['on', 'off']) { const s = m7Sum[mode]; L.push(`| ${mode === 'on' ? '켬' : '끔'} | ${s.n} | **${s.red}/${s.valid}** | ${s.redB} | ${s.otherFail} | ${s.dead} | ${s.msgs.join(' / ') || '—'} |`); }
  if (m7ctl.length) L.push('', `덧 — 같은 판을 이름공간 · 겹침 없이 혼자 차례로(켬 ${m7ctlSum.on.n} · 끔 ${m7ctlSum.off.n}): ⑦ 빨강 켬 ${m7ctlSum.on.red}/${m7ctlSum.on.valid} · 끔 ${m7ctlSum.off.red}/${m7ctlSum.off.valid} · 죽은 판 ${m7ctlSum.on.dead + m7ctlSum.off.dead}`);
  L.push('', m7.filter((x) => x.red || x.dead || x.fail > 0).map((x) => `* ${x.name} — rc ${f(x.rc)} · PASS ${f(x.pass)} / FAIL ${f(x.fail)}${x.red ? ' · ⑦ 빨강: ' + x.msg : ''}${x.dead ? ' · 죽음' : ''}`).join('\n') || '(빨강 판 없음)');
}
const md = L.join('\n').replace(/^\n/, '') + '\n';
process.stdout.write(md);
if (MD) fs.writeFileSync(MD, md);
if (JS) fs.writeFileSync(JS, JSON.stringify({ m7ctlSum, six: sixRows, sixCount, sixWarm, seasonOld, pairs: pairRows.map((p) => ({ pid: p.pid, off: p.off && { rc: p.off.rc, cut: p.off.cut, dead: p.off.dead, m: p.off.m }, on: p.on && { rc: p.on.rc, cut: p.on.cut, dead: p.on.dead, m: p.on.m } })), sumOff, sumOn, pairCmp, bySeasonPair, noticeOn, noticeOff, nineBy, nineCauseAll, nineRuns: nineRuns.map((x) => ({ pid: x.pid, rc: x.rc, m: x.m })), m7Sum, m7 }, null, 1) + '\n');

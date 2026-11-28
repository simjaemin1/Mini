#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1475 표 · 판이 남긴 JSON 만 읽는다 · 손으로 세지 않는다)
// === scripts/t1475-table.js — 멎는 날 앞뒤의 광산5 · 임업2 · 1020 농촌18 굶은 넷 · 관찰기 무변 견줌 · 그림 석 장 [T1475 · S13 · 2026-11-24] ======
//   쓰는 법: node scripts/t1475-table.js [<판 폴더>=계측/T1475_2026-11-24] [--keep /dev/shm/t1475/keep]   → `표.md` · `요약.json` · `그림*.svg`
//   읽는 것: `<폴더>/runs/<지도>-<종류>-<시드>.{done,fp.json.gz}`(scripts/t1475-run.sh) · 관찰기 날것 `<keep>/<태그>.t1475.json.gz`(scripts/t1475-observe.js).
//   날것이 없으면 `요약.json` 으로 표 · 그림을 다시 그린다. T1456 지문 = `계측/T1456_2026-11-23/runs/new-obs-<시드>.obs.fp.json.gz`.
//   칸 뜻: 캔 주석 = 그날 마을 `dailyProductionBuf` 주석 원석(× 5 kg) · 주석 몫 = 캔 주석 ÷ (캔 주석 + 캔 구리) · 멎는 날 = 그 마을 캔 주석 > 0 인 마지막 날.
//   ⚠광부 값(주석 · 구리 · 다른 일)은 못 뜬다 — 광산5 의 `_allocEma` 가 끝까지 비어 있다(값 표가 한 번도 안 불린다 · 보고 §4). 값 칸은 싣지 않는다.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const W = require(path.join(ROOT, 'server', 'weights.js'));
const KG = W.kgOf('ore_tin');
const A = process.argv.slice(2);
const DIR = path.resolve(A.find((x, i) => !x.startsWith('--') && A[i - 1] !== '--keep') || path.join(ROOT, '계측', 'T1475_2026-11-24'));
const KEEP = A.includes('--keep') ? A[A.indexOf('--keep') + 1] : '/dev/shm/t1475/keep';
const R = path.join(DIR, 'runs'), R56 = path.join(ROOT, '계측', 'T1456_2026-11-23', 'runs');
const rdz = (p) => { try { let b = fs.readFileSync(p); if (/\.gz$/.test(p)) b = zlib.gunzipSync(b); return JSON.parse(b.toString('utf8')); } catch (e) { return null; } };
const SUMF = path.join(DIR, '요약.json');
const SUM = rdz(SUMF) || {};
const f0 = (x) => (x == null || !isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US'));
const f1 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(1));
const f2 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(2));
const f3 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(3));
const MK = { old: '옛', new: '새' };
function vCmp(Ax, Bx) {   // scripts/t1456-table.js 와 같다 — 마을 몫 `v` 만 견준다(세계 몫 `w` 는 관찰기가 onCast 를 더해 다르다)
  const m = new Map((Bx.fp || []).map((r) => [r.d, r])); let n = 0, same = 0, wd = 0, first = null;
  for (const r of Ax.fp || []) { const q = m.get(r.d); if (!q) continue; n++; if (r.v.join() === q.v.join()) same++; else if (first == null) first = r.d; if (r.w !== q.w) wd++; }
  return { n, same, first, wd };
}
function firstVillageDiff(Ax, Bx, idx) {   // 마을 하나(자리 idx)의 지문이 처음 다른 날
  const m = new Map((Bx.fp || []).map((r) => [r.d, r]));
  for (const r of Ax.fp || []) { const q = m.get(r.d); if (q && r.v[idx] !== q.v[idx]) return r.d; }
  return null;
}
const SUBJ = ['광산5', '임업2'];
const NEEDCOLS = ['N', 'miner', 'minedTin', 'minedCu', 'oreTin', 'tin', 'pTin', 'pOreTin', 'pOreCu', 'weapon', 'melee', 'bronzeS', 'stoneS', 'target', 'castTin', 'castBz', 'foodDays', 'foodStock', 'need', 'secF', 'smith', 'fdDead', 'cap'];
const TC = ['tinOut', 'tinIn', 'oreTinOut', 'oreTinIn', 'tinLegs', 'foodOutEq', 'foodInEq', 'foodInLegs', 'foodOutLegs'];

// 판 하나 → 요약(멎는 날 · 창 줄 · 1020 이면 굶은 넷 줄) — 날것이 있을 때만
function summarize(tag) {
  const r = rdz(path.join(KEEP, `${tag}.t1475.json.gz`)); if (!r || !r.day) return null;
  const C = (c) => r.cols.indexOf(c), days = Object.keys(r.day).map(Number).sort((a, b) => a - b), dN = days[days.length - 1];
  const g = (d, n, c) => { const x = r.day[d] && r.day[d][n]; return x ? x[C(c)] : null; };
  const last = {};
  for (const n of r.vils) { let l = null; for (const d of days) { const m = g(d, n, 'minedTin'); if (m > 0) l = d; } last[n] = l; }
  const stop = last['광산5'], anyStop = Math.max(...Object.values(last).filter((x) => x != null), -1);
  const lastVil = Object.entries(last).filter(([, d]) => d === anyStop).map(([n]) => n)[0] || null;
  const S = tag.startsWith('new') ? stop : anyStop;   // 새 지도 = 광산5 · 옛 지도 = 추적 마을 가운데 가장 늦게 캔 마을(T1456: 옛 지도는 광산4 · 어촌1 · 광산5 가 처음 240날 남짓)
  const subj = [...new Set([...SUBJ, ...(lastVil && !SUBJ.includes(lastVil) && !tag.startsWith('new') ? [lastVil] : [])])];
  const row = (d, n) => { const o = { d }; for (const c of NEEDCOLS) o[c] = g(d, n, c); const t = r.trade[d + 1] && r.trade[d + 1][n]; o.trade = t ? t.map((x) => +x.toFixed(2)) : null; return o; };
  const out = { tag, dN, last, stop, anyStop, lastVil, S, subj, mix: r.mix['광산5'] || null, err: r.err, win: {}, c3: {}, fd: {}, ser: {} };
  if (S != null) for (const n of subj) { out.win[n] = []; for (let d = Math.max(days[0], S - 60); d <= Math.min(dN, S + 30); d++) if (r.day[d] && r.day[d][n]) out.win[n].push(row(d, n)); }
  if (r.vils.includes('광산5')) out.c3['광산5'] = days.filter((d) => d >= 200 && d <= 260 && r.day[d]['광산5']).map((d) => row(d, '광산5'));
  for (const n of ['농촌18', '어촌5', '농촌10', '어촌14']) out.fd[n] = days.filter((d) => d >= 296 && d <= 373 && r.day[d] && r.day[d][n]).map((d) => row(d, n));
  for (const n of ['농촌18', '어촌5', '농촌10', '어촌14']) out.ser[n] = days.filter((d) => d <= 400 && r.day[d] && r.day[d][n]).map((d) => { const t = r.trade[d + 1] && r.trade[d + 1][n]; return [d, g(d, n, 'N'), g(d, n, 'foodDays'), g(d, n, 'foodStock'), g(d, n, 'fdDead'), t ? +t[6].toFixed(2) : 0, t ? t[7] : 0]; });
  return out;
}
const TAGS = ['new-obs-7', 'new-obs-42', 'old-obs-7', 'old-obs-42', 'new-obs-1020', 'old-obs-1020'];
for (const t of TAGS) { const s = summarize(t); if (s) SUM[t] = s; }

// 지문 견줌(관찰기 무변)
const fpOf = (tag) => rdz(path.join(R, `${tag}.fp.json.gz`));
SUM.nochange = SUM.nochange || {};
for (const sd of ['7', '42']) {
  const a = fpOf(`new-obs-${sd}`), b = rdz(path.join(R56, `new-obs-${sd}.obs.fp.json.gz`));
  if (a && b) SUM.nochange[`new-obs-${sd}`] = vCmp(a, b);
}
{ const a = fpOf('new-obs-1020'), b = fpOf('new-ctl-1020'); if (a && b) SUM.nochange['new-obs-1020'] = vCmp(a, b); }
{
  const a = fpOf('new-obs-1020'), b = fpOf('old-obs-1020'), nm = SUM['new-obs-1020'] && rdz(path.join(KEEP, 'new-obs-1020.t1475.json.gz')).names;
  if (a && b && nm) { SUM.diverge = {}; for (const n of ['농촌18', '어촌5', '농촌10', '어촌14', '광산5']) SUM.diverge[n] = firstVillageDiff(a, b, nm.indexOf(n)); }
}
fs.writeFileSync(SUMF, JSON.stringify(SUM));

// ---------- 표 ----------
const out = [];
const T = (h, rows) => { out.push('| ' + h.join(' | ') + ' |', '|' + h.map(() => '---').join('|') + '|'); for (const r of rows) out.push('| ' + r.join(' | ') + ' |'); out.push(''); };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sel = (rows, lo, hi) => rows.filter((r) => r.d >= lo && r.d <= hi);
const sh = (r) => (r.minedTin + r.minedCu > 0 ? r.minedTin / (r.minedTin + r.minedCu) : null);
out.push('# T1475 — 멎는 날 앞뒤의 광산5 · 1020 농촌18 굶은 넷', '');

// ① 멎는 날
out.push('## ① 멎는 날(마을마다 캔 주석 > 0 인 마지막 날)', '');
{
  const rows = [];
  for (const t of ['new-obs-7', 'new-obs-42', 'old-obs-7', 'old-obs-42', 'new-obs-1020', 'old-obs-1020']) {
    const s = SUM[t]; if (!s) { rows.push([t, '안 돎']); continue; }
    rows.push([t.replace('new', '새').replace('old', '옛').replace('-obs-', ' · 시드 '), `${f0(s.dN)}날`, Object.entries(s.last).filter(([, d]) => d != null).map(([n, d]) => `${n} ${d}`).join(' · ') || '없음', s.S == null ? '—' : `${s.S}(${s.tag.startsWith('new') ? '광산5' : s.lastVil})`]);
  }
  T(['판', '길이', '마을별 마지막 캔 날(추적 아홉 마을)', '이 표의 멎는 날 S(새 = 광산5 · 옛 = 가장 늦게 캔 마을)'], rows);
}

// ② 창 표
const OFFS = [-60, -50, -40, -30, -20, -10, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 10, 20, 30];
function winTable(tag, vil) {
  const s = SUM[tag]; if (!s || !s.win[vil]) return;
  const m = new Map(s.win[vil].map((r) => [r.d - s.S, r]));
  out.push(`### ${tag.replace('new', '새').replace('old', '옛').replace('-obs-', ' · 시드 ')} — ${vil}(S = ${s.S})`, '');
  const rows = [];
  for (const o of OFFS) {
    const r = m.get(o); if (!r) continue; const tr = r.trade || [];
    rows.push([(o > 0 ? '+' : '') + o, f0(r.N), f0(r.miner), r.minedTin + r.minedCu > 0 ? f0(100 * sh(r)) + ' %' : '—', f1(r.minedTin * KG), f2(r.oreTin), f2(r.tin), f3(r.pTin), f3(r.pOreTin),
      `${f1(r.stoneS)} · ${f1(r.bronzeS)} / ${f1(r.target)}`, f3(r.castTin), `${f1(tr[4] || 0)}줄 · 나감 ${f1(tr[0])} · 들어옴 ${f1(tr[1])}`, f1(r.foodDays), r.need || '—']);
  }
  T(['S 기준 날', '인구', '광부', '주석 몫', '캔 주석 원석 kg', '주석 원석', '주석', '주석 시세', '원석 주석 시세', '병기고 석검 · 청동검 / 목표', '부은 주석', '주석 짐(줄 · 양)', '식량 날치', '고르는 자의 모자란 일'], rows);
}
out.push('## ② 멎는 날 −60 ~ +30 (날마다 뜬 것을 표본: −60 · 10날 간격 · ±5날은 날마다 · +10 · +20 · +30)', '',
  '값 칸 없음: 광산5 의 값 표(`_allocEma`)는 끝까지 비어 있다(§4). 표의 "고르는 자의 모자란 일" = 그 마을 가장 최근 전환일에 안전망 · 피커가 낸 모자란 일(`_dbgSwitch.need`) · 주석 시세 = 곳간 가격 캐시 `tin` · 원석 주석 = `ore_tin`. 병기고 목표 = 인구 × 0.72(t1385 와 같은 셈).', '');
for (const t of ['new-obs-7', 'new-obs-42']) for (const v of SUBJ) winTable(t, v);
for (const t of ['old-obs-7', 'old-obs-42']) { const s = SUM[t]; if (s) for (const v of s.subj) winTable(t, v); }

// ③ 후보 다섯
out.push('## ③ 후보 다섯 — 수로 가른다', '');
const verdicts = {};
function cand(tag) {
  const s = SUM[tag]; if (!s || s.S == null) return null;
  const sv = s.tag.startsWith('new') ? '광산5' : (s.lastVil || '광산5'), w = s.win[sv] || [], S = s.S;
  const pre = sel(w.map((r) => ({ ...r, d: r.d - S })), -30, 0), post = sel(w.map((r) => ({ ...r, d: r.d - S })), 1, 30), pre5 = sel(w.map((r) => ({ ...r, d: r.d - S })), -5, 0);
  const mP = mean(pre.map((r) => r.miner)), mQ = mean(post.map((r) => r.miner)), minPost = Math.min(...post.map((r) => r.miner));
  const tinP = mean(pre.map((r) => r.minedTin * KG)), tinQ = mean(post.map((r) => r.minedTin * KG)), cuP = mean(pre.map((r) => r.minedCu * KG)), cuQ = mean(post.map((r) => r.minedCu * KG));
  const shP = tinP + cuP > 0 ? tinP / (tinP + cuP) : null, shQ = tinQ + cuQ > 0 ? tinQ / (tinQ + cuQ) : null;
  const castP = pre.reduce((a, r) => a + r.castTin, 0), minedP = pre.reduce((a, r) => a + r.minedTin, 0);
  const full = mean(sel(w.map((r) => ({ ...r, d: r.d - S })), -5, 5).map((r) => (r.stoneS + r.bronzeS) / r.target));
  const fdMin = Math.min(...pre.concat(post).map((r) => r.foodDays)), nMin = Math.min(...pre.concat(post).map((r) => r.N)), minerMax = Math.max(...pre.concat(post).map((r) => r.miner));
  const at = w.find((r) => r.d === S) || {};
  const pS = mean(pre.map((r) => r.pTin)), pQ = mean(post.map((r) => r.pTin)), poP = mean(pre.map((r) => r.pOreTin)), poQ = mean(post.map((r) => r.pOreTin));
  const needs = {}; for (const r of post) needs[r.need] = (needs[r.need] || 0) + 1;
  const a = !(minPost > 0), b = minPost > 0 && (shQ == null || shQ < 0.02) && (shP != null && shP > 0.05), c = castP < 0.25 * minedP, d = full >= 1;
  const e = mQ != null && mP != null && mQ < mP - 0.5;
  const o = { c, cap: mean(pre.concat(post).map((r) => r.cap)), smithAt: at.smith, tag, sv, S, miP: mP, miQ: mQ, minPost, tinP, tinQ, cuP, cuQ, shP, shQ, castP, minedP, full, fdMin, nMin, minerMax, tinStock: at.tin, oreStock: at.oreTin, pS, pQ, poP, poQ, needs, a, b, d, e, atN: at.N, atTarget: at.target, atArsenal: (at.stoneS || 0) + (at.bronzeS || 0) };
  verdicts[tag] = o; return o;
}
{
  const rows = [], lines = [];
  for (const t of ['new-obs-7', 'new-obs-42', 'old-obs-7', 'old-obs-42']) {
    const o = cand(t); if (!o) { rows.push([t, '안 돎']); continue; }
    const yn = (x) => (x ? '예' : '아니오');
    rows.push([t.replace('new', '새').replace('old', '옛').replace('-obs-', ' · '), `${o.sv} S ${o.S}`,
      `${yn(o.a)} — 광부 S−30~S ${f1(o.miP)} → S+1~+30 ${f1(o.miQ)}(가장 적은 날 ${o.minPost})`,
      `${yn(o.b)} — 캔 것 가운데 주석 몫 ${o.shP == null ? '—' : f0(100 * o.shP) + ' %'} → ${o.shQ == null ? '—' : f0(100 * o.shQ) + ' %'}(주석 ${f2(o.tinP)} → ${f2(o.tinQ)} kg/날 · 구리 ${f2(o.cuP)} → ${f2(o.cuQ)} kg/날)`,
      `${yn(o.c)} — 부은 주석 S−30~S 합 ${f3(o.castP)} ↔ 캔 주석 원석 합 ${f2(o.minedP)} · S 날 곳간 주석 ${f1(o.tinStock)} · 원석 ${f2(o.oreStock)} · 청동 만들 수 있음(cap) ${f2(o.cap)} · 대장장이 ${o.smithAt}`,
      `${yn(o.d)} — 석검 + 청동검 ÷ 목표 = ${f2(o.full)}(S±5 평균 · ${f1(o.atArsenal)}/${f1(o.atTarget)})`,
      `${yn(o.e)} — 광부 가장 많이 ${o.minerMax} · 식량 날치 가장 낮게 ${f1(o.fdMin)} · 고르는 자의 모자란 일 ${Object.entries(o.needs).map(([k, v]) => `${k} ${v}`).join(' · ')}(S+1~+30 날 수)`]);
  }
  T(['판', '마을', '(가) 광부 → 0 ?', '(나) 광부 > 0 인데 주석 몫 0 ?', '(다) 캐는데 안 붓나(부은 < 캔의 1/4)', '(라) 병기고가 차서 값 0 ?', '(마) 다른 일이 올라 밀렸나(광부가 줄었나)'], rows);
  const lab = (o) => `${o.tag.replace('new-obs-', '새 ').replace('old-obs-', '옛 ')}: ${o.a ? '광부가 0 이 됐다' : '광부는 남았다(' + f1(o.miP) + ' → ' + f1(o.miQ) + ')'}${!o.a && o.b ? ' · 주석 몫만 ' + f0(100 * o.shP) + ' → ' + f0(100 * o.shQ) + ' % 로 0' : ''} · 병기고 ${f2(o.full)} 찬 것(${o.d ? '참' : '안 참'}) · 광부가 안 줄었으니 밀려난 사람 ${o.e ? '있음' : '0'} · 주석 시세 ${f3(o.pS)} → ${f3(o.pQ)}`;
  out.push('**한 줄 답(판마다)**', '');
  for (const t of ['new-obs-7', 'new-obs-42', 'old-obs-7', 'old-obs-42']) if (verdicts[t]) out.push('* ' + lab(verdicts[t]));
  out.push('');
}
SUM.verdicts = verdicts; fs.writeFileSync(SUMF, JSON.stringify(SUM));

// ④ 1020
out.push('## ④ 1020 — 광산5 날 200 ~ 260(새 · 옛)', '');
{
  const rows = [];
  for (const tag of ['new-obs-1020', 'old-obs-1020']) { const s = SUM[tag]; if (!s || !s.c3['광산5']) continue; for (const r of s.c3['광산5']) if ((r.d - 200) % 10 === 0 || (r.d >= 230 && r.d <= 236 && tag.startsWith('new'))) rows.push([tag.startsWith('new') ? '새' : '옛', r.d, f0(r.N), f0(r.miner), f1(r.minedTin * KG), f2(r.oreTin), f2(r.tin), f3(r.pTin), `${f1(r.stoneS)} · ${f1(r.bronzeS)} / ${f1(r.target)}`, f1(r.foodDays), r.need || '—']); }
  T(['지도', '날', '인구', '광부', '캔 주석 원석 kg', '주석 원석', '주석', '주석 시세', '병기고 석검 · 청동검 / 목표', '식량 날치', '모자란 일'], rows);
  const s = SUM['new-obs-1020'], o = SUM['old-obs-1020'];
  if (s && o) out.push(`1020 광산5 마지막으로 주석 캔 날: 새 ${s.last['광산5']} · 옛 ${o.last['광산5']} · 그 밖 추적 마을 옛 ${Object.entries(o.last).filter(([n, d]) => d != null && n !== '광산5').map(([n, d]) => n + ' ' + d).join(' · ') || '없음'}.`, '');
}
out.push('## ⑤ 1020 농촌18 · 어촌5 · 농촌10 · 어촌14 — 날 300 ~ 372 식량(날치 = 곳간 식량 환산 ÷ 인구 · 곳간 · 인구 · 굶어 죽음 누계 · 교역으로 들어온 먹을 것(식량 환산) · 줄 수), 새 | 옛', '');
{
  const nw = SUM['new-obs-1020'], od = SUM['old-obs-1020'];
  if (nw && od) for (const n of ['농촌18', '어촌5', '농촌10', '어촌14']) {
    out.push(`### ${n}`, '');
    const rows = [], mk = (s, d) => { const r = (s.fd[n] || []).find((x) => x.d === d); if (!r) return ['—', '—', '—', '—', '—']; const t = r.trade || []; return [f1(r.foodDays), f1(r.foodStock), f0(r.N), f0(r.fdDead), `${f1(t[6] || 0)} · ${t[7] || 0}줄`]; };
    for (let d = 300; d <= 372; d++) if (d % 6 === 0 || d >= 366) rows.push([d, ...mk(nw, d), ...mk(od, d)]);
    T(['날', '새 식량 날치', '새 곳간', '새 인구', '새 죽음 누계', '새 들어온 먹을 것', '옛 식량 날치', '옛 곳간', '옛 인구', '옛 죽음 누계', '옛 들어온 먹을 것'], rows);
  }
  if (SUM.diverge) out.push('마을 지문(마을 몫 해시)이 새 ↔ 옛에서 처음 다른 날: ' + Object.entries(SUM.diverge).map(([n, d]) => `${n} ${d == null ? '400날 안 갈림 없음' : d}`).join(' · '), '');
  // 갈라진 첫 날 — 날마다(1 ~ 400) 새 ↔ 옛 시계열(인구 · 곳간 · 들어온 먹을 것)에서
  if (nw && od) {
    SUM.div2 = {}; out.push('### 갈라진 첫 날 · 끊긴 날(날마다 1 ~ 400 시계열에서 센 것)', '');
    const rows = [];
    for (const n of ['농촌18', '어촌5', '농촌10', '어촌14']) {
      const a = Object.fromEntries((nw.ser[n] || []).map((r) => [r[0], r])), b = Object.fromEntries((od.ser[n] || []).map((r) => [r[0], r]));
      const first = (f) => { for (let d = 1; d <= 400; d++) if (a[d] && b[d] && f(a[d], b[d])) return d; return null; };
      const lastIn = (m) => { let l = null; for (let d = 1; d <= 400; d++) if (m[d] && m[d][5] > 0) l = d; return l; };
      const stk0 = (m, lo) => { for (let d = lo; d <= 400; d++) if (m[d] && m[d][3] < 1) return d; return null; };
      const dead1 = (m) => { for (let d = 1; d <= 400; d++) if (m[d] && m[d][4] > 0) return d; return null; };
      const cum = (m, d0) => { let c = 0; for (let d = 1; d <= d0; d++) if (m[d]) c += m[d][5]; return c; };
      const o = { 인구가다른첫날: first((x, y) => x[1] !== y[1]), 곳간이다른첫날: first((x, y) => Math.abs(x[3] - y[3]) > 1e-6), 들어옴이다른첫날: first((x, y) => Math.abs(x[5] - y[5]) > 1e-6), 새_마지막으로_들어온날: lastIn(a), 옛_마지막으로_들어온날: lastIn(b),
        새_곳간0_첫날: stk0(a, 100), 옛_곳간0_첫날: stk0(b, 100), 새_첫_굶어죽음: dead1(a), 옛_첫_굶어죽음: dead1(b), 새_들어온누계_날300: cum(a, 300), 옛_들어온누계_날300: cum(b, 300), 새_마지막날: Math.max(...Object.keys(a).map(Number)), 새_마지막인구: a[Math.max(...Object.keys(a).map(Number))][1] };
      SUM.div2[n] = o;
      rows.push([n, o.인구가다른첫날, o.곳간이다른첫날, o.들어옴이다른첫날, `${o.새_마지막으로_들어온날} / ${o.옛_마지막으로_들어온날}`, `${o.새_곳간0_첫날} / ${o.옛_곳간0_첫날}`, `${o.새_첫_굶어죽음} / ${o.옛_첫_굶어죽음}`, `${f0(o.새_들어온누계_날300)} / ${f0(o.옛_들어온누계_날300)}`, `${o.새_마지막날}(인구 ${o.새_마지막인구})`]);
    }
    T(['마을', '인구가 처음 다른 날', '곳간이 처음 다른 날', '들어온 먹을 것이 처음 다른 날', '마지막으로 먹을 것이 들어온 날 새 / 옛', '곳간 0 첫 날(날 100 뒤) 새 / 옛', '첫 굶어 죽음 새 / 옛', '들어온 먹을 것 누계(날 300) 새 / 옛', '새 마지막 날'], rows);
  }
}
// ⑥ 무변
out.push('## ⑥ 관찰기가 세계를 바꾸지 않는가(마을 몫 해시 `v` — 51 마을 통째 · 세계 몫 `w` 는 관찰기가 onCast 를 더해 다르다)', '');
{
  const rows = [];
  const nc = SUM.nochange || {};
  for (const sd of ['7', '42']) { const c = nc[`new-obs-${sd}`]; rows.push([`새 · 시드 ${sd} · t1475 관찰기 판(1,801 ~ 1,900) ↔ T1456 관찰기 판`, c ? `${c.same}/${c.n}${c.first != null ? ' · 첫 갈림 ' + c.first : ''} · 세계 몫 다른 날 ${c.wd}` : '—']); }
  { const c = nc['new-obs-1020']; rows.push(['새 · 시드 1020 · t1475 관찰기 판(1 ~ 400) ↔ t1475 뺀 판(같은 400날)', c ? `${c.same}/${c.n}${c.first != null ? ' · 첫 갈림 ' + c.first : ''} · 세계 몫 다른 날 ${c.wd}` : '—']); }
  T(['견줌', '마을 지문 같은 날 / 견준 날'], rows);
  out.push('저장본에서 이어 돈 판: 이 카드에선 저장본을 안 만들었다 — T1456 보고의 되살림 100/100 × 세 시드를 인용(§0).', '');
}
fs.writeFileSync(path.join(DIR, '표.md'), out.join('\n'));
fs.writeFileSync(SUMF, JSON.stringify(SUM));

// ---------- 그림(SVG · 새 의존 0) ----------
const PAL = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#555555'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function panel(o) {   // o = {x,y,w,h,title,series:[{name,pts:[[x,y]],color,step,dash}],xlab,ylab,vline}
  const { x, y, w, h } = o, ml = 46, mb = 22, mt = 20, pw = w - ml - 8, ph = h - mt - mb;
  let xs = [], ys = [];
  for (const s of o.series) for (const p of s.pts) { if (p[1] != null && isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); } }
  if (!xs.length) return `<text x="${x}" y="${y + 14}" font-size="12">${esc(o.title)} — 자료 없음</text>`;
  const x0 = o.x0 != null ? o.x0 : Math.min(...xs), x1 = o.x1 != null ? o.x1 : Math.max(...xs); let y0 = o.y0 != null ? o.y0 : Math.min(0, ...ys), y1 = o.y1 != null ? o.y1 : Math.max(...ys) * 1.08 || 1;
  if (y1 === y0) y1 = y0 + 1;
  const X = (v) => x + ml + (v - x0) / (x1 - x0 || 1) * pw, Y = (v) => y + mt + ph - (v - y0) / (y1 - y0) * ph;
  let g = `<text x="${x}" y="${y + 12}" font-size="12" font-weight="600">${esc(o.title)}</text>`;
  g += `<rect x="${x + ml}" y="${y + mt}" width="${pw}" height="${ph}" fill="none" stroke="#bbb"/>`;
  for (let k = 0; k <= 3; k++) { const v = y0 + (y1 - y0) * k / 3; g += `<line x1="${x + ml}" x2="${x + ml + pw}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eee"/><text x="${x + ml - 4}" y="${Y(v) + 3}" font-size="10" text-anchor="end">${+v.toPrecision(3)}</text>`; }
  for (let k = 0; k <= 4; k++) { const v = Math.round(x0 + (x1 - x0) * k / 4); g += `<text x="${X(v)}" y="${y + h - 8}" font-size="10" text-anchor="middle">${v}</text>`; }
  if (o.vline != null) g += `<line x1="${X(o.vline)}" x2="${X(o.vline)}" y1="${y + mt}" y2="${y + mt + ph}" stroke="#999" stroke-dasharray="4 3"/>`;
  o.series.forEach((s, i) => {
    const c = s.color || PAL[i % PAL.length]; let d = '', prev = null;
    for (const p of s.pts) { if (p[1] == null || !isFinite(p[1])) { prev = null; continue; } d += prev == null ? `M${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}` : (s.step ? `H${X(p[0]).toFixed(1)}V${Y(p[1]).toFixed(1)}` : `L${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`); prev = p; }
    g += `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.6"${s.dash ? ' stroke-dasharray="5 3"' : ''}/>`;
    g += `<text x="${x + ml + 6 + i * 118}" y="${y + mt + 11}" font-size="10" fill="${c}">${esc(s.name)}</text>`;
  });
  return g;
}
function svg(file, W_, H_, title, body) {
  fs.writeFileSync(path.join(DIR, file), `<svg xmlns="http://www.w3.org/2000/svg" width="${W_}" height="${H_}" viewBox="0 0 ${W_} ${H_}" font-family="sans-serif"><rect width="100%" height="100%" fill="#fff"/><text x="12" y="18" font-size="14" font-weight="700">${esc(title)}</text>${body}</svg>`);
}
const rel = (rows, S, c, k) => rows.map((r) => [r.d - S, k ? r[c] * k : r[c]]);
function fig1() {   // 멎는 날 앞뒤 광산5 — 광부 · 캔 주석 · 캔 구리 · 주석 시세
  let body = '', col = 0;
  const tags = ['new-obs-7', 'new-obs-42'];
  tags.forEach((t, ci) => {
    const s = SUM[t]; if (!s || !s.win['광산5']) return; const w = s.win['광산5'], S = s.S, X0 = 12 + ci * 560;
    const sm = (rows, c, k) => rows.map((r, i) => { const a = rows.slice(Math.max(0, i - 4), i + 1); return [r.d - S, a.reduce((p, q) => p + q[c] * (k || 1), 0) / a.length]; });
    body += panel({ x: X0, y: 30, w: 540, h: 150, title: `새 · 시드 ${t.split('-')[2]} — 광산5 광부 수(멎는 날 ${S} = 0)`, series: [{ name: '광부', pts: rel(w, S, 'miner'), step: true }], x0: -60, x1: 30, y0: 0, vline: 0 });
    body += panel({ x: X0, y: 190, w: 540, h: 170, title: '캔 원석 kg/날(5날 이동평균)', series: [{ name: '주석', pts: sm(w, 'minedTin', KG) }, { name: '구리', pts: sm(w, 'minedCu', KG), color: PAL[1] }], x0: -60, x1: 30, vline: 0 });
    body += panel({ x: X0, y: 370, w: 540, h: 150, title: '시세(곳간 가격 캐시)', series: [{ name: '주석', pts: rel(w, S, 'pTin') }, { name: '원석 주석', pts: rel(w, S, 'pOreTin'), color: PAL[2] }, { name: '원석 구리', pts: rel(w, S, 'pOreCu'), color: PAL[3], dash: true }], x0: -60, x1: 30, vline: 0 });
  });
  svg('그림1_멎는날_광부_캔주석_시세.svg', 1132, 535, 'T1475 그림 1 — 광산5: 멎는 날 앞뒤 광부 · 캔 주석 · 시세 (x = 멎는 날 기준 날수)', body);
}
function fig2() {   // 곳간 · 병기고
  let body = '';
  ['new-obs-7', 'new-obs-42'].forEach((t, ci) => {
    const s = SUM[t]; if (!s || !s.win['광산5']) return; const w = s.win['광산5'], S = s.S, X0 = 12 + ci * 560, wi = s.win['임업2'] || [];
    body += panel({ x: X0, y: 30, w: 540, h: 170, title: `새 · 시드 ${t.split('-')[2]} — 광산5 곳간: 주석 · 주석 원석`, series: [{ name: '주석', pts: rel(w, S, 'tin') }, { name: '주석 원석', pts: rel(w, S, 'oreTin'), color: PAL[1] }], x0: -60, x1: 30, vline: 0 });
    body += panel({ x: X0, y: 210, w: 540, h: 170, title: '광산5 병기고: 석검 + 청동검 ↔ 목표(인구×0.72)', series: [{ name: '석+청동검', pts: w.map((r) => [r.d - S, r.stoneS + r.bronzeS]) }, { name: '청동검', pts: rel(w, S, 'bronzeS'), color: PAL[2] }, { name: '목표', pts: rel(w, S, 'target'), color: PAL[4], dash: true }], x0: -60, x1: 30, y0: 0, vline: 0 });
    body += panel({ x: X0, y: 390, w: 540, h: 150, title: '임업2 곳간: 주석 (캔 적 0)', series: [{ name: '주석', pts: rel(wi, S, 'tin') }], x0: -60, x1: 30, vline: 0 });
  });
  svg('그림2_곳간_병기고.svg', 1132, 555, 'T1475 그림 2 — 곳간의 주석 · 병기고 (x = 멎는 날 기준 날수)', body);
}
function fig3() {   // 1020 굶은 넷
  const nw = SUM['new-obs-1020'], od = SUM['old-obs-1020']; if (!nw || !od) return;
  let body = ''; ['농촌18', '어촌5', '농촌10', '어촌14'].forEach((n, i) => {
    const X0 = 12 + (i % 2) * 560, Y0 = 30 + Math.floor(i / 2) * 200, ser = (s, c, nm, color, dash) => ({ name: nm, color, dash, pts: (s.fd[n] || []).map((r) => [r.d, r[c]]) });
    body += panel({ x: X0, y: Y0, w: 540, h: 190, title: `${n} — 식량 날치(곳간 환산 ÷ 인구)`, series: [ser(nw, 'foodDays', '새', PAL[0]), ser(od, 'foodDays', '옛', PAL[1], true)], x0: 300, x1: 372, y0: 0 });
  });
  svg('그림3_1020_굶은_넷_식량.svg', 1132, 430, 'T1475 그림 3 — 1020 농촌18 · 어촌5 · 농촌10 · 어촌14 날 300 ~ 372 (새 ↔ 옛)', body);
}
fig1(); fig2(); fig3();
console.log('표 · 요약 · 그림 씀', DIR);

#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1436 표 자 · 판 폴더만 읽는다 · 판정 0)
// === scripts/t1436-table.js — 한 번에 돈 판 ↔ 날마다(또는 때를 바꿔) 다시 뜬 판을 **날마다** 견준다 · 부팅 초 · RSS 표 ===
//   node scripts/t1436-table.js --out <폴더> --pair 이름=<기준 폴더>,<견줄 폴더>[,<무리 이름>] … [--boot 이름=<폴더> …] [--inert 이름=<기준>,<견줄>]
//   폴더 = `t1436-run.js`(= `t1308-long-run.js`) 판 폴더. 읽는 것(기존 관찰기 출력 · 묶은 것): `<태그>-<시드>.json.t650.json`(econ 날 지문 · 마을마다 인구) ·
//     `<태그>-<시드>.json.t740.json`(마을 칸 지문 — 칸마다 마을 수 × 6자) · `<태그>-<시드>.t1308b.json`(몸 자리) · `progress.json`(마디) · `t1436-boot.json`(부팅 초 · RSS).
//   날마다: econ 같음(지문 = t1308-cmp 와 같은 빼기: ms · sites · cnt) · 갈린 econ 마을 수 · 인구 A : B · 마을 칸 같음 · 갈린 칸 수 · 갈린 마을 수 · 몸 자리 같음.
//   "같은 날" = 넷(econ · 인구 · 마을 칸 · 몸 자리) 다 같음.
//   갈린 칸 분류(글자 규칙 — 판정 아님): 저장 키 = `server/villages.js` 의 `_T740_KEYS` ∪ `_T1340_VKEYS` ∪ `_t728Restore` 가 되돌리는 칸 ∪ {`_site` · `_psite`}(읽기만 · 글자에서 뽑는다).
//     저장 키 없음 = 칸이 저장 키 밖 · 첫 틱 다시 셈 = 저장 키인데 그 판의 첫 갈림 날에 이미 갈림(저장되지만 다시 뜬 뒤 새로 선다) · 모름 = 저장 키이고 늦게 갈림(번짐일 수도).
//     주인 후보(이름 규칙): 몸 pid · 인구 · 기타직 순번 · 교역로 칸 · 사냥 부존 장부 칸 → T1382 · `_T1340_VKEYS` → T1308 · `_T740_KEYS` → T742 · 손 · 둔 몫 → T1416 · 그 밖(저장 밖 메모리) → T742 · 몸 자리 층 → T747.
//   ⇒ <out>/table.md · table.json · <이름>.days.jsonl.gz(날 줄)
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const OUT = path.resolve(A[A.indexOf('--out') + 1]);
const many = (k) => A.map((x, i) => (x === '--' + k ? A[i + 1] : null)).filter(Boolean).map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1).split(',')]; });
const PAIRS = many('pair'), BOOTS = many('boot'), INERTS = many('inert');
fs.mkdirSync(OUT, { recursive: true });

const S = (x) => JSON.stringify(x);
//   묶은 파일이 없으면(판이 끝 마디 앞에서 멈춤 — 예: 밤 판) 마디 조각(`seg-<날>.…`)을 날 열쇠로 잇는다(앞 마디가 먼저 · long-run merge 와 같은 규칙)
const segNums = (d) => fs.readdirSync(d).map((x) => x.match(/^seg-(\d+)\.log$/)).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b);
const find = (d, re) => {
  const f = fs.readdirSync(d).filter((x) => !x.startsWith('seg-') && re.test(x)); if (f.length) return JSON.parse(fs.readFileSync(path.join(d, f[0]), 'utf8'));
  const days = [], seen = new Set();
  for (const n of segNums(d)) { const g = fs.readdirSync(d).filter((x) => x.startsWith(`seg-${n}.`) && re.test(x)); if (!g.length) continue;
    let o; try { o = JSON.parse(fs.readFileSync(path.join(d, g[0]), 'utf8')); } catch (e) { continue; }
    for (const r of o.days || []) if (r && !seen.has(r.d)) { seen.add(r.d); days.push(r); } }
  return days.length ? { days, fromSegs: true } : null;
};
function load(d) {
  const e = find(d, /\.json\.t650\.json$/), s = find(d, /\.json\.t740\.json$/), b = find(d, /\.t1308b\.json$/);
  let p = null; try { p = JSON.parse(fs.readFileSync(path.join(d, 'progress.json'), 'utf8')); } catch (x) {}
  const by = (arr) => { const m = new Map(); for (const r of arr || []) m.set(r.d, r); return m; };
  return { e: by(e && e.days), s: by(s && s.days), b: by(b && b.days), p, dir: d };
}
const econKey = (r) => { const o = Object.assign({}, r); delete o.ms; delete o.sites; delete o.cnt; return o; };
const popOf = (r) => (r && Array.isArray(r.vil) ? r.vil.reduce((a, v) => a + (+v[2] || 0), 0) : null);

// 저장 키 — 제품 글자에서 읽기만
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
function arr(name) { const m = VSRC.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`)); return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []; }
const K740 = new Set(arr('_T740_KEYS')), K1340 = new Set(arr('_T1340_VKEYS'));
//   T728 곁 칸이 부팅에 되돌리는 칸(`_t728Restore` 몸통의 `vil.<칸> =` — 광맥 바탕 · 사냥 부존 장부 `_t728Game`)
const K728 = (() => { const i = VSRC.indexOf('function _t728Restore()'); if (i < 0) return new Set(); const j = VSRC.indexOf('\nfunction ', i + 10); return new Set([...VSRC.slice(i, j).matchAll(/\bvil\.(_?\w+)\s*=(?!=)/g)].map((m) => m[1])); })();
const SAVE = new Set([...K740, ...K1340, ...K728, '_site', '_psite']);
const OWN_1382 = /^(npcPids|pop|_otIdx|_otIdxDay|route|_route|dist|_dist|_t1382|_game|_baseGame|_site$)/;   // 사냥 부존 장부 칸(T728 곁 칸)은 몸 세계(T1331 짐승 몸 켬)에서만 갈렸다 · 집터 `_site` 건물 행 번호(`bo`)는 T1382 ㉣ 이 "번호만 · 무해"로 둔 자리 → 몸 세계 재기동 카드
const OWN_1416 = /(_t717|_t733F|inventory|_bag|_lots|_stash|_t1416|_t1402)/;
function owner(k) {
  if (OWN_1382.test(k)) return 'T1382';
  if (OWN_1416.test(k)) return 'T1416';
  if (K1340.has(k)) return 'T1308';
  if (K740.has(k)) return 'T742';
  return 'T742';
}

function cmpPair(name, da, db) {
  const X = load(da), Y = load(db);
  const days = [...X.e.keys()].filter((d) => Y.e.has(d)).sort((a, b) => a - b);
  const rows = [], F = {};
  let first = null, firstE = null, firstS = null, firstB = null, firstP = null, econParts = null;
  for (const d of days) {
    const ea = X.e.get(d), eb = Y.e.get(d);
    const eSame = S(econKey(ea)) === S(econKey(eb));
    const vb = new Map((eb.vil || []).map((v) => [v[0], S(v)]));
    const vilE = (ea.vil || []).filter((v) => vb.get(v[0]) !== S(v)).length + Math.max(0, (eb.vil || []).length - (ea.vil || []).length);
    const pa = popOf(ea), pb = popOf(eb);
    const sa = X.s.get(d), sb = Y.s.get(d);
    let sSame = null, nF = null, vilS = null; const fl = [];
    if (sa && sb) {
      const vs = new Set(); nF = 0;
      for (const k of new Set(Object.keys(sa.f).concat(Object.keys(sb.f)))) {
        const x = sa.f[k] || '', y = sb.f[k] || '';
        if (x === y) continue;
        nF++; fl.push(k); F[k] = F[k] || { first: d, days: 0 }; F[k].days++;
        for (let i = 0; i < Math.max(x.length, y.length); i += 6) if (x.slice(i, i + 6) !== y.slice(i, i + 6)) vs.add(i / 6);
      }
      sSame = nF === 0; vilS = vs.size;
    }
    const ba = X.b.get(d), bb = Y.b.get(d);
    const bSame = ba && bb ? (ba.n === bb.n && ba.h === bb.h) : null;
    const all = eSame && pa === pb && sSame !== false && bSame !== false;
    if (!all && first == null) first = d;
    if (!eSame && firstE == null) { firstE = d; econParts = Object.keys(Object.assign({}, econKey(ea), econKey(eb))).filter((k) => S(ea[k]) !== S(eb[k])); }
    if (pa !== pb && firstP == null) firstP = d;
    if (sSame === false && firstS == null) firstS = d;
    if (bSame === false && firstB == null) firstB = d;
    rows.push({ d, all: all ? 1 : 0, econ: eSame ? 1 : 0, vilE, popA: pa, popB: pb, side: sSame == null ? null : sSame ? 1 : 0, nF, vilS, body: bSame == null ? null : bSame ? 1 : 0, bnA: ba ? ba.n : null, bnB: bb ? bb.n : null, rngSame: S(ea.seed) === S(eb.seed) ? 1 : 0, fields: fl });
  }
  const cnt = (k) => rows.filter((r) => r[k] === 1).length;
  const fields = Object.entries(F).sort((a, b) => a[1].first - b[1].first || a[0].localeCompare(b[0])).map(([k, q]) => {
    const saved = SAVE.has(k);
    const cls = !saved ? '저장 키 없음' : (q.first === firstS ? '첫 틱 다시 셈' : '모름');
    return { k, first: q.first, days: q.days, saved, cls, owner: owner(k) };
  });
  const restarts = { a: segNums(da).length - 1, b: segNums(db).length - 1, bDone: !!(Y.p && Y.p.done) };
  fs.writeFileSync(path.join(OUT, `${name}.days.jsonl.gz`), zlib.gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
  return { name, a: da, b: db, n: rows.length, same: cnt('all'), econ: cnt('econ'), pop: rows.filter((r) => r.popA === r.popB).length, side: cnt('side'), body: cnt('body'),
    first, firstE, firstP, firstS, firstB, econParts, fields, restarts, rows: rows.map((r) => { const o = Object.assign({}, r); delete o.fields; return o; }) };
}

function bootTab(name, d) {
  let j = null; try { j = JSON.parse(fs.readFileSync(path.join(d, 't1436-boot.json'), 'utf8')); } catch (e) { return null; }
  let p = null; try { p = JSON.parse(fs.readFileSync(path.join(d, 'progress.json'), 'utf8')); } catch (e) {}
  const segSec = new Map(((p && p.segs) || []).map((s) => [s.from, s.sec]));
  const st = (j.stops || []).filter((x) => x.tag === 'stop'); const rng = (k) => { const v = st.map((x) => x[k]).filter((x) => x != null); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
  const stopAt = st.length ? { n: st.length, sky: rng('sky'), dayFrac: rng('dayFrac'), worldDay: rng('worldDay') } : null;
  return { name, dir: d, body: j.body, frac: j.frac, sec: j.sec, code: j.code, stopAt, segs: j.segs.map((s) => Object.assign({}, s, { segSec: segSec.get(s.from) != null ? segSec.get(s.from) : null })) };
}

//   날것 덤프 견줌(`T740_DUMP_DAYS` 로 찍은 `*.t740.d<날>.json` — 기존 t740-side-hook) — 갈린 칸 안에서 갈린 속 칸 · 그 속 칸 안에서 갈린 칸(두 겹)
const DUMPS = many('dump');
function dumpOf(d, day) { const f = fs.readdirSync(d).filter((x) => x.endsWith(`.t740.d${day}.json`)).sort(); return f.length ? JSON.parse(fs.readFileSync(path.join(d, f[f.length - 1]), 'utf8')) : null; }
function sub(a, b) { if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return null; return Object.keys(Object.assign({}, a, b)).filter((k) => S(a[k]) !== S(b[k])); }
function cmpDump(name, da, db, day) {
  const X = dumpOf(da, day), Y = dumpOf(db, day); if (!X || !Y) return { name, day, missing: true };
  const F = {};
  for (const v of X.names) { const a = X.raw[v] || {}, b = (Y.raw && Y.raw[v]) || {};
    for (const k of new Set(Object.keys(a).concat(Object.keys(b)))) { if (a[k] === b[k]) continue;
      const q = F[k] || (F[k] = { vil: 0, sub: {} }); q.vil++;
      let ja = null, jb = null; try { ja = a[k] && a[k] !== '∅' ? JSON.parse(a[k]) : null; jb = b[k] && b[k] !== '∅' ? JSON.parse(b[k]) : null; } catch (e) {}
      const s1 = sub(ja, jb); if (!s1) { q.sub['(통째)'] = (q.sub['(통째)'] || 0) + 1; if (!q.ex) q.ex = `${v}: ${String(a[k]).slice(0, 40)} → ${String(b[k]).slice(0, 40)}`; continue; }
      for (const k1 of s1) { const s2 = sub(ja[k1], jb[k1]); const key = s2 && s2.length ? `${k1}.{${s2.join(',')}}` : k1; q.sub[key] = (q.sub[key] || 0) + 1; } } }
  return { name, day, n: X.names.length, fields: F };
}
const dumps = DUMPS.map(([n, [a, b, day]]) => cmpDump(n, a, b, +day));
const pairs = PAIRS.map(([n, [a, b, g]]) => Object.assign(cmpPair(n, a, b), { group: g || null }));
const inerts = INERTS.map(([n, [a, b]]) => cmpPair(n, a, b));
const boots = BOOTS.map(([n, [d, ref]]) => { const b = bootTab(n, d); if (b && ref) { const r = bootTab(n + '-ref', ref); const dr = {}; for (const s of (r ? r.segs : [])) Object.assign(dr, s.dayRss || {}); b.ref = ref; b.refRss = dr; } return b; }).filter(Boolean);
//   인구(기준 판 t650) — 부팅 표 곁에(세계가 커서 RSS 가 느는지 가르려고)
for (const b of boots) { const X = load(b.ref || b.dir); b.pop = {}; for (const [d, r] of X.e) b.pop[d] = popOf(r); }
const J = { card: 'T1436', at: new Date().toISOString(), dumps, saveKeys: { t740: [...K740], t1340: [...K1340], t728: [...K728] }, pairs, inerts, boots };
fs.writeFileSync(path.join(OUT, 'table.json'), JSON.stringify(J, null, 1));

// ── table.md ────────────────────────────────────────────────────────────────────────────
const L = [];
const fx = (x) => (x == null ? '—' : x);
L.push('# T1436 표 (스크립트 `scripts/t1436-table.js` 가 만든다 — 손으로 안 고침)', '');
L.push('## 1. 날마다 견줌 — 기준(한 번에 돈 판) ↔ 다시 뜬 판', '');
L.push('| 견줌 | 다시 뜸 | 같은 날(넷 다) | econ 날 지문 | 인구 | 마을 칸 | 몸 자리 | 첫 갈림 날(넷 · econ · 인구 · 마을 칸 · 몸) | econ 첫 갈림 칸 | 끝 날 인구 기준 : 견줌 |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const p of pairs.concat(inerts)) { const z = p.rows[p.rows.length - 1] || {};
  L.push(`| ${p.name} | ${p.restarts.b}${p.restarts.bDone ? '' : ' (판 끝 못 냄)'} | **${p.same}/${p.n}** | ${p.econ}/${p.n} | ${p.pop}/${p.n} | ${p.side}/${p.n} | ${p.body}/${p.n} | ${fx(p.first)} · ${fx(p.firstE)} · ${fx(p.firstP)} · ${fx(p.firstS)} · ${fx(p.firstB)} | ${p.econParts ? p.econParts.join(' · ') : '—'} | ${fx(z.popA)} : ${fx(z.popB)} |`); }
L.push('', '## 2. 벌어지는 크기 — 날마다(갈린 econ 마을 · 인구 차 · 갈린 마을 칸 수 · 그 칸이 갈린 마을 수 · 몸 자리)', '');
for (const p of pairs.filter((x) => x.group !== 'aux')) {
  L.push(`### ${p.name}`, '', '| 날 | 넷 같음 | econ | 갈린 econ 마을 | 인구 기준 : 견줌 (차) | 갈린 마을 칸 수 | 칸이 갈린 마을 | 몸 자리 | 몸 수 |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of p.rows) L.push(`| ${r.d} | ${r.all ? '○' : '✗'} | ${r.econ ? '○' : '✗'} | ${r.vilE} | ${r.popA} : ${r.popB} (${r.popB - r.popA >= 0 ? '+' : ''}${r.popB - r.popA}) | ${fx(r.nF)} | ${fx(r.vilS)} | ${r.body == null ? '—' : r.body ? '○' : '✗'} | ${fx(r.bnA)} : ${fx(r.bnB)} |`);
  L.push('');
}
L.push('## 3. 갈린 마을 칸 — 칸마다 한 줄(분류 = 글자 규칙 · 주인 후보만 · 고치지 않음)', '');
const allF = new Map();
for (const p of pairs.filter((x) => x.group !== 'aux')) for (const f of p.fields) { const q = allF.get(f.k) || { k: f.k, cls: f.cls, owner: f.owner, saved: f.saved, by: [] }; q.by.push(`${p.name} ${f.first}(${f.days}날)`); if (f.cls === '첫 틱 다시 셈') q.cls = f.cls; allF.set(f.k, q); }
//   몸 자리 층(t1308b — 몸마다 자리 · 피 · 하는 일 해시)도 한 줄로 — 몸 칸은 T747 · T1340 `$all` 로 실린다(저장 키) · 분류 규칙은 위와 같다(그 판 첫 갈림 날과 같으면 첫 틱 다시 셈)
for (const p of pairs.filter((x) => x.group !== 'aux')) if (p.firstB != null) { const k = '(몸 자리 층 t1308b)'; const q = allF.get(k) || { k, cls: '모름', owner: 'T747', saved: true, body: true, by: [] };
  q.by.push(`${p.name} ${p.firstB}(${p.rows.filter((r) => r.body === 0).length}날)`); if (p.firstB === p.first) q.cls = '첫 틱 다시 셈'; allF.set(k, q); }
const cls = [...allF.values()].sort((a, b) => a.cls.localeCompare(b.cls) || a.k.localeCompare(b.k));
L.push('| 칸 | 분류 | 저장 키 | 주인 후보 | 판마다 첫 갈림(갈린 날 수) |', '|---|---|---|---|---|');
for (const q of cls) L.push(`| \`${q.k}\` | ${q.cls} | ${q.body ? 'T747 · T1340 몸' : q.saved ? (K1340.has(q.k) ? 'T1340' : K740.has(q.k) ? 'T740' : K728.has(q.k) ? 'T728' : '곁 칸(단계 · 자재)') : '없음'} | ${q.owner} | ${q.by.join(' · ')} |`);
const cc = (c) => cls.filter((q) => q.cls === c).length;
L.push('', `갈린 칸 ${cls.length}개 — 저장 키 없음 ${cc('저장 키 없음')} · 첫 틱 다시 셈 ${cc('첫 틱 다시 셈')} · 모름 ${cc('모름')}`, '');
J.fieldClass = { n: cls.length, none: cc('저장 키 없음'), first: cc('첫 틱 다시 셈'), unk: cc('모름'), list: cls };
L.push('### 날것 덤프 — 갈린 칸 안에서 갈린 속 칸(마을 수)', '', '| 견줌 | 날 | 칸 | 갈린 마을 | 갈린 속 칸(마을 수) |', '|---|---|---|---|---|');
for (const d of dumps) { if (d.missing) { L.push(`| ${d.name} | ${d.day} | (덤프 없음) | — | — |`); continue; }
  for (const [k, q] of Object.entries(d.fields)) L.push(`| ${d.name} | ${d.day} | \`${k}\` | ${q.vil}/${d.n} | ${Object.entries(q.sub).map(([x, c]) => `\`${x}\` ${c}`).join(' · ')}${q.ex ? ` (보기 — 한 번에 → 다시 뜬: ${q.ex})` : ''} |`);
  if (!Object.keys(d.fields).length) L.push(`| ${d.name} | ${d.day} | (갈린 칸 없음) | 0/${d.n} | — |`); }
L.push('');
L.push('## 4. 부팅 초 · RSS — 마디(존 프로세스)마다', '', '부팅 초 = 마디 로그가 생긴 때 → `zone server up on` 줄(바깥에서 300ms 마다 봄) · 시계 = `[t745] 가상 시계 돈다` 줄까지 · RSS(MB) = 뜬 순간 VmRSS · 최대 = VmHWM(마디 끝 무렵 마지막 표본) · 마디 초 = `progress.json`.', '');
for (const b of boots) {
  L.push(`### ${b.name}${b.body ? ' (몸 세계)' : ''}${b.frac != null ? ` · 멈춤 몫 ${b.frac}` : ''} — 판 ${b.sec}초 · 코드 ${b.code}`, '', '| 마디(시작 날) | 부팅 초 | 시계 초 | RSS 뜬 순간 | RSS 최대 | 마디 초 | 그날 인구 | 한 번에 돈 판 RSS(그날 · 다음 날) |', '|---|---|---|---|---|---|---|---|');
  if (b.stopAt) L.splice(L.length - 2, 0, `멈춘 때(멈춤 덤프 ${b.stopAt.n}개): 하늘 몫 ${b.stopAt.sky.join(' ~ ')} · 마을 하루 몫 ${b.stopAt.dayFrac.join(' ~ ')}(하늘 = zone-config 24분 낮밤 · 0 ~ 0.7 낮 · 하루 = 마을 하루 \`VILLAGE_DAY_MS\`)`, '');
  for (const s of b.segs) L.push(`| ${s.from} | ${fx(s.upSec)} | ${fx(s.clockSec)} | ${fx(s.rssUpMB)} | ${fx(s.hwmMB)} | ${fx(s.segSec)} | ${fx(b.pop[s.from])} | ${b.refRss ? `${fx(b.refRss[s.from])} · ${fx(b.refRss[s.from + 1])}` : '—'} |`);
  const rs = b.segs.filter((s) => s.from > 0);
  if (rs.length >= 2) { const f = rs[0], z = rs[rs.length - 1];
    L.push('', `다시 뜬 마디 ${rs.length}번: 부팅 ${f.upSec} → ${z.upSec}초 · RSS 뜬 순간 ${f.rssUpMB} → ${z.rssUpMB} MB · 최대 ${f.hwmMB} → ${z.hwmMB} MB`);
    b.sum = { n: rs.length, upFirst: f.upSec, upLast: z.upSec, upMin: Math.min(...rs.map((s) => s.upSec)), upMax: Math.max(...rs.map((s) => s.upSec)), rssFirst: f.rssUpMB, rssLast: z.rssUpMB, hwmFirst: f.hwmMB, hwmLast: z.hwmMB, hwmMax: Math.max(...rs.map((s) => s.hwmMB || 0)) }; }
  L.push('');
}
fs.writeFileSync(path.join(OUT, 'table.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'table.json'), JSON.stringify(J, null, 1));
console.log(L.slice(0, 4 + pairs.length + inerts.length + 2).join('\n'));
console.log(`  ⇒ ${path.join(OUT, 'table.md')} · table.json · 날 줄 ${pairs.length + inerts.length}개(.days.jsonl.gz)`);

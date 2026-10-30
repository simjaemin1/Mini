#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T993 · 읽기만 · 제품 무접촉 · 판정 0)
// === scripts/t993-knob-rows.js — ① 표에 없는 손잡이의 행을 코드에서 기계적으로 뽑고, 표와 코드가 어긋난 행을 센다 ===
//
// 한 줄: node scripts/t993-knob-rows.js            (요약 — 표에 없음 · 갈래 · 어긋남)
//        node scripts/t993-knob-rows.js --rows     (① 표에 붙일 행 markdown — 표에 없는 손잡이마다 한 행)
//        node scripts/t993-knob-rows.js --mismatch (③ 표 기본값 칸 ↔ 코드 읽는 꼴이 어긋난 행)
//        node scripts/t993-knob-rows.js --indirect (① 표에 붙일 행 — `process.env.이름` 글자 없이 도우미 · 주소창으로 읽히는 손잡이)
//
// 자(`scripts/t976-knob-count.js` 와 같은 자): ① 표 = `## ①` ~ `## ②` 의 `| \`` 행 · 코드 = server/ sim/ public/ 의 `*.js` · `*.mjs`
//   (`*browser.js` · bundle 은 뺀다) 에서 `process.env.T###_…` 로 읽히는 이름.
//   ★간접 — 첫 인자가 손잡이 이름 글자인 부름(`_num('T###_…', 기본)` · `_allocKnob('T###_…')` · 주소창 `.get('T###_…')`)도 따로 센다
//   (t976 자는 `process.env.이름` 글자만 센다 — 이 이름들은 거기서 "표에 없음"에도 "코드 env 0"에도 안 잡힌다).
// 기본값은 **읽는 줄의 글자**로만 가른다(판정 0 · 모르면 `?`):
//   켬 = `!== '0'` · `!(… === '0')` · `=== '0' ? false : true` 꼴 / 끔 = `=== '1'`(또는 `'on'` · `'true'`) / 매개변수 = 수(`parseInt` · `parseFloat` · `Number` · `+`)·글자 값 /
//   그 밖은 `?`(행에 읽은 글자를 그대로 싣는다).
// 행의 칸: 읽는 자리(첫 자리 · 자리가 여럿이면 그 수) · 낸 카드(이름의 T###) · 착지 커밋(`git log -S` 로 그 글자가 처음 든 커밋 — main 안) ·
//   기본값(위 갈래 · 읽는 글자 · 하는 일 = 그 줄 또는 바로 위 주석에서 자른 글자) · 켬 3시드 `?` · 켤 조건 `?` · 상태(갈래 · T993 전수) · 카드 역표(`인계/족보_색인.md` ② 역표).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);

// ── ① 표 ──
const doc = fs.readFileSync(path.join(ROOT, '인계', '손잡이_전수.md'), 'utf8').split('\n');
const H1 = doc.findIndex((l) => l.startsWith('## ① ')), H2 = doc.findIndex((l) => l.startsWith('## ② '));
if (!(H1 >= 0 && H2 > H1)) { console.error('① 표 자리를 못 찾았다'); process.exit(2); }
const table = new Map();
for (let i = H1; i < H2; i++) {
  if (!doc[i].startsWith('| `')) continue;
  const c = doc[i].split(/(?<!\\)\|/).map((s) => s.trim());
  const name = (c[1].match(/`([^`]+)`/) || [])[1];
  if (name && !table.has(name)) table.set(name, { line: i + 1, def: c[5] || '', at: ((c[2] || '').match(/`([^`:]+\.m?js)(?::\d+)?/) || [])[1] || '' });
}
const tkind = (def) => { const d = def.replace(/^\*\*\[\[T\d+\] 갱신\] /, ''); return /^ON/.test(d) ? '켬' : /^OFF/.test(d) ? '끔' : /^매개변수/.test(d) ? '매개변수' : '못 읽음'; };

// ── 코드 자리 ──
const sites = new Map();   // 이름 → [{ file, line, text, prev }]
const FILES = new Map();   // 파일 → 줄들(하는 일 주석을 위로 찾는다)
const isites = new Map();  // 이름 → [{ file, line, text, prev, fn }] — 간접(도우미 · 주소창)
const walk = (d) => {
  for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    const p = d + '/' + e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'assets') walk(p); continue; }
    if (!/\.(js|mjs)$/.test(e.name) || /browser\.js$/.test(e.name) || /bundle/.test(e.name)) continue;
    const L = fs.readFileSync(path.join(ROOT, p), 'utf8').split('\n');
    FILES.set(p, L);
    L.forEach((t, i) => {
      if (/^\s*\/\//.test(t)) return;   // 주석 줄은 읽는 자리가 아니다
      const re = /process\.env\.(T\d+[A-Z0-9_]*)/g; let m;
      while ((m = re.exec(t))) {
        const n = m[1];
        if (!sites.has(n)) sites.set(n, []);
        const arr = sites.get(n);
        if (!arr.some((s) => s.file === p && s.line === i + 1)) arr.push({ file: p, line: i + 1, text: t, prev: L.slice(Math.max(0, i - 4), i) });
      }
      const ri = /([A-Za-z_$][\w$]*)\(\s*['"](T\d+_[A-Z0-9_]+)['"]\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g;
      while ((m = ri.exec(t))) {
        const n = m[2];
        if (!isites.has(n)) isites.set(n, []);
        isites.get(n).push({ file: p, line: i + 1, text: t, prev: L.slice(Math.max(0, i - 4), i), fn: m[1], d: (m[3] || '').trim() });
      }
    });
  }
};
for (const d of ['server', 'sim', 'public']) if (fs.existsSync(path.join(ROOT, d))) walk(d);

// ── 읽는 꼴 → 갈래 ──
function classify(name, text) {
  const e = `process\\.env\\.${name}\\b`;
  const lit = (rx) => new RegExp(rx.replace(/E/g, e)).exec(text);
  let m;
  if ((m = lit(`!\\(\\s*[^()]*E\\s*===\\s*'0'\\s*\\)`))) return { k: '켬', how: `!(… === '0')`, on: 'env=0 이면 끔' };
  if ((m = lit(`E\\s*!==\\s*'0'`))) return { k: '켬', how: `!== '0'`, on: 'env=0 이면 끔' };
  if ((m = lit(`E\\s*===\\s*'0'\\s*\\?\\s*false`))) return { k: '켬', how: `=== '0' ? false`, on: 'env=0 이면 끔' };
  if ((m = lit(`E\\s*===\\s*'(1|on|true)'`))) return { k: '끔', how: `=== '${m[1]}'`, on: `env=${m[1]} 이면 켬` };
  if ((m = lit(`E\\s*==\\s*'1'`))) return { k: '끔', how: `== '1'`, on: 'env=1 이면 켬' };
  if ((m = lit(`(parseInt|parseFloat|Number)\\(\\s*E`)) || (m = lit(`\\+\\s*E`)) || (m = lit(`(parseInt|parseFloat|Number)\\(\\s*\\(?\\s*E`))) return { k: '매개변수', how: `${m[1] || '+'}(…)`, on: '값' };
  if ((m = lit(`E\\s*===\\s*'([^']+)'`))) return m[1] === '0' ? { k: '?', how: "=== '0'", on: '?' } : { k: '끔', how: `=== '${m[1]}'`, on: `env=${m[1]} 이면 켬` };
  if ((m = lit(`E\\s*!==\\s*'([^']+)'`))) return { k: '?', how: `!== '${m[1]}'`, on: '?' };
  if ((m = lit(`E\\s*\\|\\|`)) || (m = lit(`E\\s*\\?`)) || (m = lit(`=\\s*E\\s*[;,)]`))) return { k: '매개변수', how: '값(글자)', on: '값' };
  return { k: '?', how: '?', on: '?' };
}
// ★손 읽음(글자 규칙이 못 가르는 꼴 — 읽는 줄 글자 그대로 읽었다 · 판정 0)
const MAN = {
  T17_COAST: { k: '매개변수', how: "!== undefined ? === '1' : (Z !== 'hanbando')", on: "'1' 켬 · '0' 끔 · 미설정 = 존이 hanbando 가 아니면 켬" },
  T416_SUBS_GUARD: { k: '끔', how: '값이 있으면 그 글자(소문자)', on: '값을 주면 켬(갈래 글자)' },
  T436_K_OVERRIDE: { k: '매개변수', how: 'parseFloat · 기본 0.278025', on: '값(≥ 0)' },
  T529_CHIEF_WALKS: { k: '끔', how: "!== '1' 이면 거짓", on: "env=1 이면 켬" },
  T574_REGION: { k: '매개변수', how: "parseFloat · 미설정 = L_DEFAULT 500 · 0 = 끔", on: '값(꼬리 폭)' },
  T579_CAP_HOUSE: { k: '매개변수', how: "'0' · '1' · '2' 중 하나 · 그 밖 = '2'", on: "'0' · '1' · '2'" },
  T585_STREAM_GUARD: { k: '매개변수', how: "=== 'lot' ? 'lot' : 'guard'", on: "'lot'(기본 'guard')" },
  T598_DIST_DUMP: { k: '끔', how: '값(경로)이 있으면 덤프', on: '경로를 주면 켬' },
  T601_RULER_STREAMS: { k: '켬', how: "=== '0' 이면 갈래 없음(return)", on: 'env=0 이면 끔' },
  T609_BIG_WINDOW: { k: '끔', how: "'a' · 'b' · 'c' 중 하나 · 그 밖 = null", on: "'a' · 'b' · 'c'" },
  T659_WOOD_FLOW: { k: '끔', how: "x != null && x !== '' && x !== '0'", on: "'0' 아닌 값이면 켬" },
  T678_GATES: { k: '켬', how: "!== '0' && !== 'verify'(견줌 = 'verify')", on: "env=0 이면 끔 · 'verify' = 견줌" },
  T688_ROAD_DAY: { k: '켬', how: "!== '0' && !== 'verify'(견줌 = 'verify')", on: "env=0 이면 끔 · 'verify' = 견줌" },
  T694_GAME_MEAT: { k: '켬', how: "!== '0'(villages) · === '0' 이면 거짓(game-meat)", on: 'env=0 이면 끔' },
  T735_VEIN_BATCH: { k: '켬', how: "!== '0'(const) · === '1' 은 부팅 지문 줄", on: 'env=0 이면 끔' },
  T761_LOCAL_CLOCKS: { k: '켬', how: "미설정 = '1'(셋 다) · '0' = 끔 · 쉼표 목록 = 고른 갈래 · 브라우저 = 끔", on: "'0' 이면 끔 · 'wx,mob,temp' 고름" },
};
// 한 손잡이 — 첫 자리(`const 이름 = …` 선언 줄이 있으면 그 줄) · 갈래(자리마다 갈래가 다르면 표시)
function knob(name) {
  const S = sites.get(name) || [];
  const cs = S.map((s) => classify(name, s.text));
  const decl = S.findIndex((s, i) => /\bconst\s+[\w$]+\s*=/.test(s.text) && cs[i].k !== '?');
  const pick = decl >= 0 ? decl : cs.findIndex((c) => c.k !== '?');
  const ci = pick >= 0 ? pick : 0;
  if (MAN[name]) { const kinds = [MAN[name].k]; return { name, S, c: Object.assign({ man: true }, MAN[name]), at: S[ci], kinds }; }
  const kinds = [...new Set(cs.map((c) => c.k).filter((k) => k !== '?'))];
  return { name, S, c: cs[ci] || { k: '?', how: '?', on: '?' }, at: S[ci], kinds };
}
const clip = (s, n) => { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
// 하는 일 — ⓐ 그 손잡이 이름이 든 주석 줄(읽는 줄 위 80 줄 안 · 가장 가까운 것 · 그 아래 주석 한 줄까지) ⓑ 읽는 줄 끝 주석 ⓒ 바로 위 주석 덩이 — 글자 그대로 자른다(지어내지 않음 · 없으면 ?)
function doing(at, name) {
  if (!at) return '?';
  const esc = (c) => c.replace(/\|/g, '\\|').replace(/`/g, "'");
  const L = FILES.get(at.file) || [];
  let a = '';
  for (let j = at.line - 2; j >= Math.max(0, at.line - 81); j--) {
    const t = L[j]; if (!/^\s*(\/\/|\*|\/\*)/.test(t)) continue;
    if (t.includes(name)) { a = t.replace(/^\s*(\/\/|\/?\*+)\s?/, ''); const nx = L[j + 1]; if (nx && /^\s*\/\//.test(nx) && !nx.includes('process.env')) a += ' ' + nx.replace(/^\s*\/\/\s?/, ''); break; }
  }
  const i = at.text.indexOf('//'); const b = i >= 0 ? at.text.slice(i + 2) : '';
  let out = '';
  if (a.trim()) out = '「' + clip(esc(a), 150) + '」' + (b.trim() ? ' · 줄 주석 「' + clip(esc(b), 70) + '」' : '');
  else if (b.trim()) out = '줄 주석 「' + clip(esc(b), 150) + '」';
  else { const p = at.prev.filter((l) => /^\s*\/\//.test(l)).map((l) => l.replace(/^\s*\/\/\s?/, '')).join(' '); if (p.trim()) out = '위 주석 「' + clip(esc(p), 130) + '」'; }
  return out || '?';
}
const sh = (args) => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return ''; } };
const ROOTS = new Set(sh(['rev-list', '--max-parents=0', 'HEAD']).split('\n').map((h) => h.slice(0, 8)));
function landed(name, file) { const h = sh(['log', '--reverse', '--format=%h', '-S', `process.env.${name}`, 'HEAD', '--', file]).split('\n')[0]; if (!h) return '?'; const k = h.slice(0, 8); return ROOTS.has(k) ? k + '`(뿌리 커밋 — 그 앞 git 역사 없음)' : k + '`'; }
const jokbo = (() => {
  const t = fs.readFileSync(path.join(ROOT, '인계', '족보_색인.md'), 'utf8').split('\n');
  const a = t.findIndex((l) => l.startsWith('## ② 역표')), m = new Map();
  for (let i = a; i >= 0 && i < t.length && !t[i].startsWith('## 합계'); i++) { const r = /^\| (T\d+[\w-]*) \| (.+) \|$/.exec(t[i]); if (r) m.set(r[1], r[2].trim()); }
  return m;
})();
// 간접 손잡이 — 도우미 `_num` · `_int` · `_rgNum`(수 · 둘째 인자 = 기본) 은 글자로 · 그 밖(`_allocKnob` · 주소창 `.get`)은 손 읽음
const IMAN = {
  T522_CHAR_3D: { k: '끔', how: "주소창 .get(…) \\|\\| null · 값이 있으면 켬", on: "주소창 ?T522_CHAR_3D=1(비교 =overlay)" },
  T652_WOOD_EARLY: { k: '끔', how: "_allocKnob · x !== null && x !== '0' · '2' = 좁은 문(T663)", on: "=1 켬 · =2 좁은 문 · 랩 window.T652_WOOD_EARLY" },
  T717_FUEL_GATE: { k: '끔', how: "_allocKnob · x !== null && x !== '0'", on: "=1 켬 · 랩 window.T717_FUEL_GATE" },
  T770_CUT_HLO: { k: '켬', how: "주소창 .get(…) !== '0' ? 1 : 0", on: "주소창 ?T770_CUT_HLO=0 이면 끔" },
};
function iknob(name) {
  const S = isites.get(name);
  const at = S[0];
  if (IMAN[name]) return { name, S, at, c: Object.assign({ man: true }, IMAN[name]), kinds: [IMAN[name].k] };
  if (/^_(num|int|rgNum)$/.test(at.fn) && at.d === '1' && new RegExp(`${at.fn}\\(\\s*'${name}'\\s*,\\s*1\\s*\\)\\s*!==\\s*0`).test(at.text)) return { name, S, at, c: { k: '켬', how: `${at.fn}('${name}', 1) !== 0`, on: 'env=0 이면 끔' }, kinds: ['켬'] };
  if (/^_(num|int|rgNum)$/.test(at.fn)) return { name, S, at, c: { k: '매개변수', how: `${at.fn}('${name}', ${at.d})`, on: `기본 ${at.d}` }, kinds: ['매개변수'] };
  return { name, S, at, c: { k: '?', how: at.fn + '(…)', on: '?' }, kinds: [] };
}
function ilanded(name, file) { const h = sh(['log', '--reverse', '--format=%h', '-S', `'${name}'`, 'HEAD', '--', file]).split('\n')[0]; if (!h) return '?'; const k = h.slice(0, 8); return ROOTS.has(k) ? k + '`(뿌리 커밋 — 그 앞 git 역사 없음)' : k + '`'; }
const cardOf = (name) => (name.match(/^(T\d+)_/) || [])[1];

const imissing = [...isites.keys()].filter((n) => !table.has(n) && !sites.has(n)).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10) || (a < b ? -1 : 1));
const missing = [...sites.keys()].filter((n) => !table.has(n)).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10) || (a < b ? -1 : 1));
const K = missing.map(knob);
const tallyK = (arr) => { const o = { 켬: [], 끔: [], 매개변수: [], '?': [] }; for (const x of arr) o[x.c.k].push(x.name); return o; };

if (A.includes('--rows') || A.includes('--indirect')) {
  const IND = A.includes('--indirect');
  for (const x of (IND ? imissing.map(iknob) : K)) {
    const card = cardOf(x.name), loc = x.at ? `\`${x.at.file}:${x.at.line}\`` + (x.S.length > 1 ? `(자리 ${x.S.length} · ${[...new Set(x.S.map((s) => s.file.replace(/^.*\//, '')))].join(' · ')})` : '') : '?';
    const head = x.c.k === '켬' ? 'ON' : x.c.k === '끔' ? 'OFF' : x.c.k === '매개변수' ? '매개변수' : '?';
    const q = IND ? x.at.text.indexOf(x.name) : x.at ? x.at.text.indexOf('process.env.' + x.name) : -1;
    const lit = x.at ? clip(x.at.text.slice(Math.max(0, q - 30), q + x.name.length + 40), 90).replace(/\|/g, '\\|').replace(/`/g, "'") : '';
    const def = `${head}(${x.c.k === '매개변수' ? '값' : '불리언'}${IND ? ' · ★간접 읽기(`process.env.' + x.name + '` 글자 없음)' : ''}${x.c.man ? ' · 손 읽음' : ''} · ${x.c.on} · 코드 \`${x.c.how}\`${x.kinds.length > 1 ? ' · ⚠자리마다 꼴이 다르다(' + x.kinds.join('/') + ')' : ''} · 읽는 글자 「${lit}」 · 하는 일(코드 주석 글자): ${doing(x.at, x.name)})`;
    const st = x.c.k === '켬' ? '켬 기본(코드 글자 · T993 전수)' : x.c.k === '끔' ? '끔(코드 글자 · T993 전수)' : x.c.k === '매개변수' ? '매개변수(T993 전수)' : '?(읽는 꼴 못 가름 · T993 전수)';
    const jb = card && jokbo.has(card) ? `${card} → ${jokbo.get(card)}` : `${card || '?'} → 족보없음`;
    console.log(`| \`${x.name}\` | ${loc} | ${card || '?'} | ${x.at ? '`' + (IND ? ilanded : landed)(x.name, x.at.file) : '?'} | ${def} | ? | ? | ${st} | ${jb} |`);
  }
  process.exit(0);
}
if (A.includes('--mismatch')) {
  const ind = [], unk = [];
  for (const [name, r] of table) {
    if (!sites.has(name)) { const I = isites.get(name); if (I) { ind.push(name); continue; } console.log(`- \`${name}\` — 표 ${tkind(r.def)}(줄 ${r.line}) · 코드에서 읽는 자리 0(\`process.env.${name}\` · 간접 둘 다)`); continue; }
    const x = knob(name), tk = tkind(r.def);
    if (x.c.k === '?') unk.push(name);
    if (x.c.k !== '?' && tk !== '못 읽음' && x.c.k !== tk) console.log(`- \`${name}\` — 표 ${tk}(줄 ${r.line}) ↔ 코드 ${x.c.k}(\`${x.at.file}:${x.at.line}\` · \`${x.c.how}\`)`);
    else if (x.kinds.length > 1) console.log(`- \`${name}\` — 표 ${tk}(줄 ${r.line}) · 코드 자리마다 꼴이 다르다(${x.kinds.join('/')} · 자리 ${x.S.length})`);
  }
  const wf = [];
  for (const [name, r] of table) {
    const S = (sites.get(name) || []).concat(isites.get(name) || []);
    if (r.at && S.length && !S.some((x) => x.file === r.at || x.file.endsWith('/' + r.at))) wf.push(`\`${name}\`(표 \`${r.at}\` · 코드 ${[...new Set(S.map((x) => '`' + x.file + '`'))].join(' · ')})`);
  }
  console.log(`- 자리 칸의 파일이 코드 읽는 자리 파일에 없음 ${wf.length}(줄 번호는 흘러서 안 견준다): ${wf.join(' ; ')}`);
  console.log(`(간접 읽기로만 읽히는 표 이름 ${ind.length} — 어긋남 아님 · 글자 규칙이 못 가른 표 이름 ${unk.length}: ${unk.join(' ')})`);
  process.exit(0);
}
const t = tallyK(K);
const ti = tallyK(imissing.map(iknob));
console.log(`간접 읽기(도우미 · 주소창)로만 읽히고 표에 없음 ${imissing.length} — 켬 ${ti['켬'].length} · 끔 ${ti['끔'].length} · 매개변수 ${ti['매개변수'].length} · 못 가름 ${ti['?'].length}`);
console.log(`표에 없음 ${K.length} — 켬 ${t['켬'].length} · 끔 ${t['끔'].length} · 매개변수 ${t['매개변수'].length} · 못 가름 ${t['?'].length}`);
if (A.includes('--list')) for (const [k, v] of Object.entries(t)) console.log(`  ${k} ${v.length}: ${v.join(' ')}`);

#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T976 ③ · 읽기만 · 제품 무접촉 · 판정 0)
// === scripts/t976-knob-count.js — 손잡이 전수 머릿수를 다시 센다 ===
//
// 한 줄: node scripts/t976-knob-count.js          (머릿수 한 줄)
//        node scripts/t976-knob-count.js --list   (갈래마다 이름도)
//
// ① 표(`인계/손잡이_전수.md` 의 `## ①` ~ `## ②` · 칸은 `\|` 를 안 가르는 `|` 로 나눈다)의 행을 읽는다:
//   행 · 이름(겹친 이름) · 기본값 칸 머리 글자(앞의 `**[[T547] 갱신] ` 꾸밈은 걷고 읽는다)로 기본 켬 `ON` / 끔 `OFF` / 매개변수 / 못 읽음 ·
//   읽는 자리 칸 첫 경로의 머리 디렉터리(server · sim · public · 그 밖).
// 코드(server/ sim/ public/ — `*browser.js` · bundle 은 뺀다 · `scripts/t883-knob-compare.js` 와 같은 자)에서 `process.env.T###_…` 로 읽히는 이름과 맞댄다:
//   코드 env 이름 수 · 그중 표에 없는 것 · 표에 있는데 코드에 `process.env.<이름>` 이 없는 것.
// ★[T1007 · T993 회부 1] 간접 읽기도 센다 — 첫 인자가 손잡이 이름 글자인 부름(`_num('T###_…', 기본)` · `_rgNum` · `_allocKnob` · `_bcKnob` ·
//   주소창 `.get('T###_…')` — 주석 줄은 뺀다 · `scripts/t993-knob-rows.js` 와 같은 자). "표에 있고 코드 env 0" 을 간접 읽기 · 어디서도 안 읽음으로 가른다.
// ⚠T547 머릿수(102 · 켬 33 · 끔 51 · 매개변수 18 …)의 ⓑ(카드가 냈는데 코드 0) · ⓔ(켠 3시드가 보고에 없는 것)는 보고를 읽어야 하는 셈이라 여기서 안 센다.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LIST = process.argv.includes('--list');

const doc = fs.readFileSync(path.join(ROOT, '인계', '손잡이_전수.md'), 'utf8').split('\n');
const H1 = doc.findIndex((l) => l.startsWith('## ① ')), H2 = doc.findIndex((l) => l.startsWith('## ② '));
if (!(H1 >= 0 && H2 > H1)) { console.error('① 표 자리를 못 찾았다'); process.exit(2); }
const rows = [];
for (let i = H1; i < H2; i++) {
  if (!doc[i].startsWith('| `')) continue;
  const c = doc[i].split(/(?<!\\)\|/).map((s) => s.trim());
  const name = (c[1].match(/`([^`]+)`/) || [])[1];
  if (name) rows.push({ line: i + 1, name, loc: c[2] || '', def: c[5] || '' });
}
const kind = (def) => { const d = def.replace(/^\*\*\[\[T\d+\] 갱신\] /, ''); return /^ON/.test(d) ? '켬' : /^OFF/.test(d) ? '끔' : /^매개변수/.test(d) ? '매개변수' : '못 읽음'; };
const dir = (loc) => { const m = /`([a-z]+)\//.exec(loc); return m && ['server', 'sim', 'public'].includes(m[1]) ? m[1] : '그 밖'; };
const names = new Map(); for (const r of rows) { if (!names.has(r.name)) names.set(r.name, []); names.get(r.name).push(r); }
const dup = [...names.entries()].filter(([, v]) => v.length > 1).map(([n]) => n);
const tally = (f, keys) => { const o = Object.fromEntries(keys.map((k) => [k, []])); for (const [n, v] of names) o[f(v[0])].push(n); return o; };
const byKind = tally((r) => kind(r.def), ['켬', '끔', '매개변수', '못 읽음']);
const byDir = tally((r) => dir(r.loc), ['server', 'sim', 'public', '그 밖']);

const seen = new Map();
const iseen = new Map();   // 간접 읽기 이름 → 첫 자리(파일 · 부른 함수)
const walk = (d) => {
  for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    const p = d + '/' + e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'assets') walk(p); continue; }
    if (!/\.(js|mjs)$/.test(e.name) || /browser\.js$/.test(e.name) || /bundle/.test(e.name)) continue;
    const re = /process\.env\.(T\d+[A-Z0-9_]*)/g; const t = fs.readFileSync(path.join(ROOT, p), 'utf8'); let m;
    while ((m = re.exec(t))) if (!seen.has(m[1])) seen.set(m[1], p);
    for (const l of t.split('\n')) {
      if (/^\s*\/\//.test(l)) continue;   // 주석 줄은 읽는 자리가 아니다
      const ri = /([A-Za-z_$][\w$]*)\(\s*['"](T\d+_[A-Z0-9_]+)['"]/g;
      while ((m = ri.exec(l))) if (!iseen.has(m[2])) iseen.set(m[2], p + ' ' + m[1]);
    }
  }
};
for (const d of ['server', 'sim', 'public']) if (fs.existsSync(path.join(ROOT, d))) walk(d);
const notInTable = [...seen.keys()].filter((n) => !names.has(n)).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10) || (a < b ? -1 : 1));
const noEnv = [...names.keys()].filter((n) => !seen.has(n));
const indOnly = [...iseen.keys()].filter((n) => !seen.has(n));   // `process.env.이름` 글자 없이 간접으로만 읽히는 이름
const indNotInTable = indOnly.filter((n) => !names.has(n));
const noEnvInd = noEnv.filter((n) => iseen.has(n)), noRead = noEnv.filter((n) => !iseen.has(n));

const n = (a) => a.length;
console.log(`① 표 손잡이 ${names.size}(행 ${rows.length} · 겹친 이름 ${n(dup)}) · 기본 켬 ${n(byKind['켬'])} · 끔 ${n(byKind['끔'])} · 매개변수 ${n(byKind['매개변수'])} · 못 읽음 ${n(byKind['못 읽음'])}`
  + ` · 읽는 자리 server ${n(byDir.server)} · sim ${n(byDir.sim)} · public ${n(byDir.public)} · 그 밖 ${n(byDir['그 밖'])}`
  + ` | 코드 env T###_ 이름 ${seen.size} · 그중 표에 없음 ${n(notInTable)} · 표에 있고 코드 env 0 ${n(noEnv)}`
  + ` | 간접 읽기로만 읽는 이름 ${n(indOnly)} · 그중 표에 없음 ${n(indNotInTable)} · 표에 있고 코드 env 0 중 간접 읽기 ${n(noEnvInd)} · 어디서도 안 읽음 ${n(noRead)}`);
if (LIST) {
  for (const [k, v] of Object.entries(byKind)) console.log(`  기본 ${k} ${v.length}: ${v.join(' ')}`);
  for (const [k, v] of Object.entries(byDir)) console.log(`  읽는 자리 ${k} ${v.length}: ${v.join(' ')}`);
  console.log(`  겹친 이름 ${dup.length}: ${dup.join(' ')}`);
  console.log(`  표에 없음 ${notInTable.length}: ${notInTable.map((x) => x + '(' + seen.get(x) + ')').join(' ')}`);
  console.log(`  표에 있고 코드 env 0 ${noEnv.length}: ${noEnv.join(' ')}`);
  console.log(`  간접 읽기로만 읽는 이름 ${indOnly.length}: ${indOnly.map((x) => x + '(' + iseen.get(x) + ')').join(' ')}`);
  console.log(`  간접 읽기 · 표에 없음 ${indNotInTable.length}: ${indNotInTable.join(' ')}`);
  console.log(`  표에 있고 어디서도 안 읽음 ${noRead.length}: ${noRead.join(' ')}`);
}

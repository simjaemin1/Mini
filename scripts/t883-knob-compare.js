#!/usr/bin/env node
// T883 — 손잡이 전수 표 ↔ 코드 기본값 대조(일회용 · 러너 밖 · @regress 아님 · 제품 무접촉).
// 표(인계/손잡이_전수.md)의 각 행: 이름 · 읽는 파일:줄 · 기본값 글자. 코드에서 `NAME` 이 나오는 줄을 모아
// 켬/끔 글자를 기계로 읽고 표와 글자만 비교한다(판정 0 · 갈린 건 목록으로만).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const doc = fs.readFileSync(path.join(root, '인계/손잡이_전수.md'), 'utf8').split('\n');
const rows = [];
const END = doc.findIndex(l => l.startsWith('## ② ')); // 첫 표(①)만 — 뒤의 표들은 다른 열 모양
doc.forEach((ln, i) => {
  if (i >= END || !ln.startsWith('| `')) return;
  const c = ln.split('|').map(s => s.trim());
  const name = (c[1].match(/`([^`]+)`/) || [])[1];
  if (!name) return;
  rows.push({ line: i + 1, name, loc: c[2], card: c[3], def: c[5], status: c[8] });
});
// 중복
const byName = {};
rows.forEach(r => (byName[r.name] = byName[r.name] || []).push(r));
const dups = Object.entries(byName).filter(([, v]) => v.length > 1);
// 코드 줄 읽기
const files = {};
function lines(f) { return files[f] || (files[f] = fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8').split('\n') : null); }
function codeKind(name) {
  // 제품 코드(server/ sim/ public/ — 번들 제외)에서 `NAME` 이 env 로 읽히는 줄의 글자를 분류한다.
  const out = [];
  const dirs = ['server', 'sim', 'public'];
  const walk = d => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const p = d + '/' + e.name;
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'assets') walk(p); }
      else if (/\.(js|mjs)$/.test(e.name) && !/browser\.js$/.test(e.name) && !/bundle/.test(e.name)) {
        const L = lines(p); if (!L) continue;
        L.forEach((t, i) => {
          if (t.indexOf(name) < 0) return;
          const re = new RegExp(name + "\\b");
          if (!re.test(t)) return;
          if (!/env/.test(t) && !/process/.test(t)) return;
          let k = null;
          if (new RegExp(name + "\\s*(===|==)\\s*['\"]1['\"]").test(t)) k = 'OFF';
          else if (new RegExp(name + "\\s*(!==|!=)\\s*['\"]0['\"]").test(t)) k = 'ON';
          else if (new RegExp(name + "\\s*(===|==)\\s*['\"]0['\"]").test(t)) k = 'OFF0';
          else if (new RegExp(name + "\\s*(!==|!=)\\s*['\"]1['\"]").test(t)) k = 'ON1';
          else k = '?';
          out.push({ file: p, line: i + 1, kind: k });
        });
      }
    }
  };
  dirs.forEach(d => fs.existsSync(path.join(root, d)) && walk(d));
  return out;
}
function tableKind(def) {
  if (/^ON/.test(def)) return 'ON';
  if (/^OFF/.test(def)) return 'OFF';
  if (/^매개변수/.test(def)) return 'PARAM';
  return '?' ;
}
const diff = [], unknown = [], nocode = [], paramDiff = [];
for (const r of rows) {
  const tk = tableKind(r.def);
  const hits = codeKind(r.name);
  if (!hits.length) { nocode.push(r); continue; }
  const kinds = [...new Set(hits.map(h => h.kind))];
  const mapped0 = kinds.map(k => k === 'OFF0' ? 'ON?' : k === 'ON1' ? 'OFF?' : k);
  const decisive = [...new Set(kinds.map(k => k === 'OFF0' ? 'ON' : k === 'ON1' ? 'OFF' : k).filter(k => k === 'ON' || k === 'OFF'))];
  if (tk === 'PARAM' || tk === '?') {
    // 매개변수/비정형: 표 기본값 글자 속 숫자가 코드 줄에도 있는지만 본다(없으면 갈림 후보)
    const nums = (r.def.match(/\d+(?:\.\d+)?/g) || []);
    const txt = hits.map(h => lines(h.file)[h.line - 1]).join('\n');
    const miss = nums.filter(n => txt.indexOf(n) < 0);
    if (nums.length && miss.length) paramDiff.push({ r, nums, miss, hits });
    else unknown.push({ r, tk, kinds, hits });
    continue;
  }
  if (decisive.length === 1 && decisive[0] !== tk) diff.push({ r, tk, kinds, hits });
  else if (decisive.length > 1) diff.push({ r, tk, kinds, hits, mixed: true });
  else if (!decisive.length) unknown.push({ r, tk, kinds, hits });
}
console.log(`행 ${rows.length} · 이름 ${Object.keys(byName).length} · 중복 이름 ${dups.length}`);
dups.forEach(([n, v]) => console.log('  중복', n, v.map(r => r.line + ':' + r.def.slice(0, 40)).join(' | ')));
console.log(`코드 줄 없음(제품 코드 밖/이름만) ${nocode.length}`);
nocode.forEach(r => console.log('  코드0', r.line, r.name, r.loc));
console.log(`표 ≠ 코드 글자 ${diff.length}`);
diff.forEach(d => console.log('  갈림', d.r.line, d.r.name, '표=' + d.tk, '코드=' + d.kinds.join(','), d.hits.slice(0, 3).map(h => h.file + ':' + h.line).join(' '), d.mixed ? '(섞임)' : '', '|', d.r.status.slice(0, 40)));
console.log(`매개변수 숫자가 코드 줄에 없음 ${paramDiff.length}`);
paramDiff.forEach(d => console.log('  숫자', d.r.line, d.r.name, '표=' + d.r.def.slice(0, 50), '없는 숫자=' + d.miss.join(','), d.hits.slice(0, 2).map(h => h.file + ':' + h.line).join(' ')));
console.log(`판독 못 함(매개변수·글자 비정형) ${unknown.length}`);
unknown.forEach(u => console.log('  못읽음', u.r.line, u.r.name, '표=' + u.tk, '코드=' + u.kinds.join(','), u.hits.slice(0, 2).map(h => h.file + ':' + h.line).join(' ')));

// ── 거꾸로: 코드에서 env 로 읽히는 `T###_이름` 손잡이 중 표(전수 ①)에 이름이 없는 것(제품 코드 server/ sim/ public/ 만 · 판정 0 · 목록만)
{
  const seen = {};
  const walk = d => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const p = d + '/' + e.name;
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'assets') walk(p); }
      else if (/\.(js|mjs)$/.test(e.name) && !/browser\.js$/.test(e.name) && !/bundle/.test(e.name)) {
        lines(p).forEach((t, i) => {
          const re = /process\.env\.(T\d+[A-Z0-9_]*)/g; let m;
          while ((m = re.exec(t))) (seen[m[1]] = seen[m[1]] || []).push(p + ':' + (i + 1));
        });
      }
    }
  };
  ['server', 'sim', 'public'].forEach(d => fs.existsSync(path.join(root, d)) && walk(d));
  const missing = Object.keys(seen).filter(n => !byName[n]).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)) || (a < b ? -1 : 1));
  console.log(`코드에서 env 로 읽는 T###_ 이름 ${Object.keys(seen).length} · 표(①)에 없는 것 ${missing.length}`);
  missing.forEach(n => console.log('  표에없음', n, seen[n][0]));
}

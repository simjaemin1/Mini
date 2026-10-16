#!/usr/bin/env node
// === scripts/t738-census.js — 뜨거운 사람 필드 읽기 · 쓰기 자리 전수 (T738 ① · 2026-10-15) ==========================
//
// ⚠계측기다(러너 밖 · `@regress` 없음 · 제품 무변 · 읽기만).
// ★무엇: `server/*.js` 를 AST 로 훑어, 사람 객체를 가리키는 이름(아래 `PERSON`)의 뜨거운 필드(`HOT`) 접근을
//   **읽기 / 쓰기(=, op=, ++/--) / 지우기** 로 갈라 파일:줄 · 감싼 함수와 함께 센다.
//   사람 이름 = `players.get(…)` · `players.values()` 순회 변수 · 사람을 받는 함수 매개에서 실제로 쓰이는 이름(npc · p · pl · player · me · b).
//   ⚠정적 자의 한계: `p` 가 사람 아닌 것(점 · 몹)을 가리키는 자리도 섞일 수 있다 — 표의 "함수" 열로 사람이 읽는 자리를 고른다(보고 §1).
// 실행: node scripts/t738-census.js [--json out.json]
'use strict';
const fs = require('fs'), path = require('path');
const acorn = require(path.join(__dirname, '..', 'node_modules', 'acorn'));
const ROOT = path.join(__dirname, '..');
const HOT = ['x', 'y', 'vx', 'vy', 'targetX', 'targetY', 'path', 'pathIndex', '_pathAt', '_pathFor', '_stuckPos', '_stuckN', 'floor', 'behavior', 'nextDecisionAt'];
const PERSON = new Set(['npc', 'p', 'pl', 'player', 'me', 'b']);
// ★[T774] 판 셈 — 이 파일을 `T686_PATCH` 로 주면(t686 자 사본에만) 존 끝에 활성 판정 셈을 박는다: 부른 수 · 걸음 수 · 틱 수 · 부른 함수(256번에 한 번 스택 표본)
//   쓰는 법: T686_PATCH=$PWD/scripts/t738-census.js T774_CNT_OUT=/tmp/t774/<판>.cnt.json T686_END_S=300 node scripts/t686-spike.js run <판>
if (require.main !== module) {
  module.exports = function (dir) {
    const zp = path.join(dir, 'server', 'zone.js');
    fs.appendFileSync(zp, `
;(function () {   // [T774 판 셈 · 계측기가 박았다 · 제품엔 없다]
  const OUT = process.env.T774_CNT_OUT; if (!OUT) return;
  const C = { ticks: 0, steps: 0, ipa: 0, fn: {} }; let k = 0;
  const f0 = isPositionActive; isPositionActive = function (x, y) { C.ipa++; if ((++k & 255) === 0) { const st = (new Error().stack.split('\\n')[2] || ''); const m = st.match(/at ([^ (]+)/); const key = m ? m[1] : '?'; C.fn[key] = (C.fn[key] || 0) + 256; } return f0(x, y); };
  const s0 = npcStep; npcStep = function (a, b, c) { C.steps++; return s0(a, b, c); };
  const u0 = updateActiveChunks; updateActiveChunks = function () { C.ticks++; return u0.apply(this, arguments); };
  process.on('SIGHUP', () => { C.ticks = 0; C.steps = 0; C.ipa = 0; C.fn = {}; });
  process.on('SIGUSR2', () => { try { require('fs').writeFileSync(OUT, JSON.stringify(C)); } catch (e) {} });
})();
`);
    require('child_process').execFileSync(process.execPath, ['--check', zp]);
  };
  return;
}
const files = fs.readdirSync(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js')).map((f) => 'server/' + f);
const rows = [], actRows = [], ACT = process.argv.includes('--active');
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true, allowReturnOutsideFunction: true }); } catch (e) { continue; }
  const fnStack = [];
  const walk = (n, parent, key) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((c) => walk(c, parent, key)); return; }
    const isFn = /Function/.test(n.type);
    if (isFn) fnStack.push((n.id && n.id.name) || (parent && parent.type === 'VariableDeclarator' && parent.id.name) || (parent && parent.type === 'Property' && parent.key && (parent.key.name || parent.key.value)) || '(익명)');
    //   ★[T774] `--active` — 활성 판정 부름 자리(`isPositionActive` · `activeChunkKeys.has` · `isChunkActiveKey`) · 그 줄에 `_t316WalkAlways` 가 앞서는가(늘 걷는 마을 몸은 안 묻는다)
    if (ACT && n.type === 'CallExpression' && ((n.callee.type === 'Identifier' && (n.callee.name === 'isPositionActive' || n.callee.name === 'isChunkActiveKey')) ||
        (n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'activeChunkKeys' && n.callee.property.name === 'has'))) {
      const ln = src.split('\n')[n.loc.start.line - 1];
      actRows.push({ f, line: n.loc.start.line, call: n.callee.type === 'Identifier' ? n.callee.name : 'activeChunkKeys.has', fn: fnStack[fnStack.length - 1] || '(최상위)', walk: /_t316WalkAlways/.test(ln), act: /act !== undefined/.test(ln) });
    }
    if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && PERSON.has(n.object.name) && HOT.includes(n.property.name)) {
      let kind = 'r';
      if (parent && parent.type === 'AssignmentExpression' && key === 'left') kind = parent.operator === '=' ? 'w' : 'rw';
      else if (parent && parent.type === 'UpdateExpression') kind = 'rw';
      else if (parent && parent.type === 'UnaryExpression' && parent.operator === 'delete') kind = 'del';
      rows.push({ f, line: n.loc.start.line, field: n.property.name, kind, fn: fnStack[fnStack.length - 1] || '(최상위)', obj: n.object.name });
    }
    for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'type') walk(n[k], n, k);
    if (isFn) fnStack.pop();
  };
  walk(ast, null, null);
}
const by = {};
for (const r of rows) { const e = by[r.field] = by[r.field] || { r: 0, w: 0, rw: 0, del: 0, files: new Set(), fns: new Map() }; e[r.kind]++; e.files.add(r.f); const k = r.f.replace('server/', '') + ':' + r.fn; e.fns.set(k, (e.fns.get(k) || 0) + 1); }
if (ACT) {   // ★[T774] 활성 판정 자리 표(정적) — 걸음마다 몇 번인가는 판 셈(`T774_CENSUS=1` · 존 `/perf` walk.t774)이 맡는다
  console.log('파일:줄 | 부름 | 함수 | 늘 걷는 몸 먼저 거름(_t316WalkAlways) | 앞에서 센 값 재사용(act)');
  for (const r of actRows) console.log(`${r.f.replace('server/', '')}:${r.line} | ${r.call} | ${r.fn} | ${r.walk ? '예' : '-'} | ${r.act ? '예' : '-'}`);
  console.log(`합 ${actRows.length}자리`); process.exit(0);
}
console.log('필드 | 읽기 | 쓰기 | 읽고쓰기 | 지우기 | 파일 수 | 자리가 많은 함수(상위 6)');
for (const fld of HOT) { const e = by[fld]; if (!e) { console.log(`${fld} | 0`); continue; }
  const top = [...e.fns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join(' · ');
  console.log(`${fld} | ${e.r} | ${e.w} | ${e.rw} | ${e.del} | ${e.files.size} | ${top}`); }
const ji = process.argv.indexOf('--json'); if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(rows));

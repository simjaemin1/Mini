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
const files = fs.readdirSync(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js')).map((f) => 'server/' + f);
const rows = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true, allowReturnOutsideFunction: true }); } catch (e) { continue; }
  const fnStack = [];
  const walk = (n, parent, key) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((c) => walk(c, parent, key)); return; }
    const isFn = /Function/.test(n.type);
    if (isFn) fnStack.push((n.id && n.id.name) || (parent && parent.type === 'VariableDeclarator' && parent.id.name) || (parent && parent.type === 'Property' && parent.key && (parent.key.name || parent.key.value)) || '(익명)');
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
console.log('필드 | 읽기 | 쓰기 | 읽고쓰기 | 지우기 | 파일 수 | 자리가 많은 함수(상위 6)');
for (const fld of HOT) { const e = by[fld]; if (!e) { console.log(`${fld} | 0`); continue; }
  const top = [...e.fns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join(' · ');
  console.log(`${fld} | ${e.r} | ${e.w} | ${e.rw} | ${e.del} | ${e.files.size} | ${top}`); }
const ji = process.argv.indexOf('--json'); if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(rows));

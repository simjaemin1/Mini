#!/usr/bin/env node
// === scripts/split-audit.js — 파일 분할 전 **최상위 실행문 감사** =================
//
// ★★[0번 분할 배치 2026-09-01] 분할의 유일한 위험 지점은 **최상위 실행문**이다.
//   한 파일 안에서는 `function` 선언이 hoisting 으로 살아서, 파일 위쪽의 실행문이
//   아래쪽 함수를 불러도 된다. 그런데 그 둘을 **다른 `<script>` 파일로 가르면**
//   위 파일이 실행될 때 아래 파일이 아직 로드되지 않아 `ReferenceError` 로 죽는다.
//   ⇒ "그 실행문이 참조하는 이름이 **자기 뒤에** 선언돼 있는가"를 전수로 세는 것이 이 도구다.
//
// ★눈으로 하지 마라(지시서 §2-③). AST 로 걷는다.
//
// 사용:
//   node scripts/split-audit.js public/client.js            # 요약
//   node scripts/split-audit.js public/client.js --list     # 뒤 참조 실행문 전수
//   node scripts/split-audit.js public/client.js --json     # 기계 판독
//
// ★이 도구는 **아무것도 고치지 않는다.** 재는 자다.
'use strict';
const fs = require('fs');
const path = require('path');
let acorn;
try { acorn = require('acorn'); } catch (e) {
  console.error('acorn 이 필요하다: npm install --no-save acorn'); process.exit(2);
}

const FILE = process.argv[2] || 'public/client.js';
const WANT_LIST = process.argv.includes('--list');
const WANT_JSON = process.argv.includes('--json');
const src = fs.readFileSync(FILE, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true });

const DECL = ['FunctionDeclaration', 'VariableDeclaration', 'ClassDeclaration', 'EmptyStatement'];

// ── 어느 블록을 "분할 대상 최상위"로 볼 것인가 ────────────────────────────────
//   파일 전체가 IIFE 하나로 감싸여 있으면 **그 안**이 실질 최상위다.
//   (`client.js` 가 실제로 그렇다 — 이 도구가 그걸 먼저 말해 준다.)
function pickScope(body) {
  const stmts = body.filter((n) => n.type !== 'EmptyStatement');
  const iifes = stmts.filter((n) => n.type === 'ExpressionStatement'
    && n.expression.type === 'CallExpression'
    && ['ArrowFunctionExpression', 'FunctionExpression'].includes(n.expression.callee.type)
    && n.expression.callee.body && n.expression.callee.body.type === 'BlockStatement');
  // 파일 줄수의 절반 이상을 차지하는 IIFE 가 있으면 그것이 실질 최상위다
  const total = body.length ? body[body.length - 1].loc.end.line : 1;
  const big = iifes.find((n) => (n.loc.end.line - n.loc.start.line) > total * 0.5);
  return big
    ? { body: big.expression.callee.body.body, wrapped: true, at: [big.loc.start.line, big.loc.end.line] }
    : { body, wrapped: false, at: null };
}
const scope = pickScope(ast.body);

// ── 선언 이름 → 선언된 줄 ────────────────────────────────────────────────────
const declLine = new Map();
for (const n of scope.body) {
  if (n.type === 'FunctionDeclaration' && n.id) declLine.set(n.id.name, n.loc.start.line);
  if (n.type === 'ClassDeclaration' && n.id) declLine.set(n.id.name, n.loc.start.line);
  if (n.type === 'VariableDeclaration') {
    for (const d of n.declarations) collectPattern(d.id, (nm) => declLine.set(nm, n.loc.start.line));
  }
}
function collectPattern(p, add) {
  if (!p) return;
  if (p.type === 'Identifier') return add(p.name);
  if (p.type === 'ObjectPattern') return p.properties.forEach((q) => collectPattern(q.value || q.argument, add));
  if (p.type === 'ArrayPattern') return p.elements.forEach((q) => collectPattern(q, add));
  if (p.type === 'AssignmentPattern') return collectPattern(p.left, add);
  if (p.type === 'RestElement') return collectPattern(p.argument, add);
}

// ── 한 노드가 참조하는 식별자 모으기(선언·프로퍼티 키·라벨 제외) ─────────────
function idsOf(node) {
  const out = new Set();
  (function walk(n, parent) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'Identifier') {
      const skip = parent && (
        (parent.type === 'MemberExpression' && parent.property === n && !parent.computed)
        || (parent.type === 'Property' && parent.key === n && !parent.computed)
        || ['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(parent.type)
        || (parent.type === 'MethodDefinition' && parent.key === n && !parent.computed));
      if (!skip) out.add(n.name);
      return;
    }
    for (const k in n) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'range') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, n));
      else if (v && typeof v.type === 'string') walk(v, n);
    }
  })(node, null);
  return out;
}

// ── 감사 — 실행문마다 "자기 뒤에 선언된 이름을 참조하는가" ───────────────────
const execs = scope.body.filter((n) => !DECL.includes(n.type));
const rows = [];
for (const n of execs) {
  const line = n.loc.start.line;
  const late = [];
  for (const nm of idsOf(n)) {
    const dl = declLine.get(nm);
    if (dl !== undefined && dl > line) late.push({ name: nm, at: dl });
  }
  late.sort((a, b) => a.at - b.at);
  rows.push({ line, endLine: n.loc.end.line, type: n.type, late,
              head: src.slice(n.start, n.start + 90).split('\n')[0] });
}
const risky = rows.filter((r) => r.late.length);

const summary = {
  file: FILE,
  totalLines: src.split('\n').length,
  wrappedInIIFE: scope.wrapped,
  iifeAt: scope.at,
  realTopLevelStatements: scope.body.length,
  functionDecls: scope.body.filter((n) => n.type === 'FunctionDeclaration').length,
  declaredNames: declLine.size,
  execStatements: execs.length,
  execWithLateRefs: risky.length,
  lateRefTotal: risky.reduce((a, r) => a + r.late.length, 0),
};

if (WANT_JSON) { console.log(JSON.stringify({ summary, risky }, null, 2)); process.exit(0); }

console.log(`\n=== 분할 감사 — ${FILE}`);
console.log(`  파일 ${summary.totalLines}줄`);
if (scope.wrapped) {
  console.log(`  ★★이 파일은 **IIFE 로 감싸여 있다**(L${scope.at[0]}–L${scope.at[1]}).`);
  console.log('     ⇒ 아래 "최상위"는 전역이 아니라 **그 클로저 안**이다.');
  console.log('     ⇒ classic <script> 로 잘라 나누면 조각들이 **서로 다른 클로저**가 되어 참조가 끊긴다.');
  console.log('       (껍데기를 벗기지 않는 한 단순 분할은 불가능하다 — 설계 판단이라 회부 대상.)');
}
console.log(`  실질 최상위 문장 ${summary.realTopLevelStatements} · function 선언 ${summary.functionDecls} · 선언 이름 ${summary.declaredNames}`);
console.log(`  실행문 ${summary.execStatements}개 중 **뒤에 선언된 이름을 참조하는 것 ${summary.execWithLateRefs}개** (뒤 참조 ${summary.lateRefTotal}건)`);
console.log('  ⇒ 분할하면 이 실행문들은 마지막 조각(99-main.js)으로 옮겨야 한다(원문 순서 유지).');
if (WANT_LIST) {
  console.log('\n  뒤 참조 실행문 전수:');
  for (const r of risky) {
    console.log(`   L${String(r.line).padStart(6)}  ${JSON.stringify(r.head).slice(0, 76)}`);
    console.log(`            ↳ ${r.late.slice(0, 6).map((x) => `${x.name}@L${x.at}`).join(' ')}${r.late.length > 6 ? ` …외 ${r.late.length - 6}` : ''}`);
  }
} else {
  console.log('  (전수는 --list)');
}
console.log('');

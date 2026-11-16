'use strict';
// (@regress 없음 — 러너 밖 · 공용 자 · 제품 무변)
// === scripts/lib-cut-run.js — 제품 함수를 **잘라 돌리는** 자 (T1339 · T1328 회부 2 — 글자 핀 → 뜻 단언 다음 차례) =====================
//
// ★왜: `test-move-soa` ⑧ · ㉓ · `test-t1180-produce-defaults` 같은 하네스는 제품 함수를 정규식으로 떠 `new Function('이름', '이름', …)` 에 넣고 돌렸다.
//   그 **이름 목록**을 손으로 적었다 — 착지가 그 함수에 손잡이 하나(`T1294_ARRIVED_PATH` · `_t1295Stale` · `T1322_PF` · `T1320_ROCK_PATH` …)를 더하면
//   ReferenceError 로 빨개지고 PM 이 착지마다 손으로 이름을 더했다(land1074 · 1075 · 1077). 줄 글자 핀(`/const _skip = T370_PATH_REUSE && needPath/`)도 같은 꼴로 깨졌다.
// ★이 자:
//   · `cut(file, name)` — acorn 으로 파일을 읽어 **그 이름의 함수 선언**(또는 `const 이름 = …` 한 선언)을 바이트 그대로 잘라 준다(사본 0 · 정규식 0).
//   · `run(src, known, names)` — 자른 글자를 vm 에서 돌리고 `names` 를 꺼내 준다. 글자가 부르는 자유 이름은 acorn 으로 찾아(`lib-headless-day.freeNames`)
//     `known` 에 있으면 그 값 · 없으면 **끔 쪽 기본**(대문자 상수 = undefined · 그 밖 = 아무것도 안 하고 undefined 를 돌려주는 함수)을 준다.
//     새 손잡이가 끼어도 끔 쪽으로 돌아 "끔 = 종전" 을 그대로 묻는다 — 그 이름은 `.unknown` 에 남아 하네스가 줄에 찍는다(판정 밖).
//   · `decl(file, name)` — `const 이름 = <식>;` 의 식을 env 를 바꿔 가며 값으로 묻는다(손잡이 기본 · 되돌림을 글자 대신 값으로).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const _ast = new Map();
function parsed(file) {
  const f = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!_ast.has(f)) {
    const src = fs.readFileSync(f, 'utf8');
    const ast = require('acorn').parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true });
    _ast.set(f, { src, ast });
  }
  return _ast.get(f);
}
//   최상위 선언 하나를 이름으로 — 함수 선언이면 그 함수 · `const|let|var 이름 = …` 이면 그 선언문 전체(같은 문의 다른 이름도 따라온다)
function cut(file, name) {
  const { src, ast } = parsed(file);
  for (const n of ast.body) {
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) return src.slice(n.start, n.end);
    if (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id.type === 'Identifier' && d.id.name === name)) return src.slice(n.start, n.end);
  }
  throw new Error(`${path.basename(file)} 에 최상위 \`${name}\` 이 없다`);
}
//   함수 안 한 토막 — 함수 `fnName` 몸 안 **같은 블록**에서 `first` 를 선언한 문부터 `last` 를 선언한 문 끝까지(바이트 그대로 · 사이 문 포함)
//   `fnName` 이 null 이면 파일 전체에서 찾는다(이름 없는 틱 고리 `setInterval(() => { … })` 안 토막) · `last` 가 수(n)면 `first` 선언문 뒤 문 n 개까지
function inner(file, fnName, first, last) {
  const { src, ast } = parsed(file);
  const fn = fnName == null ? { body: ast } : ast.body.find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === fnName);
  if (!fn) throw new Error(`최상위 함수 \`${fnName}\` 이 없다`);
  const declares = (st, nm) => st && st.type === 'VariableDeclaration' && st.declarations.some((d) => d.id.type === 'Identifier' && d.id.name === nm);
  let hit = null;
  const walk = (n) => {
    if (hit || !n || typeof n.type !== 'string') return;
    const arr = Array.isArray(n.body) ? n.body : null;
    if (arr) { const i = arr.findIndex((st) => declares(st, first)), j = typeof last === 'number' ? (i >= 0 && i + last < arr.length ? i + last : -1) : arr.findIndex((st) => declares(st, last));
      if (i >= 0 && j >= i) { hit = src.slice(arr[i].start, arr[j].end); return; } }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object' && v.type) walk(v); }
  };
  walk(fn.body);
  if (!hit) throw new Error(`\`${fnName}\` 안 같은 블록에 \`${first}\` … \`${last}\` 선언이 없다`);
  return hit;
}
//   객체 칸 하나의 값 글자 — 파일 안 첫 `키: 값` (예: 존이 마을에 넘기는 deps 칸 `t312FishTargetAt: (p,spot) => …`) · 배선을 글자 대신 값으로 돌려 보려고
function prop(file, key) {
  const { src, ast } = parsed(file);
  let hit = null;
  const walk = (n) => {
    if (hit || !n || typeof n.type !== 'string') return;
    if (n.type === 'Property' && !n.computed && ((n.key.type === 'Identifier' && n.key.name === key) || (n.key.type === 'Literal' && n.key.value === key))) { hit = src.slice(n.value.start, n.value.end); return; }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object' && v.type) walk(v); }
  };
  walk(ast);
  if (!hit) throw new Error(`\`${key}:\` 칸이 없다`);
  return hit;
}
function has(file, name) { try { cut(file, name); return true; } catch (e) { return false; } }
function run(src, known, names) {
  known = known || {};
  const { freeNames } = require('./lib-headless-day');
  const ctx = {}, unknown = [];
  //   함수 매개 이름은 자유 이름이 아니다(`freeNames` 는 매개를 안 뺀다 — 여기서 뺀다)
  const params = new Set();
  { const w = (n) => { if (!n || typeof n.type !== 'string') return; if (/Function/.test(n.type)) for (const q of n.params || []) if (q.type === 'Identifier') params.add(q.name);
      for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(w); else if (v && typeof v === 'object' && v.type) w(v); } };
    w(require('acorn').parse('(function () {\n' + src + '\n})', { ecmaVersion: 'latest' })); }
  for (const n of freeNames('(function () {\n' + src + '\n})')) {
    if (params.has(n) && !(n in known)) continue;
    if (n in known) ctx[n] = known[n];
    else if (typeof globalThis[n] !== 'undefined') ctx[n] = globalThis[n];
    else { unknown.push(n); ctx[n] = /^[A-Z0-9_]+$/.test(n) ? undefined : function () { return undefined; }; }
  }
  for (const k of Object.keys(known)) if (!(k in ctx)) ctx[k] = known[k];
  vm.createContext(ctx);
  const ret = '\nglobalThis.__cut = { ' + names.map((x) => `${JSON.stringify(x)}: (typeof ${x} === 'undefined' ? undefined : ${x})`).join(', ') + ' };';
  new vm.Script(src + ret).runInContext(ctx);
  const out = ctx.__cut; Object.defineProperty(out, 'unknown', { value: unknown, enumerable: false });
  return out;
}
//   `const 이름 = <식>;` — 식 하나를 env 를 바꿔 값으로(아이 프로세스 0 · `process.env` 만 갈아 끼운 판)
function decl(file, name, env) {
  const s = cut(file, name);
  const fake = { env: Object.assign({}, env || {}) };
  const ctx = vm.createContext({ process: fake });
  return new vm.Script(s.replace(/^const /, 'var ') + `\n;${name}`).runInContext(ctx);
}
module.exports = { cut, inner, prop, has, run, decl, parsed };

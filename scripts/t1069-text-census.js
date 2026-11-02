#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1069 계측기 · 읽기만 · 제품 무변 · 판정 0)
// === scripts/t1069-text-census.js — 사람에게 보이는 글자 전수(말투 갈래) ===
//
// 쓰는 법:
//   node scripts/t1069-text-census.js              → 파일마다 말투 갈래 표(markdown)
//   node scripts/t1069-text-census.js --rows [파일…] → 한 줄 한 문구(파일:줄 · 자리 · 갈래 · 지금 문장)
//   node scripts/t1069-text-census.js --emoji      → 문구 안 이모지 남은 자리
//
// 무엇을 세나: 서버 `server/*.js` · 클라 `public/client/*.js` · `public/index.html` 의 인라인 스크립트 —
//   **한글이 든 문자열 · 템플릿 리터럴** 가운데 주석 · 로그(console.*) · 객체 키 · require · 비교(=== '…')
//   · switch case · 정규식은 뺀다(사람에게 안 보이거나, 문장이 아니라 열쇠다).
// 말투 갈래(설계/설계_문구_말투.md 의 표):
//   하십시오 — ~니다 · ~니까 · ~십시오 · ~습니다
//   해요     — ~요 · ~죠 · ~세요 (11-02 고침으로 버린 말투)
//   해라     — ~다 · ~라 · ~자 로 끝나는 평서 · 명령(니다 빼고)
//   하오하게 — ~오 · ~소 · ~게 · ~네 · ~세 · ~일세 · ~구먼 (NPC 자리만 정본)
//   명사형   — 끝맺음 없는 이름 · 상태(정본: 버튼 · 탭 · 표 머리 · "~하는 중")
//   음슴     — 띄어 쓴 구절이 "~없음 · ~못함 · ~됨 · ~필요" 로 끝남(알림 자리면 고칠 것 · 상태 칸이면 정본)
//   기계     — 화살표(→) · "불가" · "~시 ~획득" 꼴(어느 자리에서도 고칠 것)
// ★판정 0: 갈래는 끝맺음 글자만 본다. 그 자리가 NPC 대사인지 버튼인지는 사람이 본다(보고 표).
const fs = require('fs');
const path = require('path');
const acorn = require(path.join(__dirname, '..', 'node_modules', 'acorn'));
const ROOT = path.join(__dirname, '..');

const HANGUL = /[가-힣]/;
const EMO = /\p{Extended_Pictographic}/u;

function files(argv) {
  if (argv.length) return argv;
  const out = [];
  for (const d of ['server', 'public/client']) for (const f of fs.readdirSync(path.join(ROOT, d)).sort()) if (f.endsWith('.js')) out.push(d + '/' + f);
  out.push('public/index.html');
  return out;
}

function parse(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const chunks = [];
  if (rel.endsWith('.html')) {
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let m;
    while ((m = re.exec(src))) { const line0 = src.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1; chunks.push({ code: m[1], line0 }); }
  } else chunks.push({ code: src.replace(/^#!.*/, ''), line0: 0 });
  const asts = [];
  for (const c of chunks) {
    let ast = null;
    for (const sourceType of ['script', 'module']) {
      try { ast = acorn.parse(c.code, { ecmaVersion: 'latest', sourceType, locations: true, allowReturnOutsideFunction: true, allowHashBang: true }); break; } catch (e) { ast = null; }
    }
    if (ast) asts.push({ ast, line0: c.line0 });
  }
  return asts;
}

// 부모 사슬을 들고 걷는다(acorn-walk 없이)
function walk(node, parents, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parents);
  parents.push(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) for (const x of v) { if (x && typeof x.type === 'string') walk(x, parents, visit); }
    else if (v && typeof v.type === 'string') walk(v, parents, visit);
  }
  parents.pop();
}

const calleeName = (c) => {
  if (!c) return '';
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression') return calleeName(c.object) + '.' + (c.property.name || c.property.value || '?');
  return '';
};

// 이 문자열이 사람에게 보이는 자리인가 · 보인다면 어느 자리인가
function place(node, parents) {
  let child = node;
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i];
    if (p.type === 'Property' && p.key === child && !p.computed) return null;               // 객체 키
    if (p.type === 'Property' && p.value === child) {
      const k = p.key.name || p.key.value || '';
      if (/^(id|key|type|kind|code|cmd|verb|cls|class|icon|sfx|font|color|fill|stroke|src|href|url|path|re)$/.test(k)) return null;
      return 'prop:' + k;
    }
    if (p.type === 'BinaryExpression' && /^(===|!==|==|!=|in|instanceof)$/.test(p.operator)) return null;   // 비교 열쇠
    if (p.type === 'SwitchCase' && p.test === child) return null;
    if (p.type === 'MemberExpression' && p.property === child && p.computed) return null;    // obj['키']
    if (p.type === 'CallExpression' || p.type === 'NewExpression') {
      const n = calleeName(p.callee);
      if (/^console\.|(^|\.)(log|warn|debug|trace|dbg|info)$/.test(n)) return null;
      if (/^(require|RegExp)$|\.(startsWith|endsWith|includes|indexOf|split|test|match|replace|replaceAll|has|get|delete|getElementById|querySelector|querySelectorAll|getItem|setItem|removeItem)$/.test(n) && p.callee !== child) return null;
      if (p.type === 'NewExpression' && /Error$/.test(n)) return 'throw';
      return 'call:' + (n.split('.').pop() || '?');
    }
    if (p.type === 'ReturnStatement') return 'return';
    if (p.type === 'AssignmentExpression' && p.right === child) {
      const n = calleeName(p.left); return 'set:' + (n.split('.').pop() || '?');
    }
    if (p.type === 'VariableDeclarator' && p.init === child) return 'var:' + (p.id.name || '?');
    if (p.type === 'ArrayExpression') return 'array';
    if (p.type === 'ThrowStatement') return 'throw';
    if (p.type === 'ExpressionStatement') return null;   // 'use strict' 같은 홀로 선 글자
    child = p;
  }
  return 'other';
}

function textOf(node) {
  if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : null;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? '{…}' : '')).join('');
  return null;
}

// 말투 갈래 — 마지막 문장의 끝맺음만 본다(여러 문장이면 문장마다 보고 섞였으면 '섞임')
function toneOf(s) {
  const t = String(s).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\{…\}/g, '○').replace(/[○\s]+$/, '').trim();
  if (/→|←|⇒/.test(t) || /불가(능)?\b|불가$|불가[ .,·)]/.test(t) || /\S시 \S+ 획득/.test(t)) return '기계';
  const sents = t.split(/(?<=[.!?。…])\s+|\n+/).map((x) => x.replace(/[\s.!?。…'"’”)\]·:;,~]+$/u, '').trim()).filter((x) => HANGUL.test(x));
  if (!sents.length) return '명사형';
  const kinds = new Set(sents.map((x) => {
    if (/(니다|니까|십시오|습니까|십니까|세요\?)$/.test(x) && !/세요$/.test(x)) return '하십시오';
    if (/(요|죠|세요)$/.test(x)) return '해요';
    if (/(일세|구먼|구려|하게|하오|이오|겠소|했소|있소|없소|라오|다오|시오|소|게|네|세|오)$/.test(x) && !/(위로|대로|으로|로오|모르게|빠르게|크게|작게|쉽게|어렵게|이게|그게|저게|무게|가게|게게)$/.test(x)) return '하오하게';
    if (/(다|라|자|냐|니|까|지)$/.test(x)) return '해라';
    if (/\s/.test(x) && /(없음|못함|안 됨|됨|함|음|짐|김|림|켜짐|꺼짐|불충족|실패|요망|필요)$/.test(x)) return '음슴';
    return '명사형';
  }));
  return kinds.size === 1 ? [...kinds][0] : '섞임';
}

function collect(rel) {
  const rows = [];
  for (const { ast, line0 } of parse(rel)) {
    walk(ast, [], (node, parents) => {
      if (node.type === 'Literal' && node.regex) return;
      const s = textOf(node);
      if (s == null || !HANGUL.test(s)) return;
      // 템플릿 안의 표현식 리터럴은 바깥 템플릿이 이미 셌다 — 하지만 파편이 따로 보이는 문장일 수도 있어 그대로 센다
      const pl = place(node, parents);
      if (!pl) return;
      rows.push({ file: rel, line: line0 + node.loc.start.line, place: pl, tone: toneOf(s), emoji: EMO.test(s), text: s.replace(/\s+/g, ' ').trim() });
    });
  }
  return rows;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const mode = argv[0] && argv[0].startsWith('--') ? argv.shift() : '--table';
  const all = [];
  for (const f of files(argv)) all.push(...collect(f));
  if (mode === '--rows') {
    console.log('| 파일:줄 | 자리 | 갈래 | 지금 문장 |');
    console.log('|---|---|---|---|');
    for (const r of all) console.log(`| \`${r.file}:${r.line}\` | ${r.place} | ${r.tone}${r.emoji ? ' · 이모지' : ''} | ${r.text.replace(/\|/g, '\\|').slice(0, 160)} |`);
  } else if (mode === '--emoji') {
    for (const r of all.filter((x) => x.emoji)) console.log(`${r.file}:${r.line}\t${r.place}\t${r.text.slice(0, 120)}`);
  } else if (mode === '--json') {
    console.log(JSON.stringify(all));
  } else {
    const T = ['하십시오', '해요', '해라', '하오하게', '음슴', '명사형', '기계', '섞임'];
    const by = new Map();
    for (const r of all) { const m = by.get(r.file) || Object.fromEntries([...T.map((k) => [k, 0]), ['emoji', 0], ['n', 0]]); m[r.tone]++; m.n++; if (r.emoji) m.emoji++; by.set(r.file, m); }
    console.log(`| 파일 | 문구 | ${T.join(' | ')} | 이모지 |`);
    console.log(`|---|---|${T.map(() => '---').join('|')}|---|`);
    const tot = Object.fromEntries([...T.map((k) => [k, 0]), ['emoji', 0], ['n', 0]]);
    for (const [f, m] of [...by.entries()].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`| \`${f}\` | ${m.n} | ${T.map((k) => m[k]).join(' | ')} | ${m.emoji} |`);
      for (const k of Object.keys(tot)) tot[k] += m[k];
    }
    console.log(`| **합** | ${tot.n} | ${T.map((k) => tot[k]).join(' | ')} | ${tot.emoji} |`);
  }
}
module.exports = { collect, toneOf, files };

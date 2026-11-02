#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1069 고침 도구 · 문장만 바꾼다 · 동작 · 판정 · 값 무변)
// === scripts/t1069-apply.js — 고침표(`계측/T1069_고침표.txt`)대로 문장을 바꾼다 ===
//
// 쓰는 법:
//   node scripts/t1069-apply.js            → 고침표를 적용(옛 문장이 없으면 그 쌍은 "이미 적용 · 또는 못 찾음")
//   node scripts/t1069-apply.js --check    → 적용 상태만 본다(옛 문장 남음 n · 새 문장 없음 n — 둘 다 0 이어야 초록)
//   node scripts/t1069-apply.js --harness  → 옛 문장 조각을 하네스(scripts/ · test-e2e.js)에서 찾는다(문장이 계약인 곳)
//
// 고침표 꼴(한 쌍 = 두 줄):
//   @@ <파일>          ← 이하 쌍의 파일
//   - <옛 소스 조각>   ← 파일 안 글자 그대로(따옴표 · ${…} 포함 가능)
//   + <새 소스 조각>
//   # …                ← 설명(무시)
// ★옛 조각이 여러 번 나오면 모두 바꾼다(같은 문장은 같은 고침). 바꾼 횟수를 찍는다.
// ★옛 조각과 새 조각의 코드 골격(따옴표 · ${…} 식)이 다르면 거부한다 — 문장만 바꾸는 도구다(식은 뺄 수만 있다).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
// 표는 둘: 제품 문장(`T1069_고침표.txt`) · 하네스 단언(`T1069_하네스고침.txt` — 문장이 계약인 곳만 새 문장으로)
const TABLE = path.join(ROOT, process.argv.find((a) => /\.txt$/.test(a)) || path.join('계측', 'T1069_고침표.txt'));

function load() {
  const out = []; let file = null, old = null, ln = 0;
  for (const raw of fs.readFileSync(TABLE, 'utf8').split('\n')) {
    ln++;
    if (raw.startsWith('@@ ')) { file = raw.slice(3).trim(); continue; }
    if (raw.startsWith('- ')) { old = raw.slice(2); continue; }
    if (raw.startsWith('+ ')) {
      if (old == null || !file) throw new Error(`고침표 ${ln}줄: 짝 없는 + 줄`);
      out.push({ file, old, neu: raw.slice(2), ln }); old = null; continue;
    }
  }
  return out;
}

// 코드 골격 — 따옴표 안 글자 밖의 것. 고침 전후가 같아야 한다(문장만 바꾼다).
//   ${…} 안 식과 따옴표 종류 · 개수를 본다.
//   ★새 쪽의 ${…} 는 옛 쪽 ${…} 의 부분집합이어야 한다(숫자를 빼거나 어순을 바꾸는 것은 되고 · 새 식을 넣는 것은 안 된다).
function exprsOf(s) { const e = []; String(s).replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, (m) => { e.push(m); return ''; }); return e; }
function bare(s) { return String(s).replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ''); }
function sameSkeleton(o, n) {
  const qo = (bare(o).match(/['"`]/g) || []).join(''), qn = (bare(n).match(/['"`]/g) || []).join('');
  if (qo !== qn) return false;
  // 식 안의 한글 글자(따옴표 안)는 문장이다 — 자리표로 접어서 견준다. 식의 순서는 바뀌어도 된다(어순).
  const norm = (e) => e.replace(/'[^'\n]*[가-힣][^'\n]*'/g, "'○'").replace(/"[^"\n]*[가-힣][^"\n]*"/g, '"○"').replace(/`[^`]*[가-힣][^`]*`/g, '`○`');
  const pool = exprsOf(o).map(norm);
  for (const x of exprsOf(n).map(norm)) { const i = pool.indexOf(x); if (i < 0) return false; pool.splice(i, 1); }
  return true;
}

const mode = process.argv.slice(2).find((a) => a.startsWith('--')) || '--apply';
const pairs = load();
let bad = 0;
if (mode === '--apply' || mode === '--check') {
  const src = new Map();
  const get = (f) => { if (!src.has(f)) src.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8')); return src.get(f); };
  let applied = 0, already = 0, oldLeft = 0, newMissing = 0;
  for (const p of pairs) {
    if (!sameSkeleton(p.old, p.neu)) { console.log(`  ✗ ${p.file} (표 ${p.ln}줄) 코드 골격이 다르다 — 문장만 바꿀 것\n      - ${p.old}\n      + ${p.neu}`); bad++; continue; }
    let s = get(p.file);
    const n = s.split(p.old).length - 1;
    if (mode === '--apply') {
      if (n) { s = s.split(p.old).join(p.neu); src.set(p.file, s); applied += n; }
      else if (s.includes(p.neu)) already++;
      else { console.log(`  ✗ ${p.file} (표 ${p.ln}줄) 못 찾음: ${p.old.slice(0, 90)}`); bad++; }
    } else {
      if (n && !p.neu.includes(p.old)) { oldLeft++; console.log(`  ✗ 옛 문장 남음 ${p.file}: ${p.old.slice(0, 90)}`); }
      if (!s.includes(p.neu)) { newMissing++; console.log(`  ✗ 새 문장 없음 ${p.file}: ${p.neu.slice(0, 90)}`); }
    }
  }
  if (mode === '--apply') {
    for (const [f, s] of src) fs.writeFileSync(path.join(ROOT, f), s);
    console.log(`고침표 ${pairs.length}쌍 · 바꾼 자리 ${applied} · 이미 적용 ${already} · 못 찾음/거부 ${bad}`);
  } else {
    bad += oldLeft + newMissing;
    console.log(`고침표 ${pairs.length}쌍 · 옛 문장 남음 ${oldLeft} · 새 문장 없음 ${newMissing} · 골격 다름 ${bad - oldLeft - newMissing}`);
  }
  process.exit(bad ? 1 : 0);
} else if (mode === '--contract') {
  // ★거꾸로 본다: 하네스의 정규식 · includes 글자에서 한글 조각을 뽑아, 그 조각이 **옛 문장에만** 있으면 찍는다.
  //   (--harness 는 옛 문장 덩이를 하네스에서 찾는다 — 짧은 조각 /살지 않는다/ 같은 것을 놓친다.)
  const acorn = require(path.join(ROOT, 'node_modules', 'acorn'));
  const hfiles = fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.js') && !/^t1069-/.test(f)).map((f) => 'scripts/' + f).concat(['test-e2e.js']);
  let hits = 0;
  // 제품 글자 전체(적용 뒤) — 조각이 아직 제품 어딘가에 있으면 그 단언은 다른 문장을 잡는 것일 수 있다(찍지 않는다)
  const prod = ['server', 'public/client'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((x) => x.endsWith('.js')).map((x) => fs.readFileSync(path.join(ROOT, d, x), 'utf8'))).join('\n');
  for (const f of hfiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    let ast; try { ast = acorn.parse(src.replace(/^#!.*/, ''), { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true }); } catch (e) { try { ast = acorn.parse(src.replace(/^#!.*/, ''), { ecmaVersion: 'latest', sourceType: 'module', locations: true }); } catch (e2) { continue; } }
    const frags = [];
    (function walk(n, parent) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'Literal' && n.regex) frags.push({ line: n.loc.start.line, parts: n.regex.pattern.split('|') });
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && /^(includes|indexOf|startsWith|endsWith)$/.test(n.callee.property.name || '') && n.arguments[0] && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string') frags.push({ line: n.loc.start.line, parts: [n.arguments[0].value] });
      for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach((x) => walk(x, n)); else if (v && typeof v.type === 'string') walk(v, n); }
    })(ast, null);
    for (const fr of frags) for (const raw of fr.parts) {
      const part = raw.replace(/\\(.)/g, '$1').replace(/[\^$]/g, '');
      // 정규식 기호가 섞인 조각은 한글 덩이로만 본다
      for (const run of part.match(/[가-힣][가-힣 ]*[가-힣]/g) || []) {
        if (run.replace(/ /g, '').length < 3) continue;
        const p = pairs.find((q) => q.old.includes(run) && !q.neu.includes(run));
        if (p && !pairs.some((q) => q.neu.includes(run)) && (process.argv.includes("--all") || !prod.includes(run))) { hits++; console.log(`${f}:${fr.line}\t/${run}/\t← ${p.file}: ${p.neu.slice(0, 80)}`); }
      }
    }
  }
  console.log(`하네스 단언 조각이 옛 문장에만 있는 자리 ${hits}`);
} else if (mode === '--harness') {
  const hfiles = fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.js') && !/^t1069-/.test(f)).map((f) => 'scripts/' + f).concat(['test-e2e.js']);
  // 주석 줄(// …)은 뺀다 — 옛 문장을 이야기하는 설명은 계약이 아니다
  const htext = hfiles.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')]);
  let hits = 0;
  for (const p of pairs) {
    // 옛 조각의 한글 덩이(4자 이상 · 띄어쓰기 포함) 가운데 새 조각에 없는 것
    const runs = (p.old.match(/[가-힣][가-힣 ]{3,}[가-힣]/g) || []).filter((r) => !p.neu.includes(r) && r.replace(/ /g, '').length >= 5);
    for (const r of runs) for (const [f, t] of htext) {
      for (const line of t.split('\n')) if (line.includes(r)) { hits++; console.log(`${f}\t${r}\t← ${p.file}\t${line.trim().slice(0, 200)}`); }
    }
  }
  console.log(`하네스에 옛 문장 조각이 남은 자리 ${hits}`);
}

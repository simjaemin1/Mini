#!/usr/bin/env node
// T893 — 라이브(이미지 커밋)와 지금 main 의 손잡이 기본값 글자 대조(일회용 · 러너 밖 · @regress 아님 · 제품 무접촉 · 판정 0).
// 쓰기: node scripts/t893-live-knobs.js <이미지커밋> [HEAD]   → JSON 한 줄씩이 아니라 표(markdown 줄)를 낸다.
const { execSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const A = process.argv[2], B = process.argv[3] || 'HEAD';
if (!A) { console.error('이미지 커밋을 주라'); process.exit(2); }
const root = path.join(__dirname, '..');
function snap(rev) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 't893-'));
  execSync(`git -C ${root} archive ${rev} server sim public | tar -x -C ${d}`, { stdio: ['ignore', 'ignore', 'inherit'] });
  return d;
}
function kinds(dir) {
  const out = {}; // name -> Set(kind)
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'assets') walk(p); continue; }
      if (!/\.(js|mjs)$/.test(e.name) || /browser\.js$/.test(e.name) || /bundle/.test(e.name)) continue;
      for (const t of fs.readFileSync(p, 'utf8').split('\n')) {
        const re = /process\.env\.(T\d+[A-Z0-9_]*)\s*([!=]==?)\s*(['"])([01])\3/g; let m, any = false;
        while ((m = re.exec(t))) {
          any = true;
          const k = (m[2][0] === '!' ? (m[4] === '0' ? 'ON' : 'OFF') : (m[4] === '1' ? 'OFF' : 'ON'));
          (out[m[1]] = out[m[1]] || new Set()).add(k);
        }
        const re2 = /process\.env\.(T\d+[A-Z0-9_]*)/g;
        while ((m = re2.exec(t))) { if (!out[m[1]]) out[m[1]] = new Set(); }
      }
    }
  };
  walk(dir); return out;
}
const da = snap(A), db = snap(B);
const ka = kinds(da), kb = kinds(db);
const verdict = s => !s ? '없음' : (s.size === 0 ? '비정형' : (s.size > 1 ? '섞임' : [...s][0]));
const names = [...new Set([...Object.keys(ka), ...Object.keys(kb)])].sort((x, y) => parseInt(x.slice(1)) - parseInt(y.slice(1)) || (x < y ? -1 : 1));
const rows = names.map(n => ({ n, a: verdict(ka[n]), b: verdict(kb[n]) }));
const cnt = {};
rows.forEach(r => { const k = r.a + '→' + r.b; cnt[k] = (cnt[k] || 0) + 1; });
console.log('## 요약(이미지 ' + A + ' → ' + B + ')');
Object.entries(cnt).sort((x, y) => y[1] - x[1]).forEach(([k, v]) => console.log(k, v));
console.log('## ON→ON (라이브에 실린 켬 기본)');
console.log(rows.filter(r => r.a === 'ON' && r.b === 'ON').map(r => r.n).join(' '));
console.log('## 이미지엔 끔/없음 → 지금 ON (아직 안 실린 켬 기본)');
rows.filter(r => r.b === 'ON' && r.a !== 'ON').forEach(r => console.log(r.n, r.a + '→ON'));
console.log('## 이미지 ON → 지금 ON 아님');
rows.filter(r => r.a === 'ON' && r.b !== 'ON').forEach(r => console.log(r.n, 'ON→' + r.b));
fs.rmSync(da, { recursive: true, force: true }); fs.rmSync(db, { recursive: true, force: true });

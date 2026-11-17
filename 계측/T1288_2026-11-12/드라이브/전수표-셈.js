// T1288 전수 표 다시 만들기 — origin/main…HEAD 의 scripts/*.js 차이에서 파일마다 한 일을 읽는다
const { execSync } = require('child_process');
const fs = require('fs');
const R = '/home/user/Mini';
const LF = require(R + '/scripts/lib-fixed-ports.js');
const BASE = execSync('git merge-base origin/main HEAD', { cwd: R, encoding: 'utf8' }).trim();
const num = execSync(`git diff --numstat ${BASE} HEAD -- scripts/`, { cwd: R, encoding: 'utf8' }).trim().split('\n').map((l) => l.split('\t'));
const NEWTOOLS = new Set(['scripts/lib-fixed-ports.js', 'scripts/t1288-par.js', 'scripts/t1288-net-log.js', 'scripts/test-harness-lint.js', 'scripts/test-lib-port.js', 'scripts/lib-port.js', 'scripts/run-regress.sh', 'scripts/browser-driver.js', 'scripts/e2e-browser.js']);
const rows = [], tally = { files: 0, hold: 0, noCentral: 0, portLines: 0, portFiles: 0, displays: 0, alone: 0, loose: 0, regress: 0 };
for (const [add, del, f] of num) {
  if (!f.endsWith('.js')) continue;
  const d = execSync(`git diff -U0 ${BASE} HEAD -- "${f}"`, { cwd: R, encoding: 'utf8', maxBuffer: 1 << 26 });
  const plus = d.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  const minus = d.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
  const src = fs.existsSync(R + '/' + f) ? fs.readFileSync(R + '/' + f, 'utf8') : '';
  const did = [];
  const h = plus.map((l) => /lib-port'\)\.hold\(([^)]*)\)/.exec(l)).find(Boolean);
  if (h) { did.push('hold ' + h[1].replace(/\s/g, '')); tally.hold++; }
  else if (minus.some((l) => /lib-port'\)\.hold\(/.test(l)) && /lib-port'\)\.hold\(([^)]*)\)/.test(src)) did.push('hold 고침 ' + /lib-port'\)\.hold\(([^)]*)\)/.exec(src)[1].replace(/\s/g, ''));
  const addNC = plus.some((l) => /\.noCentral\(\)/.test(l)), delNC = minus.some((l) => /\.noCentral\(\)/.test(l));
  if (addNC && !delNC) { did.push('noCentral'); tally.noCentral++; } else if (delNC && !addNC) did.push('noCentral 뺌(띄우지 않음)');
  const pl = plus.filter((l) => /lib-port'\)\.port\(|\.ports\(/.test(l)).length - minus.filter((l) => /lib-port'\)\.port\(|\.ports\(/.test(l)).length;
  if (pl > 0) { did.push('port×' + pl); tally.portLines += pl; tally.portFiles++; }
  if (plus.some((l) => /\.displays\(/.test(l))) { did.push('displays'); tally.displays++; }
  if (plus.some((l) => /^\+\/\/ @regress-alone/.test(l))) { did.push('@regress-alone'); tally.alone++; }
  const loose = plus.filter((l) => /lib-port: 묶지 않음/.test(l)).length;
  if (loose) { did.push('묶지 않음×' + loose); tally.loose += loose; }
  if (NEWTOOLS.has(f) && !did.length) did.push('자 · 러너 · lint');
  const reg = /^\/\/ @regress\b/m.test(src.split('\n').slice(0, 40).join('\n'));
  let fixed = '—';
  try { const j = LF.judge(src); if (j.fixed && j.fixed.length) fixed = j.fixed.join(','); } catch (e) { /* */ }
  rows.push([f.replace('scripts/', ''), reg ? '●' : '', fixed, did.join(' · ') || '머리 줄 글 고침', `${del}→${add}`]);
  tally.files++; if (reg) tally.regress++;
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
const out = [
  `# T1288 전수 표 — 고정 포트 · X 화면 · central 없는 존(바꾼 파일마다)`, '',
  `· 베이스 = \`${BASE.slice(0, 9)}\`(origin/main 과 이 가지의 갈림점 · 2026-11-17 병합) · @regress = 머리 40줄의 \`// @regress\` · 고정 = 지금 파일이 쓰는 제품 고정 포트(존 설정 · central 3010 — \`lib-fixed-ports.judge\`)`,
  `· 한 일: hold = 머리 줄로 혼자 쥠 · noCentral = 닿지 않는 central 주소 · port×n = 제품 밖 고정 수를 장부로 옮긴 줄 수 · displays = X 화면 번호 · @regress-alone = 러너 -j 판에서 맨 먼저 혼자 · 묶지 않음 = 도커 env 픽스처 글자`,
  `· 셈: 바꾼 파일 ${tally.files}(@regress ${tally.regress}) · hold ${tally.hold} · noCentral ${tally.noCentral} · port 줄 ${tally.portLines}(파일 ${tally.portFiles}) · displays ${tally.displays} · alone ${tally.alone} · 묶지 않음 ${tally.loose}줄`, '',
  '| 파일 | @regress | 고정 포트 | 한 일 | 줄(−→+) |', '|---|:---:|---|---|---:|',
  ...rows.map((r) => `| \`${r[0]}\` | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} |`), ''];
fs.writeFileSync(process.argv[2], out.join('\n'));
console.log(JSON.stringify(tally));

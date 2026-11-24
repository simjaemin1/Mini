// T1474 — 커밋별 골든마스터 스캔. 자(지금 verify · 지금 원본)는 고정, battle-core.js 만 커밋마다 바꿔 낀다.
// 실행: node scripts/t1474-golden-scan.js [임시폴더]   → 계측/T1474/커밋표.md · 커밋표.json
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const TMP = process.argv[2] || '/tmp/t1474-scan';
const REF = 'origin/main';
const sh = (c, o) => cp.execSync(c, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, ...o });
const verify = fs.readFileSync(path.join(ROOT, 'sim/_battle-core-verify.js'));
const lab = fs.readFileSync(path.join(ROOT, 'lab/원본/전투실험실_0710.html'));
const CATS = ['청동편성', '석기편성', '궁수혼합', '시가전', '대칭', '대형', '숲', '장창', '원형', '종대'];
const NAME = { 대형: '방패벽' };
const log = sh(`git log --reverse --format='%h|%ad|%s' --date=short ${REF} -- sim/battle-core.js`).trim().split('\n');
const rows = [];
for (const l of log) {
  const [h, d, ...rest] = l.split('|'); const subj = rest.join('|');
  const dir = path.join(TMP, h);
  fs.mkdirSync(path.join(dir, 'sim'), { recursive: true }); fs.mkdirSync(path.join(dir, 'lab/원본'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sim/_battle-core-verify.js'), verify);
  fs.writeFileSync(path.join(dir, 'lab/원본/전투실험실_0710.html'), lab);
  fs.writeFileSync(path.join(dir, 'sim/battle-core.js'), sh(`git show ${h}:sim/battle-core.js`));
  const env = { ...process.env }; for (const k of ['T995_BACK_AMMO', 'T1019_UNTRAP', 'T874_BATTLE_FAST', 'T295_RATION_MRL']) delete env[k];
  const r = cp.spawnSync('node', [path.join(dir, 'sim/_battle-core-verify.js')], { encoding: 'utf8', env, maxBuffer: 1 << 28 });
  const out = r.stdout || '';
  const per = {}; let n = 0, tot = 0, exc = 0;
  for (const ln of out.split('\n')) {
    const m = ln.match(/시드\s*\d+:/); if (!m) continue;
    const cat = CATS.find(c => ln.startsWith(c)); if (!cat) continue;
    tot++; per[cat] = per[cat] || [0, 0]; per[cat][1]++;
    if (ln.includes('✓')) { n++; per[cat][0]++; }
    if (ln.includes('예외')) exc++;
  }
  const skipped = tot === 0;
  rows.push({ hash: h, date: d, subject: subj, card: (subj.match(/T\d{3,4}/) || ['-'])[0], match: n, total: tot, exit: r.status, exc, skipped, per, err: skipped ? (r.stderr || '').split('\n').slice(0, 2).join(' | ') : '' });
  console.error(h, d, n + '/' + tot, 'exit', r.status);
}
fs.writeFileSync(path.join(ROOT, '계측/T1474/커밋표.json'), JSON.stringify(rows, null, 1));
const short = s => s.replace(/^\[승인 대기 · T\d+\]\s*/, '').slice(0, 40);
let md = '# T1474 커밋별 골든마스터 (자 고정: 지금 verify · 지금 원본 · battle-core 만 갈아 낌 · 손잡이 env 비움)\n\n';
md += '| 커밋 | 날 | 제목 | 카드 | 맞음 | 종료 | ' + CATS.map(c => NAME[c] || c).join(' | ') + ' |\n|' + '---|'.repeat(6 + CATS.length) + '\n';
for (const r of rows) md += `| ${r.hash} | ${r.date} | ${short(r.subject)} | ${r.card} | ${r.skipped ? '건너뜀' : r.match + '/' + r.total} | ${r.exit} | ` + CATS.map(c => r.skipped ? '-' : (r.per[c] ? r.per[c][0] + '/' + r.per[c][1] : '-')).join(' | ') + ' |\n';
const ok = rows.filter(r => !r.skipped);
const green = ok.filter(r => r.match === r.total);
const lastGreen = green.length ? green[green.length - 1] : null;
const idx = lastGreen ? rows.indexOf(lastGreen) : -1;
const firstRed = rows.slice(idx + 1).find(r => !r.skipped && r.match < r.total);
md += `\n* 건너뜀 ${rows.filter(r => r.skipped).length}\n* 40/40 마지막 커밋: ${lastGreen ? lastGreen.hash + ' (' + lastGreen.date + ' ' + lastGreen.card + ')' : '없음'}\n* 첫 빨강(그 뒤 처음): ${firstRed ? firstRed.hash + ' (' + firstRed.date + ' ' + firstRed.card + ')' : '없음'}\n`;
md += '* 갈래별 첫 빨강(40/40 마지막 커밋 뒤 처음 그 갈래가 덜 맞는 커밋):\n';
for (const c of CATS) { const f = rows.slice(idx + 1).find(r => !r.skipped && r.per[c] && r.per[c][0] < r.per[c][1]); md += `  * ${NAME[c] || c}: ${f ? f.hash + ' ' + f.date + ' ' + f.card : '빨강 없음'}\n`; }
fs.writeFileSync(path.join(ROOT, '계측/T1474/커밋표.md'), md);

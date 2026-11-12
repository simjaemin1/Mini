'use strict';
// (@regress 없음 — 러너 밖 · T1281 증명 판 · 하네스 여덟을 홀로 한 번 · 동시에 네 번)
// === scripts/t1281-concurrent.js — 공용 포트 할당기 아래에서 하네스 여덟이 나란히 돌아도 갈리지 않는가 ==========
//   쓰는 법: node scripts/t1281-concurrent.js <출력 디렉터리> [판 수=4] [하네스…]
//   ① 홀로: 하네스마다 한 번씩 차례로(기준 결과) ② 동시: 여덟을 한꺼번에 띄우는 판을 네 번.
//   판마다 `LIB_PORT_LOG` 로 잡힌 범위를 모아 **같은 판 안에서 겹친 범위 수**를 센다 · 하네스 결과 줄 · 종료코드를 홀로 판과 맞댄다.
//   EADDRINUSE 가 출력에 한 번이라도 나오면 따로 센다.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const [OUT, ROUNDS0, ...LIST0] = process.argv.slice(2);
if (!OUT) { console.error('쓰는 법: node scripts/t1281-concurrent.js <출력 디렉터리> [판 수=4] [하네스…]'); process.exit(2); }
const ROUNDS = +ROUNDS0 || 4;
const LIST = LIST0.length ? LIST0 : ['test-body.js', 'test-carrier.js', 'test-crops.js', 'test-kcal.js', 'test-newcomers.js', 'test-preserve.js', 'test-salt.js', 'test-spoil2.js'];
fs.mkdirSync(OUT, { recursive: true });
const ENV = { TIDE_FREEZE_MS: '372603' };   // CI 단위 잡과 같은 물때 못(test-body ⑯㉧)
const summary = (txt) => { const L = txt.trim().split('\n').filter((l) => /PASS|FAIL|통과|실패|결과/.test(l)); return L.length ? L[L.length - 1].trim() : '(결과 줄 없음)'; };
function run(h, tag, log) {
  return new Promise((res) => {
    const t0 = Date.now();
    const c = spawn(process.execPath, [path.join('scripts', h)], { cwd: ROOT, env: Object.assign({}, process.env, ENV, { LIB_PORT_LOG: log }), stdio: ['ignore', 'pipe', 'pipe'] });
    let o = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; });
    const kill = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) { /* 이미 끝 */ } }, 600000);
    c.on('exit', (code, sig) => {
      clearTimeout(kill); fs.writeFileSync(path.join(OUT, `${tag}-${h.replace(/\.js$/, '')}.txt`), o);
      res({ h, code: code == null ? sig : code, sum: summary(o), inuse: (o.match(/EADDRINUSE/g) || []).length, sec: Math.round((Date.now() - t0) / 100) / 10 });
    });
  });
}
function clashes(log) {
  if (!fs.existsSync(log)) return { n: 0, clash: 0, pairs: [] };
  const R = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const pairs = [];
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
    const a = R[i], b = R[j]; if (a.lo < b.lo + b.n && b.lo < a.lo + a.n) pairs.push([a, b]);
  }
  return { n: R.length, ports: R.reduce((s, r) => s + r.n, 0), clash: pairs.length, pairs: pairs.slice(0, 5) };
}
(async () => {
  const res = { list: LIST, solo: [], rounds: [] };
  console.log(`① 홀로 — ${LIST.length}개 차례로`);
  const soloLog = path.join(OUT, 'solo.ports.jsonl'); try { fs.unlinkSync(soloLog); } catch (e) { /* 없음 */ }
  for (const h of LIST) { const r = await run(h, 'solo', soloLog); res.solo.push(r); console.log(`  ${h} rc=${r.code} ${r.sec}s · ${r.sum}`); }
  res.soloPorts = clashes(soloLog);
  for (let k = 1; k <= ROUNDS; k++) {
    const log = path.join(OUT, `r${k}.ports.jsonl`); try { fs.unlinkSync(log); } catch (e) { /* 없음 */ }
    const t0 = Date.now();
    const R = await Promise.all(LIST.map((h) => run(h, 'r' + k, log)));
    const C = clashes(log);
    const same = R.map((r, i) => r.code === res.solo[i].code && r.sum === res.solo[i].sum);
    res.rounds.push({ k, sec: Math.round((Date.now() - t0) / 1000), runs: R, ports: C, same: same.every(Boolean), diff: R.filter((r, i) => !same[i]).map((r) => r.h) });
    console.log(`② 동시 판 ${k}: ${Math.round((Date.now() - t0) / 1000)}s · 범위 ${C.n}(포트 ${C.ports}) · 겹침 ${C.clash} · EADDRINUSE ${R.reduce((s, r) => s + r.inuse, 0)} · 홀로와 같음 ${same.filter(Boolean).length}/${R.length}${same.every(Boolean) ? '' : ' · 다른 것 ' + R.filter((r, i) => !same[i]).map((r) => `${r.h}(${r.code} · ${r.sum})`).join(' ; ')}`);
  }
  fs.writeFileSync(path.join(OUT, '요약.json'), JSON.stringify(res, null, 1));
  const allSame = res.rounds.every((r) => r.same), clash = res.rounds.reduce((s, r) => s + r.ports.clash, 0);
  console.log(`\n=== 동시 ${LIST.length} × ${ROUNDS}판 · 겹침 ${clash} · 홀로와 같음 ${allSame ? '전부' : '아님'} ===`);
  process.exit(allSame && clash === 0 ? 0 : 1);
})();

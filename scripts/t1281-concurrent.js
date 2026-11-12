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
// 실제로 묶었나 — `listen` 이 열린 포트를 판 파일에 적는 미리 싣기(자식에도 NODE_OPTIONS 로 간다 · 판정 0 · 적기만)
const PRE = path.join(OUT, 'listen-log.js');
fs.writeFileSync(PRE, "const net=require('net');const fs=require('fs');const o=net.Server.prototype.listen;net.Server.prototype.listen=function(...a){this.once('listening',()=>{const ad=this.address();if(ad&&ad.port&&process.env.T1281_LISTEN_LOG)fs.appendFileSync(process.env.T1281_LISTEN_LOG,JSON.stringify({pid:process.pid,port:ad.port,h:process.env.T1281_HARNESS||'',t:Date.now()})+'\\n');});return o.apply(this,a);};\n");
const summary = (txt) => { const L = txt.trim().split('\n').filter((l) => /PASS|FAIL|통과|실패|결과/.test(l)); return L.length ? L[L.length - 1].trim() : '(결과 줄 없음)'; };
function run(h, tag, log, llog) {
  return new Promise((res) => {
    const t0 = Date.now();
    const c = spawn(process.execPath, [path.join('scripts', h)], { cwd: ROOT, env: Object.assign({}, process.env, ENV, { LIB_PORT_LOG: log, T1281_LISTEN_LOG: llog, T1281_HARNESS: h, NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' -r ' + PRE).trim() }), stdio: ['ignore', 'pipe', 'pipe'] });
    let o = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; });
    const kill = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) { /* 이미 끝 */ } }, 600000);
    c.on('exit', (code, sig) => {
      clearTimeout(kill); fs.writeFileSync(path.join(OUT, `${tag}-${h.replace(/\.js$/, '')}.txt`), o);
      res({ h, code: code == null ? sig : code, sum: summary(o), inuse: (o.match(/EADDRINUSE/g) || []).length, sec: Math.round((Date.now() - t0) / 100) / 10 });
    });
  });
}
function listens(llog) {   // 같은 판에서 **다른 하네스 둘**(자식은 env 로 하네스 이름을 물려받는다)이 같은 포트를 묶은 수 · 묶은 수
  if (!fs.existsSync(llog)) return { n: 0, dup: 0 };
  const R = fs.readFileSync(llog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const by = new Map(); for (const r of R) { if (!by.has(r.port)) by.set(r.port, new Set()); by.get(r.port).add(r.h || ('pid' + r.pid)); }
  return { n: R.length, ports: by.size, dup: [...by.values()].filter((s) => s.size > 1).length };
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
  const soloL = path.join(OUT, 'solo.listen.jsonl'); try { fs.unlinkSync(soloL); } catch (e) { /* 없음 */ }
  for (const h of LIST) { const r = await run(h, 'solo', soloLog, soloL); res.solo.push(r); console.log(`  ${h} rc=${r.code} ${r.sec}s · ${r.sum}`); }
  res.soloPorts = clashes(soloLog); res.soloListen = listens(soloL);
  console.log(`  홀로 묶음: 포트 ${res.soloListen.ports}(listen ${res.soloListen.n}) · 할당 ${res.soloPorts.n}`);
  for (let k = 1; k <= ROUNDS; k++) {
    const log = path.join(OUT, `r${k}.ports.jsonl`); try { fs.unlinkSync(log); } catch (e) { /* 없음 */ }
    const llog = path.join(OUT, `r${k}.listen.jsonl`); try { fs.unlinkSync(llog); } catch (e) { /* 없음 */ }
    const t0 = Date.now();
    const R = await Promise.all(LIST.map((h) => run(h, 'r' + k, log, llog)));
    const C = clashes(log), Ls = listens(llog);
    const same = R.map((r, i) => r.code === res.solo[i].code && r.sum === res.solo[i].sum);
    res.rounds.push({ k, sec: Math.round((Date.now() - t0) / 1000), runs: R, ports: C, listen: Ls, same: same.every(Boolean), diff: R.filter((r, i) => !same[i]).map((r) => r.h) });
    console.log(`② 동시 판 ${k}: ${Math.round((Date.now() - t0) / 1000)}s · 범위 ${C.n}(포트 ${C.ports}) · 겹침 ${C.clash} · 묶음 ${Ls.ports}(listen ${Ls.n} · 두 하네스 같은 포트 ${Ls.dup}) · EADDRINUSE ${R.reduce((s, r) => s + r.inuse, 0)} · 홀로와 같음 ${same.filter(Boolean).length}/${R.length}${same.every(Boolean) ? '' : ' · 다른 것 ' + R.filter((r, i) => !same[i]).map((r) => `${r.h}(${r.code} · ${r.sum})`).join(' ; ')}`);
  }
  fs.writeFileSync(path.join(OUT, '요약.json'), JSON.stringify(res, null, 1));
  const allSame = res.rounds.every((r) => r.same), clash = res.rounds.reduce((s, r) => s + r.ports.clash + r.listen.dup, 0);
  console.log(`\n=== 동시 ${LIST.length} × ${ROUNDS}판 · 겹침 ${clash} · 홀로와 같음 ${allSame ? '전부' : '아님'} ===`);
  process.exit(allSame && clash === 0 ? 0 : 1);
})();

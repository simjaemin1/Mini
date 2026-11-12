#!/usr/bin/env node
// @regress   ← 서버 0 · 자식 node 몇 개 · 수 초
// === scripts/test-lib-port.js — 하네스 포트 할당기 `lib-port` [T1281] ==========
//   ① 열여섯이 **동시에** 잡아도 범위가 안 겹친다 · 띠 안 · 나가면 장부가 빈다
//   ② 같은 key = 같은 포트 · 다른 key = 다른 포트(옛 식 "프로세스마다 상수" 그대로)
//   ③ 장부에 남이 쥔 범위는 피한다 · OS 에 이미 묶인 포트도 피한다
//   ④ 주인이 죽은 범위 · 주인이 죽은 잠금은 치우고 간다(죽은 판이 띠를 영영 막지 않는다)
//   장부는 판마다 새 디렉터리(`LIB_PORT_DIR`) — 공용 장부(`/tmp/mini-lib-port`)를 건드리지 않는다.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const LIB = path.join(__dirname, 'lib-port.js');
const L = require(LIB);
const DIRS = [];
const fresh = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-port-t-')); DIRS.push(d); return d; };
process.on('exit', () => { for (const d of DIRS) try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* 이미 없음 */ } });
// 자식 하나: env 로 장부를 받아 `js` 를 돌리고 JSON 한 줄을 찍는다
const kid = (dir, js, hold) => new Promise((res) => {
  const c = spawn(process.execPath, ['-e', `const L=require(${JSON.stringify(LIB)});const out=(${js})(L);console.log(JSON.stringify(out));setTimeout(()=>{}, ${hold || 0});`],
    { env: Object.assign({}, process.env, { LIB_PORT_DIR: dir }), stdio: ['ignore', 'pipe', 'pipe'] });
  let o = '', e = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { e += d; });
  c.on('exit', (code) => { let v = null; try { v = JSON.parse(o.trim().split('\n').pop()); } catch (x) { /* 아래가 빨강 */ } res({ code, v, e }); });
});
const files = (dir) => fs.readdirSync(dir).filter((f) => f.startsWith('r-'));
const deadPid = () => { const r = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }); return +r.stdout.trim(); };

(async () => {
  console.log('\n① 동시 열여섯 — 겹침 0 · 띠 안 · 나가면 장부가 빈다');
  {
    const dir = fresh();
    const R = await Promise.all(Array.from({ length: 16 }, (_, i) => kid(dir, `(L) => ({ a: L.ports(${3 + (i % 5)}, 'blk'), n: ${3 + (i % 5)}, p: L.port('one') })`, 400)));
    const spans = [];
    for (const r of R) if (r.v) { spans.push([r.v.a, r.v.n]); spans.push([r.v.p, 1]); }
    let clash = 0; for (let i = 0; i < spans.length; i++) for (let j = i + 1; j < spans.length; j++) {
      const [a, n] = spans[i], [b, m] = spans[j]; if (a < b + m && b < a + n) clash++;
    }
    const inBand = spans.every(([a, n]) => a >= L.LO && a + n - 1 <= L.HI);
    ok(R.every((r) => r.code === 0 && r.v), '①ⓐ 자식 열여섯이 다 포트를 받았다', R.filter((r) => r.code !== 0).map((r) => r.e.slice(0, 120)).join(' ; ') || `범위 ${spans.length}`);
    ok(clash === 0, '★★①ⓑ 동시에 잡은 범위 서른둘이 **하나도 안 겹친다**', `겹침 ${clash}`);
    ok(inBand, '①ⓒ 전부 띠 안(' + L.LO + ' ~ ' + L.HI + ')');
    ok(files(dir).length === 0 && !fs.existsSync(path.join(dir, '.mutex')), '①ⓓ 다 나간 뒤 장부 0 · 잠금 0(나갈 때 지운다)', `남은 ${files(dir).length}`);
    // ★자명 통과 금지 — 같은 자(겹침 셈)가 일부러 겹친 쌍은 잡는다
    const bait = [[30000, 5], [30004, 1]]; ok(bait[0][0] < bait[1][0] + bait[1][1] && bait[1][0] < bait[0][0] + bait[0][1], '①ⓔ 자명 통과 금지 — 겹침 셈은 겹친 미끼 쌍을 잡는다');
  }
  console.log('\n② 같은 key = 같은 포트(옛 식은 프로세스마다 상수였다)');
  {
    const dir = fresh();
    const r = await kid(dir, "(L) => ({ a: L.port(37200), b: L.port(37200), c: L.port(37300), d: L.ports(3, 37200), e: L.ports(3, 37200) })");
    ok(r.v && r.v.a === r.v.b && r.v.d === r.v.e, '②ⓐ 같은 (자리 수, key) 를 다시 부르면 같은 값', JSON.stringify(r.v));
    ok(r.v && r.v.a !== r.v.c && (r.v.d + 2 < r.v.a || r.v.d > r.v.a) && (r.v.d + 2 < r.v.c || r.v.d > r.v.c), '②ⓑ 다른 key · 다른 자리 수는 다른 범위(서로 안 겹친다)');
  }
  console.log('\n③ 남이 쥔 범위 · OS 에 묶인 포트는 피한다');
  {
    const dir = fresh();
    // 띠를 위 열 자리만 남기고 장부로 막는다(주인 = 이 프로세스 — 살아 있다)
    const top = L.HI - 9;
    fs.writeFileSync(path.join(dir, `r-${L.LO}-${top - L.LO}-${process.pid}-0`), '');
    const r1 = await kid(dir, '(L) => L.ports(3, 1)');
    ok(r1.v >= top && r1.v + 2 <= L.HI, '③ⓐ 장부에 쥔 범위를 피해 남은 열 자리 안에서 잡는다', `${r1.v}`);
    // 남은 자리 첫 넷을 OS 에 묶어 둔다 → 그 뒤에서 잡아야 한다
    const srv = [];
    for (let p = top; p < top + 4; p++) srv.push(await new Promise((res) => { const s = net.createServer(); s.once('error', () => res(null)); s.listen(p, () => res(s)); }));
    const r2 = await kid(dir, '(L) => L.ports(3, 2)');
    ok(srv.every(Boolean) && r2.v >= top + 4 && r2.v + 2 <= L.HI, '★③ⓑ OS 에 이미 묶인 포트(장부 밖 서버)는 건너뛴다', `묶음 ${top}~${top + 3} · 잡음 ${r2.v}`);
    ok(JSON.stringify(L._busy([top, top + 5])) === JSON.stringify([top]), '③ⓒ 묶어 보기 자는 묶인 포트만 돌려준다(자명 통과 금지)');
    for (const s of srv) if (s) s.close();
    const r3 = await kid(dir, '(L) => L.ports(20, 3)');
    ok(r3.code !== 0 && /이어진 20 자리/.test(r3.e), '③ⓓ 자리가 모자라면 **크게 실패한다**(조용히 겹치지 않는다)', r3.code === 0 ? `받음 ${r3.v}` : r3.e.trim().split('\n').find((x) => /lib-port/.test(x)) || '');
  }
  console.log('\n④ 죽은 판의 범위 · 잠금은 치운다');
  {
    const dir = fresh(), dead = deadPid();
    fs.writeFileSync(path.join(dir, `r-${L.LO}-${L.HI - L.LO + 1}-${dead}-0`), '');   // 띠 전체를 죽은 pid 가 쥐었다
    fs.mkdirSync(path.join(dir, '.mutex')); fs.writeFileSync(path.join(dir, '.mutex', 'pid'), String(dead));   // 잠금도 죽은 pid
    const t0 = Date.now(); const r = await kid(dir, '(L) => L.port(1)');
    ok(r.code === 0 && r.v >= L.LO, '★④ⓐ 죽은 주인의 잠금 · 띠 전체 범위를 치우고 잡는다', `${r.v} · ${Date.now() - t0}ms`);
    ok(!files(dir).some((f) => f.includes(`-${dead}-`)), '④ⓑ 죽은 주인의 범위 파일이 장부에서 사라졌다');
  }
  console.log('\n⑤ 고정 포트 쥐기 `hold` [T1288] — 제품이 박은 포트는 혼자 쥐고 줄 선다');
  {
    const dir = fresh();
    // 띠 밖 고정 수 하나를 고른다(이 판에서만 쓰는 빈 포트 — 실제 3010 은 남의 판이 쓸 수 있어 건드리지 않는다)
    const P = await new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
    const holder = spawn(process.execPath, ['-e', `const L=require(${JSON.stringify(LIB)});L.hold(${P});console.log('held',process.env.LIB_PORT_HELD);` +
      `const {spawnSync}=require('child_process');const r=spawnSync(process.execPath,['-e',"const L=require(${JSON.stringify(LIB).replace(/"/g, '\\"')});const t=Date.now();L.hold(${P});console.log('kid',Date.now()-t)"],{encoding:'utf8'});console.log(r.stdout.trim());setTimeout(()=>{},2500);`],
      { env: Object.assign({}, process.env, { LIB_PORT_DIR: dir }), stdio: ['ignore', 'pipe', 'pipe'] });
    let ho = ''; holder.stdout.on('data', (d) => { ho += d; });
    for (let i = 0; i < 100 && !/kid \d+/.test(ho); i++) await new Promise((r) => setTimeout(r, 50));
    const kidMs = +((/kid (\d+)/.exec(ho) || [])[1]);
    ok(/held .*\b/.test(ho) && kidMs < 1000, '⑤ⓐ 쥔 판의 자식(env 물려받음)은 **기다리지 않는다**(자기 부모를 기다리는 교착 0)', `자식 ${kidMs}ms · ${ho.trim().split('\n')[0]}`);
    const t0 = Date.now();
    const r1 = await kid(dir, `(L) => { process.env.LIB_PORT_HOLD_MS = '600'; try { L.hold(${P}); return 'got'; } catch (e) { return String(e.message).slice(0, 80); } }`);
    ok(r1.v && /기다려도 못 쥐었다/.test(r1.v) && /장부 pid/.test(r1.v), '★⑤ⓑ 남(env 안 물려받은 판)이 쥔 고정 포트는 **기다리다 크게 실패**한다(조용히 남의 central 에 붙지 않는다)', `${r1.v} · ${Date.now() - t0}ms`);
    const r2 = await kid(dir, `(L) => { const t = Date.now(); L.hold(${P}); return Date.now() - t; }`);
    ok(r2.code === 0 && r2.v >= 200, '★⑤ⓒ 쥔 판이 나가면 기다리던 판이 쥔다(줄 서기)', `기다림 ${r2.v}ms`);
    try { holder.kill('SIGKILL'); } catch (e) { /* 이미 끝 */ }
    // 장부 밖 서버가 묶은 고정 포트 — 닫힐 때까지 기다렸다 쥔다
    const srv = await new Promise((res) => { const s = net.createServer(); s.listen(P, () => res(s)); });
    setTimeout(() => srv.close(), 1200);
    const r3 = await kid(dir, `(L) => { const t = Date.now(); L.hold(${P}); return Date.now() - t; }`);
    ok(r3.code === 0 && r3.v >= 800, '⑤ⓓ 장부 밖 서버(OS)가 묶은 고정 포트는 닫힐 때까지 기다렸다 쥔다', `기다림 ${r3.v}ms`);
    ok(files(dir).length === 0, '⑤ⓔ 다 나간 뒤 쥔 기록 0');
  }
  console.log('\n⑥ X 화면 번호 `displays` [T1288] — 포트와 다른 머리 · 잠금 파일 있는 번호는 건너뛴다');
  {
    const dir = fresh();
    const R = await Promise.all(Array.from({ length: 8 }, () => kid(dir, "(L) => ({ d: L.displays(4, 'x'), p: L.port('x') })", 300)));
    const sp = R.filter((r) => r.v).map((r) => r.v.d);
    let clash = 0; for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) if (sp[i] < sp[j] + 4 && sp[j] < sp[i] + 4) clash++;
    ok(sp.length === 8 && clash === 0 && sp.every((d) => d >= L.DLO && d + 3 <= L.DHI), '★⑥ⓐ 동시 여덟이 화면 넷씩 — 겹침 0 · 화면 띠 안', `겹침 ${clash} · ${sp.join(',')}`);
    ok(R.every((r) => r.v && r.v.p >= L.LO), '⑥ⓑ 같은 판의 포트는 포트 띠에서(화면 번호와 섞이지 않는다)');
    // 잠금 파일이 있는 번호는 건너뛴다 — 띠를 장부로 한 칸만 남기고 그 칸에 가짜 잠금을 둔다
    const dir2 = fresh(), free1 = L.DHI - 1;
    fs.writeFileSync(path.join(dir2, `d-${L.DLO}-${free1 - L.DLO}-${process.pid}-0`), '');
    const lockF = `/tmp/.X${free1}-lock`; let made = false;
    if (!fs.existsSync(lockF)) { fs.writeFileSync(lockF, 'lib-port-test'); made = true; }
    const r = await kid(dir2, '(L) => L.displays(1, 1)');
    if (made) fs.unlinkSync(lockF);
    ok(made && r.v === L.DHI, '★⑥ⓒ `/tmp/.X<n>-lock` 이 있는 번호는 건너뛴다', `잠금 ${free1} · 받음 ${r.v}`);
  }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})();

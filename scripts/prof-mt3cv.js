#!/usr/bin/env node
// 대조군 — "굽기 폭주가 GL 캔버스 **넓이**에 비례하나?"
//   비례하면 원인은 띠마다 표면 전체를 스냅샷하는 GL→2D 전송이다(작게 잡으면 줄어든다).
//   비례 안 하면 원인은 다른 데 있다. 추측 대신 손잡이로 가른다.
const path = require('path'), fs = require('fs'); const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const SITE = { cx: +process.env.CX || 1914, cy: +process.env.CY || 202 };
const SIZES = (process.env.SIZES || '128,512,1024,2048').split(',').map(Number);
const REP = +(process.env.REP || 3);
const sleep = (m) => new Promise(r => setTimeout(r, m)); const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
fs.writeFileSync('/tmp/zw-cv.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
const M = `(ms)=>new Promise(res=>{const t=[];let last=performance.now();const t0=last;
  const step=()=>{const n=performance.now();t.push(n-last);last=n;
    if(n-t0<ms)requestAnimationFrame(step);else{const s=t.slice().sort((a,b)=>a-b);
      res({n:s.length,med:+s[s.length>>1].toFixed(2),p95:+s[Math.floor(s.length*0.95)].toFixed(1),max:+s[s.length-1].toFixed(1),
           sum:+t.reduce((a,b)=>a+b,0).toFixed(0)});}};
  requestAnimationFrame(step);})`;
const avg = (z) => z.reduce((x, y) => x + y, 0) / z.length;
const sd = (z) => { const m = avg(z); return Math.sqrt(z.reduce((x, y) => x + (y - m) * (y - m), 0) / Math.max(1, z.length - 1)); };
(async () => {
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-cv.js', { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: '/tmp/cv.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SITE.cx * 32 + 16, y: SITE.cy * 32 + 16, name: '산' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  //   ⚠옛 사다리(`#startBtn`·"시작"·"입장"·게스트) 네 칸 중 실제로 문 것은 **"입장" 한 칸**이었다.
  //   앞 칸 "시작"은 숨은 「새로 시작」에 걸려 click 이 **시간초과**로 죽었고, 그 30초가 **우연히**
  //   로비의 `/zones` 응답을 기다려 주고 있었다(존 목록 전엔 이 버튼이 `disabled` 다 — T61·T68 의 그 흔들림).
  //   ⇒ 우연을 지우는 대신 기다림을 **말로** 적는다: 버튼이 살아난 뒤에 누른다.
  //   ★기다림은 **두 가지**다: 버튼이 살아나는 것(`disabled`)과 **손잡이가 걸리는 것**
  //     (`onclick` 은 `30-n-net.js` 의 `boot()` 이 건다 — 그 전에 누르면 아무 일도 안 난다).
  await pg.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await pg.$('#enter'); if (b) await b.click(); } catch (e) {}
  await sleep(18000);
  await pg.evaluate(() => { window.__terrain19.freezeT = 0.30; window.__terrain19.windForce = 0; });
  await sleep(1500);
  console.log(['캔버스', '최대프레임ms', 'p95ms', '3초누적ms'].map(s => s.padStart(13)).join(''));
  const res = {}, real = {}, real2 = {};
  for (const n of SIZES) {
    const mx = [], p9 = [], su = [];
    for (let r = 0; r < REP; r++) {
      await pg.evaluate((v) => window.__mt3cv(v), n);       // 크기 강제 + 청크 비우기
      const b = await pg.evaluate(`(${M})(3000)`);
      mx.push(b.max); p9.push(b.p95); su.push(b.sum);
      await sleep(4000);
    }
    res[n] = avg(mx);
    const sz = await pg.evaluate(() => { const c = window.__mt3glcv && window.__mt3glcv(); return c || [0, 0]; });
    real[n] = sz[0]; real2[n] = sz[1];
    console.log([n + '', avg(mx).toFixed(0) + '±' + sd(mx).toFixed(0), avg(p9).toFixed(0), avg(su).toFixed(0)]
      .map(s => s.padStart(13)).join(''));
  }
  // ★판정은 **실제 캔버스 넓이**로 한다. 강제값이 띠보다 작으면 코드가 128 배수로 키우므로
  //   명목 크기(128)와 실제 넓이(≈640×384)가 다르다 — 명목으로 비교하면 계측기가 거짓말한다.
  //   최소제곱으로 max ≈ a + b·넓이(MP) 를 맞춰, 넓이 항이 실제로 있는지 본다.
  const xs = SIZES.map(n => Math.max(n, real[n] || n) * Math.max(n, real2[n] || n) / 1e6);
  const ys = SIZES.map(n => res[n]);
  const mx = xs.reduce((p, q) => p + q, 0) / xs.length, my = ys.reduce((p, q) => p + q, 0) / ys.length;
  const sxy = xs.reduce((p, q, i) => p + (q - mx) * (ys[i] - my), 0);
  const sxx = xs.reduce((p, q) => p + (q - mx) * (q - mx), 0);
  const bb = sxy / sxx, aa = my - bb * mx;
  console.log(`\n실제 넓이(MP): ${xs.map(v => v.toFixed(2)).join(' · ')}`);
  console.log(`맞춘 모형: 최대프레임 ≈ ${aa.toFixed(0)}ms + ${bb.toFixed(0)}ms/MP × 넓이`);
  console.log(bb > 100 ? '★넓이 항이 크다 — 띠마다 표면 전체를 옮기고 있다(작게 잡으면 준다)'
                       : '넓이와 무관 — 주범은 다른 데');
  await br.close(); for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(0);
})().catch(e => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) {} } process.exit(1); });

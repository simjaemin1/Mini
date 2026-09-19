#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly B   ← 야간 세 밤 분할(T238 · 소요로 균등). 브라우저를 띄우므로 CI 단위(60초·서버 0)에는 못 올린다.
//
// ══════════════════════════════════════════════════════════════════════════════
// e2e-audio-probe — **진짜 버퍼를 세는 자** [T305 2026-09-19 · 세션9/SOUND]
//
//   `test-audio ⑪` 은 곡선에서 넘침을 **증명한다**(WaveShaper 입력이 [−1,1] 로 잘리므로
//   곡선의 최대 절댓값이 곧 출력 상한 — 그 값이 1 아래면 어떤 조합도 안 넘친다).
//   증명이 있는데 왜 또 재나: **증명은 곡선에 대한 것이고, 제품은 곡선 말고도 많다.**
//   표의 볼륨, 파일의 실제 진폭, 버스 이득, 오버샘플 재표본 — 그중 하나가 조용히 바뀌면
//   증명은 그대로 참인 채로 소리만 틀려진다. 그래서 진짜 표본을 계속 센다.
//
//   ★재는 방식은 T292 의 `__sfx.probe()` 와 **같은 것**이다(사본이 아니라 같은 함수를 부른다):
//     실클라를 띄워 `window.__sfx.probe(keys)` 를 그대로 호출한다. 층이 쓰는 그 코드가
//     그대로 자다 — 하네스가 자기 판 렌더를 짜면 **층이 바뀌어도 하네스는 초록**이 된다(족보 80).
//   ★기계 의존 ms 0: 오프라인 렌더라 실시간이 아니다. 같은 입력이면 같은 표본이 나온다.
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/sfx/manifest.json'), 'utf8'));
const PORT = +(process.env.PORT || 0) || (3800 + (process.pid % 120));

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? '  ' + detail : ''}`); }
}
const db = (x) => (x > 0 ? +(20 * Math.log10(x)).toFixed(2) : -Infinity);

(async () => {
  console.log('=== e2e-audio-probe — 진짜 버퍼를 센다 (T305) ===\n');

  // ── 정적 파일만 있으면 된다(존 서버 0). `__sfx` 는 제스처 뒤에 살아난다.
  const http = require('http');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
                 '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.css': 'text/css', '.png': 'image/png' };
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const f = path.join(ROOT, 'public', rel);
    if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(PORT, r));

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // ① 제스처 — 소리 층은 첫 사용자 동작에서만 AudioContext 를 연다(그게 계약이다 · test-audio ④)
    await page.mouse.click(5, 5);
    await page.waitForFunction(() => window.__sfx && window.__sfx.dbg && window.__sfx.dbg().ctx, null, { timeout: 20000 });
    const d0 = await page.evaluate(() => window.__sfx.dbg());
    ok(!!d0.ctx, '① 제스처 뒤 `AudioContext` 가 열린다(그 전엔 안 연다 — 계약)', `상태 ${d0.ctx}`);
    ok(!d0.manifestErr && d0.manifest > 0, '② 표를 읽었다', `키 ${d0.manifest}종`);
    ok((d0.stat && d0.stat.noLimiter) === 0, '③ ★리미터가 달렸다(`bgm.js` 정본 곡선을 실제로 불렀다)',
       `못 단 횟수 ${d0.stat && d0.stat.noLimiter}`);

    const soundKeys = Object.keys(MAN.keys).filter((k) => !k.startsWith('_') && MAN.keys[k].file);
    const worst = (MAN._실측 && MAN._실측.worstCombo) || [];
    ok(soundKeys.length >= 16, '④ 전제: 소리 나는 키가 여럿이다(0 이면 아래가 자명 통과다)', `${soundKeys.length}종`);
    ok(worst.length > 0, '⑤ 전제: T292 최악 조합이 표에 있다', worst.join(' '));

    // ② ★층의 probe 를 **그대로** 부른다(사본 0)
    const runs = [
      ['소리 나는 키 전부', soundKeys],
      ['T292 최악 조합', worst],
    ];
    console.log('\n    ── 오프라인 렌더 실측 (리미터 있는 판) ──');
    console.log('      조합                키  합    피크 dBFS   RMS dBFS  클리핑  이득감소(최악)');
    const rows = [];
    for (const [name, keys] of runs) {
      const r = await page.evaluate((k) => window.__sfx.probe(k, { seconds: 4 }), keys);
      if (r && r.err) { ok(false, `⑥ ${name} — probe 가 답을 못 냈다`, r.err); continue; }
      rows.push([name, r]);
      console.log(`      ${name.padEnd(18)} ${String(r.keys.length).padStart(2)}  ${String(r.sum).padStart(5)}`
        + `  ${String(r.withLimiter.peakDb).padStart(8)}  ${String(r.withLimiter.rmsDb).padStart(9)}`
        + `  ${String(r.withLimiter.clipped).padStart(6)}  ${String(r.gainReduction.worstDb).padStart(7)} dB`);
    }
    ok(rows.length === runs.length, '⑥ 두 조합 다 렌더됐다', `${rows.length}/${runs.length}`);

    for (const [name, r] of rows) {
      ok(r.withLimiter.clipped === 0, `⑦ ★★${name} — **클리핑 0**(표본 하나까지 센 값이다)`,
         `${r.withLimiter.samples.toLocaleString()}표본 · 피크 ${r.withLimiter.peak}`);
      ok(r.withLimiter.peak < 1, `⑧ ★${name} — 피크가 1 아래다`, `${r.withLimiter.peakDb} dBFS`);
    }

    // ③ ★★자를 검증한다 — **문턱을 넘는 조합이 하나는 있어야** ⑩ 이 뜻을 갖는다.
    //    ⚠[T305 실측] 여기서 한 번 헛디뎠다: "최악 조합" 이라는 이름만 보고 그 줄이 문턱을 넘을 줄
    //      알았는데 **0/400 창이었다**. 당연하다 — T292 가 찾은 것이 바로 "그 조합조차 문턱을 안 넘는다"
    //      (피크 0.676 < 문턱 0.8)이고, 그게 리미터를 안심하고 달아 둔 근거였다. 문턱을 넘는 쪽은
    //      **키 전부**를 한꺼번에 울린 줄이다. 이름이 아니라 **잰 값**으로 줄을 고른다.
    {
      const biting = rows.filter(([, r]) => r.gainReduction.overKnee > 0);
      ok(biting.length > 0,
         '⑨ ★자 검증 — 문턱을 **실제로 넘는 줄이 하나는 있다**(다 안 넘으면 ⑩ 이 아무것도 안 잰다)',
         rows.map(([n, r]) => `${n} ${r.gainReduction.overKnee}/${r.gainReduction.windows}창`).join(' · '));
      for (const [name, r] of biting) {
        ok(r.withoutLimiter.peak >= r.withLimiter.peak,
           `⑩ ★★${name} — 리미터를 끼운 판의 피크가 뺀 판보다 **크지 않다**(장치가 누르지, 키우지 않는다)`,
           `없이 ${r.withoutLimiter.peakDb} → 끼고 ${r.withLimiter.peakDb} dBFS · 최악 이득감소 ${r.gainReduction.worstDb} dB`);
        ok(r.withoutLimiter.clipped >= r.withLimiter.clipped,
           `⑩b ★${name} — 리미터가 넘침을 **줄인다**(늘리지 않는다)`,
           `없이 ${r.withoutLimiter.clipped} → 끼고 ${r.withLimiter.clipped}`);
      }
    }

    // ④ ★[T305] 옛 곡선이 증폭기였다는 것을 **이 자로 다시 보인다** — 자명 통과 금지.
    //    같은 입력을 옛 곡선에 통과시켜 원점 기울기를 잰다. 1 이 나오면 자가 고장 난 것이다.
    {
      const slope = await page.evaluate(() => {
        const N = 2048, T = 0.8;
        const oldC = (i) => { const x = (i / (N - 1)) * 2 - 1; return Math.tanh(x * 1.35) / Math.tanh(1.35) * 0.93; };
        const newC = window.DurangoBGM.softLimiterCurve(T);
        const h = 2 / (N - 1);
        return { old: (oldC(1025) - oldC(1023)) / (2 * h), now: (newC[1025] - newC[1023]) / (2 * h) };
      });
      ok(Math.abs(slope.now - 1) < 1e-3,
         '⑪ ★★정본 곡선의 원점 기울기가 **1** 이다(문턱 아래는 손대지 않는다)', `${slope.now.toFixed(4)}`);
      ok(slope.old > 1.3,
         '⑫ 자명 통과 금지 — **옛 곡선**을 같은 자로 재면 1 보다 한참 크다(자가 살아 있다)',
         `옛 ${slope.old.toFixed(4)} = +${(20 * Math.log10(slope.old)).toFixed(2)} dB`);
    }

    // ⚠존 서버를 **일부러 안 띄운다**(이 하네스는 소리 층만 잰다) — 그래서 `/zones` 같은 세계 창구의
    //   응답 없음은 여기서 정상이다. 그것까지 빨갛게 세면 이 자는 "세계가 꺼져 있다"를 **소리 결함으로**
    //   보고하게 된다. ⇒ **소리 층에서 난 오류만** 센다(검사 범위를 넓히면 검사가 거짓말한다 · 족보).
    const sfxErrs = errs.filter((e) => /sfx|audio|bgm|DurangoBGM|limiter/i.test(e));
    ok(sfxErrs.length === 0, '⑬ ★소리 층에서 난 페이지 오류 0', sfxErrs.slice(0, 2).join(' | ') || '없다');
    if (errs.length !== sfxErrs.length) {
      console.log(`    (참고 — 소리 밖 오류 ${errs.length - sfxErrs.length}건: 존 서버를 안 띄운 탓이다 · ${errs.filter((e) => !/sfx|audio|bgm/i.test(e))[0] || ''})`);
    }
  } catch (e) {
    ok(false, '하네스가 끝까지 못 갔다', String(e && e.message).slice(0, 160));
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }

  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();

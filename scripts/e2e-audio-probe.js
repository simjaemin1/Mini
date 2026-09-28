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
const META_TRACKS = (() => {                         // ★[T323] BGM 곡 수 — 소리판 행 수와 맞댄다
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/audio/bgm/render-meta.json'), 'utf8')).tracks || {}; }
  catch (e) { return {}; }
})();
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
    // ★[T321] 어부 다섯이 동시에 낚는 마을 — `cast`×5 는 `maxSame` 이 잘라 내므로 **표대로** 잘린 뒤의 수를 본다.
    //   (표를 무시하고 다섯을 억지로 울리면 제품에서 날 수 없는 소리를 재게 된다 — 자가 거짓말한다.)
    const fiveFishers = ['cast', 'cast', 'cast', 'cast', 'cast', 'fire', 'wind', 'bird'];
    const runs = [
      ['소리 나는 키 전부', soundKeys],
      ['T292 최악 조합', worst],
      ['어부 다섯 + 마을 배경', fiveFishers],
      // ★[T387] 사람/전투 — 배선된 네 키(후보 제외 · 표에서 읽는다)가 짐승·낙하·모닥불 곁에서 한꺼번에.
      //   키 이름을 여기 박지 않는다: `combat` 표의 값 + 곁 소리 다섯(늑대·호랑이가 있는 싸움터 · 짐이 떨어짐).
      ['전투 한 판', [...new Set(Object.entries(MAN.combat || {}).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string').map(([, v]) => v)),
                     'drop', 'wolf_howl', 'tiger_growl', 'fire', 'wind']],
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
    ok(rows.length === runs.length, '⑥ 조합이 다 렌더됐다', `${rows.length}/${runs.length}`);

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

    // 53 ★★[T445] **짐승 판** — T431 실측 최악(`_실측.worstCombo`)은 늑대 둘이 한 창(200ms)에 문 순간이다(`hit_body` 둘).
    //   ★PM: 두 늑대 = 두 사건 = 소리 둘(가리지 않는다 · 리미터가 그 자리). 그러니 여기서 재는 것은 **리미터가 정말 잡는가**다.
    //   ⓐ 표의 최악 묶음에 같은 키가 둘 이상 있다(겹침이 표에 그대로 있다 — 누가 하나로 접으면 빨갛다)
    //   ⓑ 그 묶음을 리미터 **끼고** 재면 클리핑 0 · 피크 < 1 ⓒ 표에 적힌 없이-값과 지금 잰 없이-값이 같다(±0.01)
    //   ⓓ 미끼 — 리미터를 **빼면** 넘치는 묶음(`handBeasts` · 숲 짐승 한 판 · 손 조합)은 클리핑 > 0 이고 끼면 0 이다(자가 산 증거)
    {
      const M = MAN._실측 || {};
      const W = M.worstCombo || [];
      const cnt = {}; for (const k of W) cnt[k] = (cnt[k] || 0) + 1;
      const twice = Object.keys(cnt).filter((k) => cnt[k] >= 2);
      ok(twice.length >= 1, '53a ★짐승 판 최악 묶음에 **같은 키 둘**이 그대로 있다(두 사건 = 소리 둘 · 접지 않았다)', `${W.join('+')} · 둘 이상 ${twice.join(' ')}`);
      const rw = await page.evaluate((k) => window.__sfx.probe(k, { seconds: 4 }), W);
      ok(rw && !rw.err && rw.withLimiter.clipped === 0 && rw.withLimiter.peak < 1,
         '53b ★★그 묶음을 리미터 **끼고** 재면 클리핑 0 · 피크 1 아래(문턱을 넘는 창을 리미터가 잡는다)',
         rw && !rw.err ? `없이 ${rw.withoutLimiter.peak}(${rw.withoutLimiter.peakDb} dB) → 끼고 ${rw.withLimiter.peak} · 클리핑 ${rw.withLimiter.clipped} · 문 창 ${rw.gainReduction.overKnee}/${rw.gainReduction.windows}` : String(rw && rw.err));
      ok(rw && !rw.err && Math.abs(rw.withoutLimiter.peak - M.worstPeak) <= 0.01,
         '53c 표의 `worstPeak` 이 지금 잰 값과 같다(±0.01 — 표가 낡지 않았다)', rw && !rw.err ? `표 ${M.worstPeak} · 지금 ${rw.withoutLimiter.peak}` : '');
      const rb = await page.evaluate((k) => window.__sfx.probe(k, { seconds: 4 }), M.handBeasts || []);
      ok(rb && !rb.err && rb.withoutLimiter.clipped > 0 && rb.withLimiter.clipped === 0,
         '53d ★자명 통과 금지 — 미끼(숲 짐승 한 판)는 리미터를 **빼면 넘치고**(클리핑 > 0) 끼면 0 이다 — 53b 의 0 은 리미터가 만든 값이다',
         rb && !rb.err ? `없이 ${rb.withoutLimiter.peak} · 클리핑 ${rb.withoutLimiter.clipped} → 끼고 ${rb.withLimiter.clipped}` : String(rb && rb.err));
    }

    // ⑭~⑰ ★★★[T321] **수신에서 센다** — 족보 226: 발신 훅은 거짓 소리다.
    //   어부 소리가 제대로 걸렸는지는 "서버가 몇 번 불렀나"가 아니라 **"층이 몇 번 울렸나"** 로 잰다.
    //   여기서는 진짜 `window.__sfx.recv` 에 진짜 모양의 `tick` 을 먹이고 `stat.played` 의 증분을 센다
    //   (사본 0 — 제품이 쓰는 그 함수다). 세계를 안 띄우고도 **층의 계약**을 그대로 잰다.
    //   ★이 자가 겨누는 진짜 위험: 라벨은 **1.2초 창** 동안 같은 값이 최대 25틱 온다(무상태 델타).
    //     모서리로 안 잡으면 한 번의 낚음이 **스물다섯 번** 난다 — 그게 T292-b 와 똑같은 모양의 사고다.
    {
      const played = () => page.evaluate(() => window.__sfx.dbg().stat.played);
      const feed = (frames) => page.evaluate((fr) => {
        // 층이 보는 그대로의 `c` — `recv` 는 `handleMessage` 머리에서 불리므로 `others` 는 **직전** 값이다.
        const c = { others: new Map(), meta: { worldOffsetX: 0, worldOffsetY: 0 } };
        for (const f of fr) {
          window.__sfx.recv({ type: 'tick', players: f }, c);
          for (const pp of f) {                       // 합치기 — 아래 30-n-net.js 가 하는 그 일
            const prev = c.others.get(pp.pid) || {};
            c.others.set(pp.pid, Object.assign({}, prev, pp,
              { act: pp.act !== undefined ? pp.act : prev.act }));
          }
        }
      }, frames);
      const npc = (pid, act, x) => ({ pid, x: x || 0, y: 0, act });
      // ★칸막이 — 앞 토막이 울린 소리가 **아직 울리는 동안**은 뒤 토막이 막힌다.
      //   ⚠여기서 두 번 헛짚었다. 처음엔 쿨다운(200ms) 탓인 줄 알고 450ms 쉬었는데 그대로 빨갰다.
      //     진짜 범인은 **`maxSame` + 표본 길이**다: `hook` 은 `maxSame 1` 인데 `hook.ogg` 가 **1.099초**라,
      //     450ms 뒤엔 앞 토막의 그 소리가 여전히 `live` 에 있어 다음 한 번이 `blocked` 로 떨어졌다.
      //   ⇒ 쉬는 시간을 **표본 길이**에서 뽑는다(짐작한 수가 아니라 잰 수). 그리고 측정 토막 안에서
      //     `blocked` 가 움직였는지 함께 본다 — 움직였으면 칸막이가 샌 것이고, 그럼 이 자는 거짓말한다.
      const LONGEST_MS = 1100;   // `hook.ogg` 1.099초 — 이 셋 중 가장 긴 표본
      const settle = () => page.waitForTimeout(LONGEST_MS + 400);
      const blocked = () => page.evaluate(() => window.__sfx.dbg().stat.blocked);

      // ⑭ ★★**첫 가시에는 안 운다** — 라벨이 붙은 채로 시야에 들어온 어부는 **이미 지난 일**이다.
      //    서버는 `act` 를 '바뀐 뒤 1.2초 창'과 **최초 가시**에 보낸다(`zone.js makeEntry`). 그런데
      //    `_lifeAct` 는 바뀔 때만 갱신되는 **머무는 칸**이라, 10초 전에 낚은 어부도 여전히 '낚음' 이다.
      //    그가 시야에 들어왔다고 낚는 소리가 나면 **일어나지 않은 일이 들린다**(족보 226 의 거짓 소리).
      //    ⇒ 직전 값이 없으면 울리지 않는다. 이 자가 그 계약을 못 박는다.
      {
        const before = await played();
        await feed([[npc('n0', '낚음')]]);
        const n = (await played()) - before;
        ok(n === 0, '⑭ ★★라벨을 단 채 **처음 보이는** 어부는 안 운다(이미 지난 일이다)', `울린 횟수 ${n}`);
      }

      await settle();
      // ⑮ 한 번의 낚음이 1.2초 창 동안 25틱 같은 값으로 와도 — **한 번만** 나야 한다
      {
        const before = await played();
        await feed([[npc('f1', '출근')],                                  // ① 먼저 보인다(첫 가시 — 안 운다)
                    ...Array.from({ length: 25 }, () => [npc('f1', '낚음')])]);  // ② 낚음이 25틱 온다
        const n = (await played()) - before;
        ok(n === 1, '⑮ ★★같은 낱말이 25틱 와도 **한 번만** 운다(모서리 검출 — 안 그러면 한 번 낚고 25번 난다)',
           `울린 횟수 ${n}`);
      }

      await settle();
      // ⑯ 자명 통과 금지 — 낱말이 **바뀌면** 그때마다 나야 한다(자가 그냥 막고만 있는 게 아니다)
      {
        const before = await played(), bb = await blocked();
        await feed([[npc('f2', '출근')], [npc('f2', '드리움')], [npc('f2', '놓침')], [npc('f2', '낚음')]]);
        const n = (await played()) - before, nb = (await blocked()) - bb;
        ok(nb === 0, '⑯a ★칸막이 검증 — 이 토막에서 막힌 소리 0(앞 토막이 안 샜다 · 새면 아래가 거짓말한다)', `막힘 ${nb}`);
        ok(n === 3, '⑯ 자명 통과 금지 — 낱말이 바뀔 때마다 운다(막기만 하는 자가 아니다)', `울린 횟수 ${n} / 바뀜 3`);
      }

      await settle();
      // ⑰ ★표에 없는 낱말은 안 운다(지어내지 않는다)
      {
        const before = await played();
        await feed([[npc('f3', '')], [npc('f3', '출근')], [npc('f3', '취침')], [npc('f3', '개간')]]);
        const n = (await played()) - before;
        ok(n === 0, '⑰ ★표에 없는 생활 낱말(`출근`·`취침`·`개간`)은 **안 운다**', `울린 횟수 ${n}`);
      }

      await settle();
      // ⑱ ★★어부 다섯이 같은 틱에 낚는다 — **표가 정한 수**만큼만 난다(`maxSame`·`cooldownMs`)
      //    ⚠기대값을 5 로 박지 않는다. 5 를 기대하면 표를 무시하는 자가 된다 —
      //      `hook` 은 `maxSame 1`·`cooldown 200ms` 라 같은 순간에 다섯이 나는 것이 **오히려 결함**이다.
      //      자는 "표대로인가" 를 재지 "다섯인가" 를 재지 않는다. (T305 에서 줄을 이름으로 고르다 헛디뎠다.)
      {
        // ⚠`feed` 는 부를 때마다 **새 `c`** 를 만든다(층이 보는 접속 하나를 흉내 낸다).
        //   그래서 '먼저 보인다' 와 '낚는다' 를 **두 번에 나눠 부르면** 둘째 부름에서 다섯이 다시
        //   첫 가시가 되어 아무 소리도 안 난다 — 실제로 그래서 0 이 나왔다. 한 번에 먹인다.
        const five = ['f4', 'f5', 'f6', 'f7', 'f8'];
        const before = await played();
        await feed([five.map((p, k) => npc(p, '출근', k * 40)),           // ① 먼저 보인다(첫 가시 — 무음)
                    five.map((p, k) => npc(p, '낚음', k * 40))]);         // ② 다섯이 같은 틱에 낚는다
        const n = (await played()) - before;
        const cap = (MAN.keys.hook.maxSame || 3);
        ok(n >= 1 && n <= cap,
           '⑱ ★★어부 다섯이 같은 틱에 낚아도 **표가 정한 겹침 상한 안**이다(연사가 안 난다)',
           `울린 횟수 ${n} · 표의 상한 ${cap} · 쿨다운 ${MAN.keys.hook.cooldownMs}ms`);
      }
    }

    // ㉕~㉝ ★★★[T387] **사람/전투 — 수신에서 센다**(족보 226). 진짜 `recv` 에 진짜 모양의 메시지를 먹이고
    //   `stat.played` 의 증분을 센다. 서버 메시지 모양은 `zone.js` 그대로다(발신 자리 줄은 보고 ⓑ 표).
    //   ★이 자가 겨누는 위험 셋: ① 상태 동기화(`hp_changed` 등)가 운다 ② 자리를 지어낸다(모르는 pid 가 귓가에서)
    //   ③ **pid 충돌** — pid 는 존마다 `p1` 부터 센다. 관전 연결의 `p1` 을 나로 읽으면 남의 쓰러짐이 내 몸에서 난다.
    {
      const played = () => page.evaluate(() => window.__sfx.dbg().stat.played);
      const blocked = () => page.evaluate(() => window.__sfx.dbg().stat.blocked);
      const send = (msgs, role, others) => page.evaluate(({ msgs, role, others }) => {
        const c = { role, others: new Map(others || []), meta: { worldOffsetX: 0, worldOffsetY: 0 } };
        for (const m of msgs) window.__sfx.recv(m, c);
      }, { msgs, role, others });
      const CB = MAN.combat || {};
      //   칸막이 — 배선된 다섯(쏨·휘두름·쓰러짐·깨어남·낙하) 중 가장 긴 표본이 `wake_up` 0.524s(보고 ⓒ 잰 값).
      //   거기에 여유를 얹는다. 새면 `막힘` 이 움직이고 그 줄이 빨개진다(자가 스스로 칸막이를 잰다).
      const settle = () => page.waitForTimeout(900);
      // 나 = p1 (주 연결). 층은 `myPid` 전역을 읽는다 — 제품이 로그인 때 세우는 그 칸이다.
      await page.evaluate(() => { myPid = 'p1'; });
      const P2 = [['p2', { pid: 'p2', x: 40, y: 0 }]];
      const cases = [
        ['㉕ 쏨 — `arrow_spawn`(좌표 실림)', [{ type: 'arrow_spawn', aid: 'z_ar1', x: 30, y: 0, vx: 1, vy: 0, ownerPid: 'p2' }], 'primary', null, 1],
        ['㉖ 휘두름 — 남(`c.others` 에 있는 p2)', [{ type: 'player_attacked', pid: 'p2', t: 1 }], 'primary', P2, 1],
        ['㉗ ★휘두름 — **모르는 pid** 는 안 운다(자리를 지어내지 않는다)', [{ type: 'player_attacked', pid: 'p9', t: 1 }], 'primary', P2, 0],
        ['㉘ 휘두름 — 나(주 연결의 p1 · 위치 없음)', [{ type: 'player_attacked', pid: 'p1', t: 1 }], 'primary', null, 1],
        ['㉙ ★★pid 충돌 — **관전 연결**의 p1 은 내가 아니다(남인데 모르는 자리 = 무음)', [{ type: 'player_attacked', pid: 'p1', t: 1 }, { type: 'player_downed', pid: 'p1', rescueWindowMs: 1 }], 'observer', null, 0],
        ['㉚ 쓰러짐 — `player_downed`(나에게만 옴)', [{ type: 'player_downed', pid: 'p1', rescueWindowMs: 180000, options: [] }], 'primary', null, 1],
        ['㉚b ★쓰러진 채 **다시 접속**하면 같은 `player_downed` 가 한 번 더 온다(`source:relogin`) — 복원이지 사건이 아니다', [{ type: 'player_downed', pid: 'p1', rescueWindowMs: 180000, options: [], source: 'relogin' }], 'primary', null, 0],
        ['㉛ 깨어남 — 나 하나 + 남 하나(좌표)', [{ type: 'player_respawn', pid: 'p1', hp: 100, x: 0, y: 0 }, { type: 'player_respawn', pid: 'p7', hp: 100, x: 60, y: 0 }], 'primary', null, 2],
        ['㉜ ★★상태 동기화 일곱은 **안 운다**', [
          { type: 'hp_changed', pid: 'p1', hp: 40 }, { type: 'hp_changed', pid: 'p2', hp: 10 },
          { type: 'pvp_state', enabled: true }, { type: 'player_down_state', pid: 'p2', isDown: true },
          { type: 'arrow_removed', aid: 'z_ar1' }, { type: 'war_command_ack', warId: 3, ok: true },
          { type: 'self_stat', thirst: 80 }, { type: 'inventory', where: 'death', inventory: {} }], 'primary', P2, 0],
        ['㉝ ★죽어 쏟기는 **한 번** 운다(`inventory death` 0 + `ground_item_added` 1 — `drop`)', [
          { type: 'inventory', where: 'death', inventory: {} }, { type: 'ground_item_added', gi: { id: 'g1', x: 50, y: 0, item: 'fish' } }], 'primary', null, 1],
      ];
      // 데우기 — 변주는 자리 씨로 파일을 고르므로 **같은 메시지**로 한 번 먹여 받아 둔다(첫 번은 받는 중 = 무음이 계약).
      for (const [, msgs, role, others] of cases) await send(msgs, role, others);
      await page.waitForTimeout(1500);
      for (const [label, msgs, role, others, want] of cases) {
        await settle();
        const b0 = await played(), k0 = await blocked();
        await send(msgs, role, others);
        const n = (await played()) - b0, nb = (await blocked()) - k0;
        ok(n === want && nb === 0, label, `울린 ${n} / 기대 ${want} · 막힘 ${nb}`);
      }
      ok(Object.keys(CB).filter((k) => !k.startsWith('_')).length === 5,
         '㉞ 자 전제 — `combat` 표의 사건은 다섯(쏨·휘두름·쓰러짐·깨어남·남의 쓰러짐[T402]) · 층이 이름을 코드에 안 박은 것은 test-audio ⑮ 가 철자로 본다',
         Object.entries(CB).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}→${v}`).join(' · '));
      await page.evaluate(() => { myPid = null; });
    }

    // ㉟~㊴ ★★★[T397] 맞음(`hp_changed.why`) · 표면 타일 · 눈 — 수신/훅에서 센다(사본 0 · 제품 함수 그대로).
    {
      const played = () => page.evaluate(() => window.__sfx.dbg().stat.played);
      const send = (msgs, role, others) => page.evaluate(({ msgs, role, others }) => {
        const c = { role, others: new Map(others || []), meta: { worldOffsetX: 0, worldOffsetY: 0 } };
        for (const m of msgs) window.__sfx.recv(m, c);
      }, { msgs, role, others });
      await page.evaluate(() => { myPid = 'p1'; });
      // ★[T402] 서버가 `why` = `damagePlayer` 출처 앞 낱말을 싣는다. 모양은 `zone.js setHp` 그대로.
      const HIT = [{ type: 'hp_changed', pid: 'p1', hp: 80, why: 'mob' }];                 // 늑대에게 물림(`mob:wolf`)
      const QUIET = [{ type: 'hp_changed', pid: 'p1', hp: 79, why: 'extreme' },          // ★미끼 — 추위 극단 감소(`extreme:cold`)
                     { type: 'hp_changed', pid: 'p1', hp: 80 },                          // 옛 전문(why 없음)
                     { type: 'hp_changed', pid: 'p1', hp: 90, why: 'food' },             // 먹어 회복(독도 같은 낱말)
                     { type: 'hp_changed', pid: 'p1', hp: 95, why: 'dish' },
                     { type: 'hp_changed', pid: 'p1', hp: 60, why: 'rescue' }];
      const count = async (msgs, role, others) => { await page.waitForTimeout(700); const b = await played(); await send(msgs, role, others); return (await played()) - b; };
      await send(HIT, 'primary'); await page.waitForTimeout(800);          // 데우기(첫 번은 받는 중 = 무음이 계약)
      const n1 = await count(HIT, 'primary');
      const n0 = await count(QUIET, 'primary');
      const nX = await count(Array.from({ length: 10 }, (_, i) => ({ type: 'hp_changed', pid: 'p1', hp: 70 - i, why: 'extreme' })), 'primary');
      const n3 = await count(HIT, 'observer');                             // 관전 연결의 p1 = 남 · others 에 없음 = 무음
      const n4 = await count([{ type: 'hp_changed', pid: 'p2', hp: 50, why: 'arrow' }], 'primary', [['p2', { pid: 'p2', x: 30, y: 0 }]]);
      ok(n1 === 1, '㉟ ★★늑대에게 물리면(`why:mob`) **맞는 소리**가 난다(나 · 위치 없음)', `울린 ${n1}`);
      ok(n0 === 0, '㊱a ★★미끼 — 극단 감소(`extreme`)·옛 전문·먹기·구조는 **안 운다**', `울린 ${n0}`);
      ok(nX === 0, '㊱b ★추위 속 극단 감소 열 번 = 맞는 소리 **0**(3.6초마다 쿵 0)', `울린 ${nX}`);
      ok(n3 === 0, '㊱c 관전 연결의 p1 은 내가 아니다(pid 충돌 · T387 규칙 그대로)', `울린 ${n3}`);
      ok(n4 === 1, '㊱d 남(`c.others` 의 p2)이 화살에 맞으면 그 자리에서 난다(방송 · 곁 사람도 듣는다)', `울린 ${n4}`);

      // ㊴ ★★[T402] 남이 쓰러지는 소리 — `player_down_state.why` · 쓰러짐만 운다
      const P2 = [['p2', { pid: 'p2', x: 40, y: 0 }]];
      await send([{ type: 'player_down_state', pid: 'p2', isDown: true, why: 'down' }], 'primary', P2); await page.waitForTimeout(800);   // 데우기
      const d1 = await count([{ type: 'player_down_state', pid: 'p2', isDown: true, why: 'down' }], 'primary', P2);
      const d0 = await count([{ type: 'player_down_state', pid: 'p2', isDown: true, why: 'carried', carriedBy: 'p3' },
                              { type: 'player_down_state', pid: 'p2', isDown: true, why: 'set' },
                              { type: 'player_down_state', pid: 'p2', isDown: true, why: 'relogin' },
                              { type: 'player_down_state', pid: 'p2', isDown: false },
                              { type: 'player_down_state', pid: 'p2', isDown: true }], 'primary', P2);
      const dMe = await count([{ type: 'player_down_state', pid: 'p1', isDown: true, why: 'down' }], 'primary');
      ok(d1 === 1, '㊴a ★★곁 사람(p2)이 쓰러지면 **쓰러지는 소리**가 난다(그 자리 · 거리 감쇠)', `울린 ${d1}`);
      ok(d0 === 0, '㊴b ★업힘·내려놓음·재접속·일어남·낱말 없는 옛 전문은 **안 운다**', `울린 ${d0}`);
      ok(dMe === 0, '㊴c 내 쓰러짐은 여기서 안 운다(`player_downed` 가 이미 운다 — 두 번 0)', `울린 ${dMe}`);

      // ㊲ 표면 타일 — 발밑 셀에 밭·마당·바닥을 놓고 층의 **그 함수**(`sfxGroundKey`)에 묻는다
      const ground = (blds, floor) => page.evaluate(({ blds, floor }) => {
        window.__camCellLocal = () => [3, 4];
        const c = { role: 'primary', meta: { worldOffsetX: 0, worldOffsetY: 0 }, buildings: new Map(), others: new Map() };
        blds.forEach((b, i) => c.buildings.set('b' + i, { id: 'b' + i, type: b[0], x: 3 * 32 + 16, y: 4 * 32 + 16, floor: b[1] || 0 }));
        conns.set('zS', c); primaryZoneId = 'zS'; myFloor = floor || 0;
        _sfxSurfN = -1; _sfxGroundCell = null;          // 캐시를 비운다 — 판마다 다른 발밑이다(층의 캐시 규칙은 ㊲f 가 따로 본다)
        const k = sfxGroundKey();
        conns.delete('zS'); primaryZoneId = null; myFloor = 0;
        return k;
      }, { blds, floor });
      const S = MAN.surface || {};
      const gF = await ground([['farmland']]);
      const gY = await ground([['farmland'], ['vtile']]);
      const gB = await ground([['farmland'], ['vtile'], ['floor']]);
      const gUp = await ground([['floor', 1]], 0);
      const gUp1 = await ground([['floor', 1], ['wall']], 1);
      const gNone = await ground([['wall']]);
      ok(gF === S.farmland, '㊲a 밭 위 발자국 = 표의 `farmland` 키', `${gF}`);
      ok(gY === S.vtile, '㊲b 밭+마당이 겹치면 **마당**(표의 `_순서`)', `${gY}`);
      ok(gB === S.floor, '㊲c 셋이 겹치면 **실내 바닥**', `${gB}`);
      ok(gUp !== S.floor && gUp1 === S.floor, '㊲d 위층 바닥은 **그 층에서만** 밟는다(아래층에선 지형)', `아래층 ${gUp} · 1층 ${gUp1}`);
      ok(gNone === ((MAN.ground || {})._기본), '㊲e 표면 타일이 없으면 종전 지형 판정(기존 키 비트 동일)', `${gNone}`);
      // ㊲f 캐시 — 밭을 **놓는 순간**(건물 수가 바뀜) 같은 셀에서도 다시 읽는다(캐시가 옛 흙을 쥐고 있지 않다)
      const gCache = await page.evaluate(() => {
        window.__camCellLocal = () => [3, 4];
        const c = { role: 'primary', meta: { worldOffsetX: 0, worldOffsetY: 0 }, buildings: new Map(), others: new Map() };
        conns.set('zS', c); primaryZoneId = 'zS'; myFloor = 0; _sfxSurfN = -1; _sfxGroundCell = null;
        const before = sfxGroundKey();
        c.buildings.set('f', { id: 'f', type: 'farmland', x: 3 * 32 + 16, y: 4 * 32 + 16 });
        const after = sfxGroundKey();
        conns.delete('zS'); primaryZoneId = null;
        return [before, after];
      });
      ok(gCache[0] === ((MAN.ground || {})._기본) && gCache[1] === S.farmland, '㊲f 밭을 놓으면 같은 셀에서도 곧바로 밭 소리(캐시가 건물 수를 본다)', gCache.join(' → '));

      // ㊳ 눈 — 그리는 층의 판정(`__rainDbg().kind`)이 snow 면 빗소리 반복이 **멎는다**
      const rainLoop = (kind, precip) => page.evaluate(async ({ kind, precip }) => {
        window.__rainDbg = () => ({ kind });
        const w = { precip, wind: 0, tempC: kind === 'snow' ? -5 : 10 };
        window.__sfx.weather(w, false);
        await new Promise((r) => setTimeout(r, 900));                       // 버퍼 받기
        window.__sfx.weather(w, false);
        return [..._sfxLoops.keys()].filter((k) => /^amb:rain/.test(k));
      }, { kind, precip });
      const lr = await rainLoop('rain', 0.8);
      const ls = await rainLoop('snow', 0.8);
      const lr2 = await rainLoop('rain', 0.8);
      await page.evaluate(() => { window.__sfx.weather({ precip: 0, wind: 0 }, false); delete window.__rainDbg; });
      ok(lr.length === 1, '㊳a 대조 — 비면 빗소리 반복이 하나 켜진다', lr.join(' ') || '없음');
      ok(ls.length === 0, '㊳b ★★눈이면 빗소리가 **멎는다**(화면은 눈인데 귀는 비 — 종전 결함)', ls.join(' ') || '없음');
      ok(lr2.length === 1, '㊳c 다시 비면 다시 난다(끄기만 하는 자가 아니다)', lr2.join(' ') || '없음');
      await page.evaluate(() => { myPid = null; });
    }

    // ㊵~㊻ ★★★[T412] 도구/작업 — 수신에서 센다(사본 0 · 진짜 `recv` · `c` 는 합치기 **전**의 직전 값)
    {
      const played = () => page.evaluate(() => window.__sfx.dbg().stat.played);
      const run = (msgs, st) => page.evaluate(({ msgs, st }) => {
        const c = { role: 'primary', others: new Map(), meta: { worldOffsetX: 0, worldOffsetY: 0 },
                    buildings: new Map((st.b || []).map((b) => [b.id, b])), groundItems: new Map((st.g || []).map((g) => [g.id, g])),
                    resources: new Map((st.r || []).map((r) => [r.id, r])) };
        for (const m of msgs) window.__sfx.recv(m, c);
      }, { msgs, st: st || {} });
      const count = async (msgs, st) => { await page.waitForTimeout(800); const b = await played(); await run(msgs, st); return (await played()) - b; };
      const W = (id, type, data, x) => ({ id, type, x: x || 40, y: 0, data: data || {} });
      const C = {
        add: [{ type: 'building_added', building: W('n1', 'wall') }],
        addV: [{ type: 'building_added', building: W('n2', 'vtile') }],
        addF: [{ type: 'building_added', building: W('n3', 'farmland', { crop: 'millet' }) }],
        rm: [[{ type: 'building_removed', id: 'w1' }], { b: [W('w1', 'wall')] }],
        rmSite: [[{ type: 'building_removed', id: 's1' }], { b: [W('s1', 'hut_site')] }],
        rmUnknown: [[{ type: 'building_removed', id: 'zz' }], {}],
        dmg: [[{ type: 'building_damaged', id: 'w1', hp: 80, maxHp: 100 }], { b: [W('w1', 'wall', { hp: 100 })] }],
        dmgSame: [[{ type: 'building_damaged', id: 'w1', hp: 100, maxHp: 100 }], { b: [W('w1', 'wall', { hp: 100 })] }],
        doorOpen: [[{ type: 'building_updated', building: W('d1', 'door', { open: true }) }], { b: [W('d1', 'door', { open: false })] }],
        doorClose: [[{ type: 'building_updated', building: { id: 'd1', data: { open: false } } }], { b: [W('d1', 'door', { open: true })] }],
        doorFirst: [[{ type: 'building_updated', building: W('d9', 'door', { open: true }) }], {}],
        jobOn: [[{ type: 'building_updated', building: { id: 'f1', data: { job: { kind: 'smelt' } } } }], { b: [W('f1', 'furnace', {})] }],
        jobOff: [[{ type: 'building_updated', building: { id: 'f1', data: {} } }], { b: [W('f1', 'furnace', { job: { kind: 'smelt' } })] }],
        sow: [[{ type: 'building_updated', building: { id: 'fa', data: { crop: 'millet' } } }], { b: [W('fa', 'farmland', { crop: null })] }],
        reap: [[{ type: 'building_updated', building: { id: 'fa', data: { crop: null } } }], { b: [W('fa', 'farmland', { crop: 'millet' })] }],
        pick: [[{ type: 'ground_item_removed', id: 'g1' }], { g: [{ id: 'g1', x: 30, y: 0, item: 'fish' }] }],
        pickUnknown: [[{ type: 'ground_item_removed', id: 'g9' }], {}],
        sap: [[{ type: 'resource_spawn', resource: { id: 'r1', type: 'sapling', x: 20, y: 0 } }], {}],
        sapGrow: [[{ type: 'resource_spawn', resource: { id: 'r2', type: 'tree', x: 20, y: 0 } }], { r: [{ id: 'r2', type: 'sapling', x: 20, y: 0 }] }],
        chest: [[{ type: 'chest_state', buildingId: 'c1', data: {} }], { b: [W('c1', 'chest')] }],
      };
      const norm = (v) => Array.isArray(v[0]) ? v : [v, {}];
      for (const k of Object.keys(C)) { const [m, st] = norm(C[k]); await run(m, st); }   // 데우기
      await page.waitForTimeout(1500);
      const n = {};
      for (const k of Object.keys(C)) { const [m, st] = norm(C[k]); n[k] = await count(m, st); }
      ok(n.add === 1 && n.addV === 0 && n.addF === 1, '㊵ ★건물이 서면 운다(벽 1) · 마을 바닥 타일 0 · 밭 일굼 = 삽질 1', `벽 ${n.add} · vtile ${n.addV} · 밭 ${n.addF}`);
      ok(n.rm === 1 && n.rmSite === 0 && n.rmUnknown === 0, '㊶ ★허물면 운다(벽 1) · 터가 다음 단계로 **바뀌는** 지움 0 · 모르는 건물 0', `벽 ${n.rm} · 터 ${n.rmSite} · 모름 ${n.rmUnknown}`);
      ok(n.dmg === 1 && n.dmgSame === 0, '㊷ 벽이 깎이면 운다 · hp 가 같으면 0', `깎임 ${n.dmg} · 같음 ${n.dmgSame}`);
      ok(n.doorOpen === 1 && n.doorClose === 1 && n.doorFirst === 0, '㊸a ★문 열림·닫힘 각 1 · 처음 보는 문 0(무엇이 바뀌었는지 모른다)', `열 ${n.doorOpen} · 닫 ${n.doorClose} · 처음 ${n.doorFirst}`);
      ok(n.jobOn === 0 && n.jobOff === 1, '㊸b 가마에 불 넣음은 단발 0(반복 불소리가 맡는다) · 꺼냄 1', `넣음 ${n.jobOn} · 꺼냄 ${n.jobOff}`);
      ok(n.sow === 1 && n.reap === 0, '㊸c 밭에 씨 넣음 1 · 수확(crop 꺼짐) 0 — 사람 수확은 `where:harvest` 가 이미 운다', `씨 ${n.sow} · 수확 ${n.reap}`);
      ok(n.pick === 1 && n.pickUnknown === 0, '㊹ 주우면 그 자리에서 운다 · 모르는 물건 0', `${n.pick} · ${n.pickUnknown}`);
      ok(n.sap === 1 && n.sapGrow === 0, '㊺ ★묘목을 심으면 1 · 같은 id 가 자라 나무가 돼도 0', `심기 ${n.sap} · 자람 ${n.sapGrow}`);
      ok(n.chest === 1, '㊻ 궤에 넣기/꺼내기 뒤 1(그 궤 자리)', `${n.chest}`);
      // ㊼ 가마 반복 불소리 — `job` 이 있을 때만(훑기 · 진짜 `scan`)
      const loops = await page.evaluate(async () => {
        const mk = (job) => [{ kind: 'building', b: { id: 'fz', type: 'furnace', x: 0, y: 0, data: job ? { job: {} } : {} }, ax: 0, ay: 0 }];
        const has = () => [..._sfxLoops.keys()].some((k) => /^fire:fz/.test(k));
        _sfxScanAt = 0; window.__sfx.scan(mk(true), 0, 0); await new Promise((r) => setTimeout(r, 900));
        _sfxScanAt = 0; window.__sfx.scan(mk(true), 0, 0); const on = has();
        _sfxScanAt = 0; window.__sfx.scan(mk(false), 0, 0); const off = has();
        _sfxScanAt = 0; window.__sfx.scan([], 0, 0);
        return { on, off };
      });
      ok(loops.on === true && loops.off === false, '㊼ ★노에 불이 들면 불소리 · 꺼지면 멎는다(`buildingsWhen`)', `켬 ${loops.on} · 끔 ${loops.off}`);
    }

    // ㊽~52 ★★[T417] 동물 · 제작 완료 — 수신에서 센다
    {
      const played = () => page.evaluate(() => window.__sfx.dbg().stat.played);
      const run = (msgs, st) => page.evaluate(({ msgs, st }) => {
        const c = { role: 'primary', others: new Map(), meta: { worldOffsetX: 0, worldOffsetY: 0 },
                    mobs: new Map((st.m || []).map((m) => [m.mid, m])), buildings: new Map(), groundItems: new Map(), resources: new Map() };
        for (const m of msgs) window.__sfx.recv(m, c);
      }, { msgs, st: st || {} });
      const count = async (msgs, st) => { await page.waitForTimeout(900); const b = await played(); await run(msgs, st); return (await played()) - b; };
      const WOLF = { mid: 'm1', type: 'wolf', x: 40, y: 0, hp: 50 };
      const BEAR = { mid: 'm2', type: 'bear', x: 40, y: 0, hp: 80 };
      const C = {
        hurt: [[{ type: 'mob_damaged', mid: 'm1', hp: 30 }], { m: [WOLF] }],
        heal: [[{ type: 'mob_damaged', mid: 'm1', hp: 55 }], { m: [WOLF] }],
        hurtUnknown: [[{ type: 'mob_damaged', mid: 'zz', hp: 1 }], {}],
        tamed: [[{ type: 'mob_tamed', mid: 'm2', owner: 'x' }], { m: [BEAR] }],
        death: [[{ type: 'corpse_added', corpse: { cid: 'c1', type: 'wolf', x: 50, y: 0 } }], {}],
        craft: [[{ type: 'inventory', where: 'craft', inventory: {} }], {}],
        noWhere: [[{ type: 'inventory', inventory: {} }, { type: 'craft_queue', queue: [] }], {}],
        bearScan: null,
      };
      delete C.bearScan;
      for (const k of Object.keys(C)) await run(C[k][0], C[k][1]);      // 데우기
      await page.waitForTimeout(1500);
      const n = {};
      for (const k of Object.keys(C)) {
        // 쿨다운이 긴 종 울음(곰 6초)은 데우기의 **받는 중** 호출도 쿨다운을 찍는다 — 그만큼 기다린다(표에서 읽은 값)
        if (k === 'tamed') await page.waitForTimeout(((MAN.keys[MAN.mobs.bear] || {}).cooldownMs || 0) + 300);
        n[k] = await count(C[k][0], C[k][1]);
      }
      ok(n.hurt === 1 && n.heal === 0 && n.hurtUnknown === 0, '㊽ ★짐승이 맞으면 1 · 먹여 회복(hp 오름) 0 · 처음 보는 짐승 0', `맞음 ${n.hurt} · 회복 ${n.heal} · 모름 ${n.hurtUnknown}`);
      ok(n.tamed === 1, '㊾ 길들이면 그 종이 운다(곰 · `mobs` 표)', `${n.tamed}`);
      ok(n.death === 1, '㊿ 짐승이 죽어 사체가 생기면 1', `${n.death}`);
      ok(n.craft === 1 && n.noWhere === 0, '51 ★★제작·보존을 **받으면** 1(`where:craft` · 서버 한 줄) · 맡김·줄 갱신 0', `받음 ${n.craft} · 낱말 없음 ${n.noWhere}`);
      // 52 새 종 울음 — 훑기(진짜 `scan`)에 곰이 보이면 곰 소리
      const scanN = await page.evaluate(async () => {
        const before = window.__sfx.dbg().stat.played;
        _sfxScanAt = 0; window.__sfx.scan([{ kind: 'mob', m: { type: 'quail' }, ax: 0, ay: 0 }], 0, 0);
        await new Promise((r) => setTimeout(r, 900));
        _sfxScanAt = 0; window.__sfx.scan([{ kind: 'mob', m: { type: 'pheasant' }, ax: 0, ay: 0 }], 0, 0);
        await new Promise((r) => setTimeout(r, 900));
        const mid = window.__sfx.dbg().stat.played;
        _sfxScanAt = 0; window.__sfx.scan([{ kind: 'mob', m: { type: 'moose' }, ax: 0, ay: 0 }], 0, 0);   // 표에 없는 종 = 무음
        return { some: mid - before, moose: window.__sfx.dbg().stat.played - mid };
      });
      ok(scanN.some >= 1 && scanN.moose === 0, '52 새 종(메추라기·꿩)은 보이면 운다 · 표에 없는 종(무스)은 무음', `울림 ${scanN.some} · 무스 ${scanN.moose}`);
    }

    // 54 ★★★[T457] **전쟁 병사 몸** — `tick` 의 병사 hp 가 **줄어든 순간**만 운다(직전 값 = 명부 `c.others`).
    //   T445 교전 30분 실측의 꼴 그대로 먹인다: 줄어든 순간 **34**(그중 0 이 된 것 **9**) → 울림 34(`hit_body` 25 · `downed` 9).
    //   명부 합치기는 제품(`30-n-net` handleMessage)이 `recv` **뒤에** 하는 일이라, 여기서도 매 전문 뒤에 hp 를 적어 넣는다(같은 순서).
    {
      const WB = MAN.warBody || {}, MK = WB._mark;
      await page.evaluate(() => { myPid = 'p1'; myAbsPredicted = { x: 0, y: 0 }; window.__t457 = { role: 'primary', others: new Map(), meta: { worldOffsetX: 0, worldOffsetY: 0 } }; });
      // 전문 하나 = 병사 몸 여럿 · 끝나면 명부 합치기(hp·좌표)
      const tick = (players) => page.evaluate(({ players }) => {
        const c = window.__t457;
        window.__sfx.recv({ type: 'tick', players }, c);
        for (const pp of players) { const o = c.others.get(pp.pid) || { pid: pp.pid }; o.x = pp.x; o.y = pp.y; o.hp = pp.hp; c.others.set(pp.pid, o); }
      }, { players });
      const hpChanged = (m) => page.evaluate((m) => { const c = window.__t457; window.__sfx.recv(m, c); const o = c.others.get(m.pid); if (o) o.hp = m.hp; }, m);
      const tapN = () => page.evaluate(() => window.__sfx.tap(1e15).n);
      const keysSince = (n) => page.evaluate((n) => window.__sfx.tap(n).plays.map((p) => p.k), n);
      const body = (pid, x, hp, mark) => { const b = { pid, x, y: 0, hp, vx: 0, vy: 0 }; if (mark !== false) b[MK] = 0; return b; };
      const gap = () => page.waitForTimeout(450);   // `hit_body` 0.22s · `downed` 0.38s — 겹쳐 `maxSame` 에 막히지 않게
      // 데우기(버퍼 받기) — 첫 울림은 받는 중이라 무음이 계약이다
      await tick([body('w0', 50, 100)]); await tick([body('w0', 50, 60)]); await tick([body('w0', 50, 0)]);
      await page.waitForTimeout(1500);
      // ⓐ 34 순간 — 병사 열 · 곁(≤ 200px) · 25 번 깎이고 9 번 0 이 된다
      const plan = [];
      for (let i = 0; i < 9; i++) { const pid = 's' + i; plan.push([pid, 30 + i * 18, 100]); plan.push([pid, 30 + i * 18, 70]); plan.push([pid, 30 + i * 18, 40]); plan.push([pid, 30 + i * 18, 0]); }   // 9 × (첫 봄 + 줄 둘 + 0)
      for (let i = 0; i < 7; i++) { plan.push(['t' + i, 60 + i * 15, 100]); plan.push(['t' + i, 60 + i * 15, 88]); }                                            // 7 × 줄 하나
      const n0 = await tapN(); let drops = 0, zeros = 0; const last = {};
      for (const [pid, x, hp] of plan) {
        if (last[pid] != null && hp < last[pid]) { drops++; if (hp <= 0) zeros++; }
        last[pid] = hp; await tick([body(pid, x, hp)]); await gap();
      }
      const ks = await keysSince(n0);
      const nHit = ks.filter((k) => k === WB.hurt).length, nDown = ks.filter((k) => k === WB.down).length;
      ok(drops === 34 && zeros === 9 && nHit === 25 && nDown === 9 && ks.length === 34,
         '54a ★★★병사 hp 가 줄어든 순간 34 → 울림 34(`hit_body` 25 · 0 이 된 9 → `downed` 9) — 한 사건 = 한 소리',
         `줄어듦 ${drops}(0 됨 ${zeros}) · 울림 ${ks.length} = ${WB.hurt} ${nHit} · ${WB.down} ${nDown}`);
      // ⓑ 미끼 — 같은 hp 가 매 틱 온다(병사가 그대로 서 있다 · 25 틱). 직전 값을 안 보고 "maxHp 보다 낮다" 로 재면 25 번 운다.
      const n1 = await tapN(); let naive = 0;
      for (let i = 0; i < 25; i++) { await tick([body('t0', 60, 88)]); if (88 < 100) naive++; }
      await gap();
      const same = (await keysSince(n1)).length;
      ok(same === 0 && naive === 25, '54b ★자명 통과 금지 — 같은 hp 가 25 틱 와도 **0**(직전 값을 안 보는 자는 25 번 운다)', `층 ${same} · 직전 값 없는 셈 ${naive}`);
      // ⓒ 반경 밖 5 · 처음 보는 몸 · 오른 hp · 병사 표식 없는 몸 — 전부 0
      const n2 = await tapN();
      for (let i = 0; i < 5; i++) { await tick([body('far' + i, 900, 100)]); await tick([body('far' + i, 900, 50)]); await gap(); }
      const far = (await keysSince(n2)).length;
      const n3 = await tapN();
      await tick([body('new1', 40, 30)]); await gap();                                   // 처음 보는 몸(직전 값 없음)
      await tick([body('t1', 75, 95)]); await gap();                                     // 88 → 95 오름
      await tick([body('v1', 40, 100, false)]); await tick([body('v1', 40, 60, false)]); await gap();   // 마을 사람(표식 없음 — `hp_changed` 가 맡는다)
      const quiet = (await keysSince(n3)).length;
      ok(far === 0, `54c ★반경 밖(900px · 키 반경 ${(MAN.keys[WB.hurt] || {}).radius}) 병사 다섯은 안 운다`, `${far}`);
      ok(quiet === 0, '54d 처음 보는 몸 · 오른 hp · 병사 표식 없는 몸 — 0', `${quiet}`);
      // ⓔ 이중 0 — 내 몸(주 연결 p1)이 병사 칸을 달고 와도 `tick` 에선 안 운다 · 내 다침은 `hp_changed`(hpWhy) 한 번
      await tick([body('p1', 0, 100)]); await gap();
      const n4 = await tapN();
      await hpChanged({ type: 'hp_changed', pid: 'p1', hp: 70, why: 'mob' });
      await tick([body('p1', 0, 70)]); await tick([body('p1', 0, 40)]); await gap();
      const mine = (await keysSince(n4)).length;
      ok(mine === 1, '54e ★★내 몸은 **한 번**만 운다(`hpWhy` · `tick` 길은 내 pid 를 안 본다) — 두 번이면 빨갛다', `${mine}`);
      // ⓕ 이중 0 — 사람이 병사를 치면 `hp_changed`(why player) 가 먼저 명부를 낮춘다 → 뒤따르는 같은 값 `tick` 은 조용
      const n5 = await tapN();
      await hpChanged({ type: 'hp_changed', pid: 't2', hp: 50, why: 'player' });
      await tick([body('t2', 90, 50)]); await gap();
      const pvp = (await keysSince(n5)).length;
      ok(pvp === 1, '54f 사람이 병사를 친 한 대 = 울림 1(`hp_changed` 1 + 같은 값 `tick` 0)', `${pvp}`);
      ok(MK && !new RegExp(`['"\`]${MK}['"\`]`).test(require('./code-only.js')(fs.readFileSync(path.join(ROOT, 'public/client/48-a-audio.js'), 'utf8'))),
         '54g 병사 표식 칸 이름은 표(`warBody._mark`)가 댄다 — 층 코드에 박혀 있지 않다', `_mark = ${MK}`);
      await page.evaluate(() => { myPid = null; delete window.__t457; });
    }

    // 55 ★★[T465] **전쟁 화살** — T458 이 있는 모양(`arrow_spawn` · `arrow_removed` + `hit`)으로 보낸다. 소리 층은 **손대지 않았다**:
    //   발사는 `combat.arrow_spawn → arrow_shoot`(T387 표 그대로 · 쏜 자리) · 맞음의 정본은 **몸의 hp**(T457 `warBody`) —
    //   `arrow_removed.hit` 은 울리지 않는다(같은 몸 같은 순간을 두 번 울리지 않는다) · 땅에 박힘(빗나감)은 이웃 키가 없어 무음(표만).
    {
      const CB = MAN.combat || {}, WB = MAN.warBody || {}, MK = WB._mark;
      await page.evaluate(() => { myPid = 'p1'; myAbsPredicted = { x: 0, y: 0 }; window.__t465 = { role: 'primary', others: new Map(), meta: { worldOffsetX: 0, worldOffsetY: 0 } }; });
      const send = (m) => page.evaluate((m) => { const c = window.__t465; window.__sfx.recv(m, c);
        if (m.type === 'tick') for (const pp of m.players) { const o = c.others.get(pp.pid) || { pid: pp.pid }; o.x = pp.x; o.y = pp.y; o.hp = pp.hp; c.others.set(pp.pid, o); }
        if (m.type === 'hp_changed') { const o = c.others.get(m.pid); if (o) o.hp = m.hp; } }, m);
      const tapN = () => page.evaluate(() => window.__sfx.tap(1e15).n);
      const keysSince = (n) => page.evaluate((n) => window.__sfx.tap(n).plays.map((p) => p.k), n);
      const gap = () => page.waitForTimeout(350);   // `arrow_shoot` 0.24s · `hit_body` 0.22s — `maxSame` 에 안 막히게
      const soldier = (pid, x, hp) => { const b = { pid, x, y: 0, hp, vx: 0, vy: 0 }; b[MK] = 0; return b; };
      // 데우기
      await send({ type: 'arrow_spawn', aid: 'W0.0', x: 20, y: 0, vx: 1, vy: 0, ownerPid: 'a0' }); await send({ type: 'tick', players: [soldier('d0', 60, 100)] }); await send({ type: 'tick', players: [soldier('d0', 60, 80)] });
      await page.waitForTimeout(1200);
      // ⓐ 화살 12 발 — 궁수 셋(곁 ≤ 200px) · 넷은 맞고(뒤따르는 `tick` 에서 맞은 몸 hp 가 준다) · 여덟은 땅
      const n0 = await tapN(); let shots = 0, hits = 0, ends = 0;
      for (let i = 0; i < 12; i++) {
        const aid = 'W1.' + (i + 1), arc = 'a' + (i % 3), x = 40 + (i % 3) * 30;
        await send({ type: 'arrow_spawn', aid, x, y: 0, vx: 300, vy: 0, ownerPid: arc }); shots++; await gap();
        if (i % 3 === 0) {
          const pid = 'd' + (1 + i / 3), hp0 = 100;
          await send({ type: 'tick', players: [soldier(pid, 150, hp0)] });                      // 맞기 전 한 번 봄(직전 값)
          await send({ type: 'arrow_removed', aid, hit: pid }); hits++;
          await send({ type: 'tick', players: [soldier(pid, 150, hp0 - 23)] });                 // battle-core 가 깎은 hp 가 다음 `tick` 에 온다
        } else { await send({ type: 'arrow_removed', aid }); ends++; }
        await gap();
      }
      const ks = await keysSince(n0);
      const nShot = ks.filter((k) => k === CB.arrow_spawn).length, nHit = ks.filter((k) => k === WB.hurt).length;
      ok(shots === 12 && nShot === 12 && hits === 4 && nHit === 4 && ks.length === 16,
         '55a ★★화살 12 발 → `arrow_shoot` 12 · 맞음 4 → `hit_body` 4(몸 hp 가 정본 — `arrow_removed.hit` 은 안 운다) · 땅 8 → 0',
         `발사 ${shots}→${nShot} · 맞음 ${hits}→${nHit} · 땅 ${ends}→0 · 울림 합 ${ks.length}`);
      // ⓑ 미끼 — 명중을 **화살 쪽에서도** 울리면(표에 `arrow_removed` 를 한 줄 더하면) 맞음 하나가 두 번 운다
      const n1 = await tapN();
      await page.evaluate((k) => { _sfxMan.combat.arrow_removed = k; }, WB.hurt);
      await send({ type: 'tick', players: [soldier('d9', 100, 100)] });
      await send({ type: 'arrow_removed', aid: 'W1.99', hit: 'd9', x: 100, y: 0 });              // (표가 좌표를 원하므로 미끼에만 실었다)
      await send({ type: 'tick', players: [soldier('d9', 100, 70)] }); await gap();
      await page.evaluate(() => { delete _sfxMan.combat.arrow_removed; });
      const dbl = (await keysSince(n1)).filter((k) => k === WB.hurt).length;
      ok(dbl === 2, '55b ★자명 통과 금지 — 명중을 화살 쪽에서도 울리면 한 대가 **두 번** 운다(55a 의 4 는 한 대 = 한 소리라서 4다)', `미끼 ${dbl}`);
      // ⓒ 반경 밖(900px · 키 반경 ${(MAN.keys[CB.arrow_spawn] || {}).radius}) 발사 셋 → 0 · 관측자 0 이면 서버가 안 보낸다(메시지 0 = 울림 0 · `test-war-world ⓧ`)
      const n2 = await tapN();
      for (let i = 0; i < 3; i++) { await send({ type: 'arrow_spawn', aid: 'W2.' + i, x: 900, y: 0, vx: 1, vy: 0, ownerPid: 'a9' }); await gap(); }
      const far = (await keysSince(n2)).length;
      ok(far === 0, `55c ★반경 밖(900px) 화살 셋 → 0`, `${far}`);
      // ⓓ 내 화살(플레이어 `arrow:` 길) — 쏨 1 · 남(p2)이 맞음 `hp_changed why:arrow` 1 · 끝 `arrow_removed`(hit 없음) 0 = 2(사건 둘 · 이중 0)
      await send({ type: 'tick', players: [{ pid: 'p2', x: 70, y: 0, hp: 100, vx: 0, vy: 0 }] });
      const n3 = await tapN();
      await send({ type: 'arrow_spawn', aid: 'z_ar9', x: 0, y: 0, vx: 1, vy: 0, ownerPid: 'p1' }); await gap();
      await send({ type: 'hp_changed', pid: 'p2', hp: 80, why: 'arrow' });
      await send({ type: 'arrow_removed', aid: 'z_ar9' }); await gap();
      const mine = await keysSince(n3);
      ok(mine.length === 2 && mine.filter((k) => k === CB.arrow_spawn).length === 1 && mine.filter((k) => k === (MAN.hpWhy || {}).arrow).length === 1,
         '55d 내 화살 — 쏨 1 + 맞음(`hpWhy.arrow`) 1 · 끝 0 = 2(이중 0)', mine.join(' '));
      // ⓔ 화살이 든 창의 **상한**(손 조합 · 대조) — 운영 픽스처 교전엔 궁수가 없어 실측 창에 화살이 0 이었다(보고 T465 ⓒ).
      //   같은 창에 날 수 있는 가장 많은 발사(`arrow_shoot` × `maxSame`) + 교전 실측 최악(병사 둘 맞음 + 새 + 바람) + 쓰러짐 하나.
      const HA = MAN._실측 && MAN._실측.handArrows;
      const ms = (MAN.keys[CB.arrow_spawn] || {}).maxSame || 3;
      const combo = [...Array(ms).fill(CB.arrow_spawn), WB.hurt, WB.hurt, WB.down, 'bird', 'wind'];
      const ra = await page.evaluate((k) => window.__sfx.probe(k, { seconds: 4 }), combo);
      ok(ra && !ra.err && ra.withLimiter.clipped === 0 && ra.withLimiter.peak < 1 && Array.isArray(HA) && HA.join('+') === combo.join('+') && Math.abs(ra.withoutLimiter.peak - MAN._실측.handArrowsPeak) <= 0.01,
         `55e 화살 든 창 상한(손 · 대조) — 발사 ${ms} + 맞음 둘 + 쓰러짐 + 새 + 바람 · 리미터 끼면 클리핑 0 · 표(\`handArrows\`)와 같은 값`,
         ra && !ra.err ? `없이 ${ra.withoutLimiter.peak}(${ra.withoutLimiter.peakDb} dB · 클리핑 ${ra.withoutLimiter.clipped}) → 끼고 ${ra.withLimiter.peak} · 클리핑 ${ra.withLimiter.clipped} · 표 ${MAN._실측.handArrowsPeak}` : String(ra && ra.err));
      await page.evaluate(() => { myPid = null; delete window.__t465; });
    }

    // 56 ★★[T473] **바다는 시냇물이 아니다** · 고인 물 — 진짜 `scan` 을 부른다(지형 판정은 00-const 의 그 함수들 · 존 하나를 세워 준다).
    //   바다 = 해안선 타일(`waterTilesByZone`) · 민물 = `Terrain.isWaterCellLocal`(여기선 한 줄로 세운 강) — 층은 둘을 **따로** 운다.
    {
      const WS = MAN.waterSplit || {}, RL = MAN.resourceLoop || {};
      const setup = (mode) => page.evaluate((mode) => {
        zonesMeta = { T: { id: 'T', worldOffsetX: 0, worldOffsetY: 0, zoneWidth: 20000, zoneHeight: 20000 } };
        _waterCellCache.clear(); _sfxWaterCell = null;
        waterTilesByZone.T = new Set();
        if (mode === 'sea') for (let tx = 5; tx < 40; tx++) waterTilesByZone.T.add(tx + '_14');          // 바다 띠(y = 448~480px)
        window.Terrain = { isWaterCellLocal: (zid, x, y) => mode === 'river' && y > 448 && y < 480, isRockCellLocal: () => false };   // 강 한 줄(같은 자리)
        myAbsPredicted = { x: 600, y: 400 };                                                         // 물에서 ~60px
      }, mode);
      const loopsNow = () => page.evaluate(async () => { _sfxScanAt = 0; window.__sfx.scan([], 600, 400); await new Promise((r) => setTimeout(r, 300)); return [..._sfxLoops.keys()].filter((k) => /^amb:(water|waves)$/.test(k)).sort(); });
      await setup('sea'); await loopsNow(); await setup('river'); await loopsNow(); await page.waitForTimeout(800);   // 데우기(두 버퍼 받기 — 첫 번은 받는 중 = 무음이 계약)
      await setup('sea'); const sea = await loopsNow();
      await setup('river'); const river = await loopsNow();
      await setup('none'); const none = await loopsNow();
      ok(sea.join() === 'amb:' + WS.바다 && river.join() === 'amb:' + WS.민물 && none.length === 0,
         `56a ★★바닷가 = \`${WS.바다}\` 만 · 강가 = \`${WS.민물}\` 만 · 물 없음 = 0(종전엔 바다도 시냇물이었다)`, `바다 [${sea}] · 강 [${river}] · 없음 [${none}]`);
      // 미끼 — 가르는 표(`waterSplit`)를 빼면 바닷가에서 다시 시냇물이 운다(종전 그대로)
      await setup('sea'); await page.evaluate(() => { window.__t473ws = _sfxMan.waterSplit; delete _sfxMan.waterSplit; });
      const seaOld = await loopsNow();
      await page.evaluate(() => { _sfxMan.waterSplit = window.__t473ws; delete window.__t473ws; });
      ok(seaOld.join() === 'amb:water', '56b 자명 통과 금지 — 표를 빼면 바닷가에서 `water`(시냇물)가 운다(종전 모습 · 56a 는 표가 가른 값이다)', `[${seaOld}]`);
      // 고인 물 — 자원 자리 반복(건물 반복과 같은 문법) · 보이면 켜지고 안 보이면 멎는다 · 반경 밖이면 0
      const has = (ax) => page.evaluate(async ({ ax, k }) => {
        _sfxScanAt = 0; window.__sfx.scan(ax == null ? [] : [{ kind: 'resource', r: { id: 'wp1', type: 'water_pool', x: ax, y: 400 }, ax, ay: 400 }], 600, 400);
        await new Promise((r) => setTimeout(r, 300)); return _sfxLoops.has(k + ':wp1');
      }, { ax, k: RL.water_pool });
      await setup('none');
      await has(650); await page.waitForTimeout(600);                                            // 데우기(버퍼 받기)
      const on = await has(650), gone = await has(null), far = await has(600 + ((MAN.keys[RL.water_pool] || {}).radius || 0) + 100);
      ok(on === true && gone === false && far === false, `56c 고인 물 — 곁(50px)이면 \`${RL.water_pool}\` 반복 · 안 보이면 멎음 · 반경 밖 0`, `곁 ${on} · 사라짐 ${gone} · 반경 밖 ${far}`);
      // 56d ★환경 상수 + 정본 최악 사건 — 환경은 늘 깔린다(★PM): `worstComboEnv` = `worstCombo` ∪ 물가 판 실측 반복 묶음. 리미터가 잡는가 · 표 값 = 지금 값
      const M = MAN._실측 || {};
      const re = await page.evaluate((k) => window.__sfx.probe(k, { seconds: 4 }), M.worstComboEnv || []);
      ok(Array.isArray(M.worstComboEnv) && (M.worstCombo || []).every((k) => M.worstComboEnv.includes(k)) && re && !re.err && re.withLimiter.clipped === 0 && re.withLimiter.peak < 1 && Math.abs(re.withoutLimiter.peak - M.worstComboEnvPeak) <= 0.01,
         '56d ★환경 상수를 얹은 최악(`worstComboEnv`) — 리미터 끼면 클리핑 0 · 표와 같은 값',
         re && !re.err ? `${(M.worstComboEnv || []).join('+')} · 없이 ${re.withoutLimiter.peak}(클리핑 ${re.withoutLimiter.clipped}) → 끼고 ${re.withLimiter.peak} · 표 ${M.worstComboEnvPeak}` : String(re && re.err));
      await page.evaluate(() => { zonesMeta = {}; _waterCellCache.clear(); _sfxWaterCell = null; delete waterTilesByZone.T; delete window.Terrain; for (const k of [..._sfxLoops.keys()]) { if (/^amb:(water|waves)$|^water_pool:/.test(k)) { try { _sfxLoops.get(k).src.stop(); } catch (e) {} _sfxLoops.delete(k); } } });
    }

    // 57 ★★[T482] 시설 가동 · 밤 벌레 — 진짜 `scan`
    {
      const NA = MAN.nightAmbient || {};
      const kiln = (job) => [{ kind: 'building', b: { id: 'kz', type: 'charcoal_kiln', x: 0, y: 0, data: job ? { job } : {} }, ax: 0, ay: 0 }];
      const fireOn = (job) => page.evaluate(async (list) => { _sfxScanAt = 0; myAbsPredicted = { x: 0, y: 0 }; window.__sfx.scan(list, 0, 0); await new Promise((r) => setTimeout(r, 300)); return [..._sfxLoops.keys()].some((k) => /^fire:kz/.test(k)); }, kiln(job));
      const now = await page.evaluate(() => worldNow());
      await fireOn({ kind: 'kiln', startedAt: now, until: now + 60000 }); await page.waitForTimeout(600);   // 데우기
      const burning = await fireOn({ kind: 'kiln', startedAt: now, until: now + 60000 });
      const cooled = await fireOn({ kind: 'kiln', startedAt: now - 90000, until: now - 1000 });
      const idle = await fireOn(null);
      ok(burning === true && cooled === false && idle === false, '57a ★숯가마 — 타는 동안 불소리 · 다 탄 뒤(꺼내기 전 식은 가마) 0 · 조업 없음 0', `타는 중 ${burning} · 식음 ${cooled} · 없음 ${idle}`);
      // 밤 벌레 — 키가 없으면 밤이어도 0 · 미끼: 키를 한 줄(다른 파일로) 세우면 운다(배선은 서 있다)
      const night = (addKey) => page.evaluate(async ({ k, addKey }) => {
        const saveN = isNight; isNight = () => true; _sfxWx.precip = 0; _sfxWx.indoor = false;
        if (addKey) _sfxMan.keys[k] = Object.assign({}, _sfxMan.keys.bird);
        _sfxScanAt = 0; window.__sfx.scan([], 0, 0); await new Promise((r) => setTimeout(r, 400));
        _sfxScanAt = 0; window.__sfx.scan([], 0, 0); await new Promise((r) => setTimeout(r, 300));
        const on = [..._sfxLoops.keys()].includes('amb:' + k);
        if (addKey) { window.__sfx.ambient(k, 0, {}); delete _sfxMan.keys[k]; }
        isNight = saveN; return on;
      }, { k: NA.key, addKey });
      const noKey = await night(false), withKey = await night(true);
      ok(noKey === false && withKey === true, `57b 밤 벌레(\`${NA.key}\`) — 키 없음 = 무음 · 미끼: 키 한 줄이면 밤에 운다(자리 배선은 서 있다)`, `없음 ${noKey} · 세움 ${withKey}`);
    }

    // 58 ★★[T492] 계절 환경음 — 손잡이 끔 = 종전 · 켬 = 눈 걸음 · 바람 × 적설 · 계절 칸 (진짜 `weather`·`scan`·`sfxGroundKey`)
    {
      const SA = MAN.seasonAmb || {};
      const trees = Array.from({ length: 8 }, (_, i) => ({ kind: 'resource', r: { id: 't' + i, type: 'tree' }, ax: 10 * i, ay: 0 }));
      // 한 장면: 손잡이·적설·계절·밤낮·실내·발밑을 놓고 층의 세 자리(바람 이득 · 발밑 키 · 켜진 환경 반복)를 읽는다
      const scene = (o) => page.evaluate(async ({ o, trees }) => {
        const saveN = isNight, saveW = window.isWaterAtAbs, saveCal = myCalendar;
        const had = Object.prototype.hasOwnProperty.call(uiCfg, 'seasonAmb');
        if (o.knob) uiCfg.seasonAmb = true; else delete uiCfg.seasonAmb;
        isNight = () => !!o.night; myCalendar = o.season ? { seasonKo: o.season } : null;
        myAbsPredicted = { x: 3 * 32 + 16, y: 4 * 32 + 16 };
        if (o.water) isWaterAtAbs = () => true;
        if (o.addKey) _sfxMan.keys[o.addKey] = Object.assign({}, _sfxMan.keys.bird);
        window.__camCellLocal = () => [3, 4];
        const c = { role: 'primary', meta: { worldOffsetX: 0, worldOffsetY: 0 }, buildings: new Map(), others: new Map() };
        (o.blds || []).forEach((t, i) => c.buildings.set('b' + i, { id: 'b' + i, type: t, x: 3 * 32 + 16, y: 4 * 32 + 16, floor: 0 }));
        conns.set('zS', c); primaryZoneId = 'zS'; myFloor = 0; _sfxSurfN = -1; _sfxGroundCell = null;
        const orig = sfxLoop, gains = {};
        sfxLoop = (id, k, g) => { gains[id] = g; return orig(id, k, g); };
        const w = { precip: 0, wind: 1, tempC: -3 }; if (typeof o.snow === 'number') w.snow = o.snow;
        window.__sfx.weather(w, !!o.indoor);
        const wx = Object.assign({}, _sfxWx);
        const step = sfxGroundKey();
        _sfxScanAt = 0; window.__sfx.scan(trees, 0, 0); await new Promise((r) => setTimeout(r, 500));
        _sfxScanAt = 0; window.__sfx.scan(trees, 0, 0); await new Promise((r) => setTimeout(r, 200));
        const loops = [..._sfxLoops.keys()].filter((k) => /^amb:/.test(k)).sort();
        sfxLoop = orig;
        for (const k of loops) window.__sfx.ambient(k.slice(4), 0, {});
        if (o.addKey) delete _sfxMan.keys[o.addKey];
        conns.delete('zS'); primaryZoneId = null; isNight = saveN; myCalendar = saveCal;
        if (o.water) isWaterAtAbs = saveW;
        if (!had) delete uiCfg.seasonAmb;
        return { wind: +(gains['amb:wind'] || 0).toFixed(4), step, loops, wxKeys: Object.keys(wx).sort().join(','), snow: wx.snow };
      }, { o, trees });
      // 58a 끔 = 종전 — 적설 1 · 겨울이어도 바람 이득·발밑·새·날씨 칸 모양이 그대로(표를 안 읽는다)
      const off = await scene({ knob: false, snow: 1, season: '겨울' });
      const off0 = await scene({ knob: false, season: '겨울' });
      ok(JSON.stringify(off) === JSON.stringify(off0) && off.wind === 0.5 && off.step === ((MAN.ground || {})._기본) && off.loops.includes('amb:bird') && off.wxKeys === 'indoor,precip',
         '58a ★손잡이 끔 = 종전 — 적설 1·겨울이어도 바람 0.5 · 발밑 흙 · 새 그대로 · 날씨 칸 모양 동일(적설 칸 0)', JSON.stringify(off));
      // 58b 눈 위 걸음 — 켬 + 적설 > 0 이면 `step_snow` · 적설 0 · 실내 바닥 · 실내 · 물 위는 아니다
      const sOn = await scene({ knob: true, snow: 1, season: '겨울' });
      const s0 = await scene({ knob: true, snow: 0, season: '겨울' });
      const sNo = await scene({ knob: true, season: '겨울' });
      const sFl = await scene({ knob: true, snow: 1, season: '겨울', blds: ['floor'] });
      const sFarm = await scene({ knob: true, snow: 1, season: '겨울', blds: ['farmland'] });
      const sIn = await scene({ knob: true, snow: 1, season: '겨울', indoor: true });
      const sW = await scene({ knob: true, snow: 1, season: '겨울', water: true });
      const SK = (SA.stepSnow || {}).key;
      ok(sOn.step === SK && s0.step !== SK && sNo.step !== SK && sFl.step === (MAN.surface || {}).floor && sFarm.step === SK && sIn.step !== SK && sW.step !== SK,
         '58b ★눈 위 걸음 — 켬·적설 1 = `step_snow`(밭도 덮는다) · 적설 0/칸 없음(T487 전) · 실내 바닥 · 실내 · 물 위는 아니다',
         `눈 ${sOn.step} · 0 ${s0.step} · 없음 ${sNo.step} · 바닥 ${sFl.step} · 밭 ${sFarm.step} · 실내 ${sIn.step} · 물 ${sW.step}`);
      // 58c 바람 × 적설 — 눈 1 = 0.5 × √(1 − 0.445) · 눈 0 = 0.5 · 칸 없음 = 0.5
      const WS = SA.windSnow || {}, want1 = +(0.5 * Math.sqrt(1 - WS.alpha / WS.paths)).toFixed(4);
      ok(Math.abs(sOn.wind - want1) < 1e-3 && s0.wind === 0.5 && sNo.wind === 0.5,
         '58c ★눈 덮인 들의 바람 — 적설 1 = 0.5 × √(1 − 0.445) · 적설 0·칸 없음 = 0.5 그대로', `눈 1 ${sOn.wind}(식 ${want1}) · 0 ${s0.wind} · 없음 ${sNo.wind}`);
      // 58d 계절 칸 — 겨울 낮 새 0 · 봄 낮 새 · 여름 밤 귀뚜라미 키 없음 = 무음 · 미끼: 매미 키 한 줄 → 여름 낮 ○ · 겨울 낮 ✗
      const winD = await scene({ knob: true, snow: 0, season: '겨울' });
      const sprD = await scene({ knob: true, snow: 0, season: '봄' });
      const sumN = await scene({ knob: true, snow: 0, season: '여름', night: true });
      const sumC = await scene({ knob: true, snow: 0, season: '여름', addKey: 'cicada' });
      const winC = await scene({ knob: true, snow: 0, season: '겨울', addKey: 'cicada' });
      ok(!winD.loops.includes('amb:bird') && sprD.loops.includes('amb:bird') && !sumN.loops.some((k) => /bird|crickets/.test(k))
         && sumC.loops.includes('amb:cicada') && !winC.loops.includes('amb:cicada'),
         '58d ★계절 칸 — 겨울 낮 새 0 · 봄 낮 새 · 여름 밤 귀뚜라미 = 키 없음 무음 · 미끼: 매미 키 한 줄이면 여름 낮 ○ · 겨울 낮 ✗',
         `겨울 ${winD.loops.join('+') || '-'} · 봄 ${sprD.loops.join('+')} · 여름밤 ${sumN.loops.join('+') || '-'} · 매미(여름) ${sumC.loops.join('+')} · 매미(겨울) ${winC.loops.join('+') || '-'}`);
      // 58e 헤드룸 — 손 상한(환경 + 불 둘 + 최악 사건 + 눈 걸음 둘 + 새)을 리미터가 클리핑 0 으로 잡는다 · 표와 같은 값
      const HS = (MAN._실측 || {}).handSeason || {};
      const hr = await page.evaluate((k) => window.__sfx.probe(k, { seconds: 4 }), HS.keys || []);
      ok(hr && !hr.err && hr.withLimiter.clipped === 0 && hr.withLimiter.peak < 1 && Math.abs(hr.withoutLimiter.peak - HS.peak) <= 0.01,
         '58e ★헤드룸 — 이 카드 셋을 얹은 손 상한: 리미터 끼면 클리핑 0 · 표와 같은 값',
         hr && !hr.err ? `없이 ${hr.withoutLimiter.peak}(클리핑 ${hr.withoutLimiter.clipped}) → 끼고 ${hr.withLimiter.peak} · 표 ${HS.peak}` : String(hr && hr.err));
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
    // ⑲~㉒ ★★★[T323] 소리판 — **행 수가 키 수이고, 단추가 진짜 층을 부른다**
    //   `test-audio ⑬` 은 페이지 **소스**에 키가 안 박혔다를 정적으로 지킨다. 여기서는 그 페이지를
    //   실제로 열어 **몇 행이 나오나**를 세고(정본이 정말 표를 만드는가), 「층」 단추가
    //   **제품의 `__sfx`** 를 부르는가를 `stat.played` 증분으로 잰다(족보 226 — 수신에서 센다).
    {
      const bp = await browser.newPage();
      const berrs = [];
      bp.on('pageerror', (e) => berrs.push(String(e).slice(0, 140)));
      await bp.goto(`http://127.0.0.1:${PORT}/sfx-board.html`, { waitUntil: 'networkidle', timeout: 30000 });
      await bp.waitForFunction(() => document.querySelectorAll('#sfx tbody tr').length > 0, null, { timeout: 20000 });

      const keysWithFile = Object.keys(MAN.keys).filter((k) => !k.startsWith('_'));
      const rows = await bp.evaluate(() => document.querySelectorAll('#sfx tbody tr').length);
      ok(rows === keysWithFile.length,
         '⑲ ★★행 수 = 키 수(페이지가 매니페스트에서 표를 만든다 — 손 목록 0)',
         `행 ${rows} · 키 ${keysWithFile.length}`);

      const bgmRows = await bp.evaluate(() => document.querySelectorAll('#bgm tbody tr').length);
      const trackN = Object.keys((META_TRACKS || {})).length;
      ok(bgmRows === trackN, '⑳ ★BGM 행 수 = `render-meta.json` 의 곡 수', `행 ${bgmRows} · 곡 ${trackN}`);

      // ㉒ ★★「층」 단추가 **제품의 `__sfx`** 를 부른다 — 호출 수로 잰다
      await bp.mouse.click(5, 5);                       // 제스처(층은 첫 동작에서 깨어난다)
      await bp.waitForFunction(() => window.__sfx && window.__sfx.dbg().ctx, null, { timeout: 20000 });
      await bp.evaluate(() => document.querySelector('#wake').click());   // 데우기(페이지가 probe 로 돈다)
      await bp.waitForFunction(() => {
        const d = window.__sfx && window.__sfx.dbg(); return d && d.stat && d.stat.pending === 0;
      }, null, { timeout: 30000 }).catch(() => {});
      await bp.waitForTimeout(400);
      const before = await bp.evaluate(() => window.__sfx.dbg().stat.played);
      await bp.evaluate(() => {
        // 파일 있는 첫 행의 「층」 단추를 누른다(자리를 안 주므로 반경 감쇠는 0 거리 = 최대)
        const rows = document.querySelectorAll('#sfx tbody tr');
        for (const tr of rows) {
          const bs = tr.querySelectorAll('button.play');
          if (bs.length > 1 && !bs[1].disabled) { bs[1].click(); return; }
        }
      });
      await bp.waitForTimeout(400);
      const after = await bp.evaluate(() => window.__sfx.dbg().stat.played);
      ok(after - before === 1,
         '㉒ ★★「층」 단추가 제품 `__sfx` 를 **실제로** 부른다(발신이 아니라 울린 수로 잰다)',
         `울린 횟수 ${after - before}`);

      // ㉓ ★BGM 「층」 — 층이 **제 코드로** 장면을 바꾼다(페이지가 세터를 새로 안 달았다)
      const sc0 = await bp.evaluate(() => (window.__sfx.dbg().bgm || {}).scene);
      await bp.evaluate(() => {
        const rows = document.querySelectorAll('#bgm tbody tr');
        for (const tr of rows) {
          const bs = tr.querySelectorAll('button.play');
          if (bs.length > 1 && /village_night/.test(tr.textContent)) { bs[1].click(); return; }
        }
      });
      await bp.waitForTimeout(500);
      const sc1 = await bp.evaluate(() => (window.__sfx.dbg().bgm || {}).scene);
      ok(sc1 && sc1 !== sc0, '㉓ ★★BGM 「층」 단추가 층의 장면을 바꾼다(제품 수정 0 — 공개 API 로만)',
         `${sc0} → ${sc1}`);

      const bBad = berrs.filter((e) => !/json|zones|fetch/i.test(e));
      ok(bBad.length === 0, '㉔ 소리판에서 난 페이지 오류 0', bBad.slice(0, 2).join(' | ') || '없다');

      await bp.screenshot({ path: '/tmp/sfx-board.png', fullPage: false });
      await bp.close();
    }

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

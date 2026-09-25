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
      ok(Object.keys(CB).filter((k) => !k.startsWith('_')).length === 4,
         '㉞ 자 전제 — `combat` 표의 사건은 넷(쏨·휘두름·쓰러짐·깨어남) · 층이 이름을 코드에 안 박은 것은 test-audio ⑮ 가 철자로 본다',
         Object.entries(CB).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}→${v}`).join(' · '));
      await page.evaluate(() => { myPid = null; });
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

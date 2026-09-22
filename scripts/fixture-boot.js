'use strict';
// ═════════════════════════════════════════════════════════════════════════════
// 서버 기동 기다리기 — **정본 하나** [T344 2026-09-21]
//
// ★왜 있나. 산·지형 계열 하네스 열셋이 central 을 띄운 뒤 `await sleep(2500)` 로 기다렸다.
//   판정문에 상수가 없어 ⑧a 어떤 자에도 안 걸리는 **예산형**이고, 예산이 모자라면
//   그 다음 줄(`page.goto`)이 대신 죽는다 — 09-20 밤 `e2e-mtfoot`·`e2e-mtocc` 의 모양이다.
//
// ⚠**그런데 `waitHttp(/zones)` 로 바꾸는 것은 고침이 아니라 더 깊은 자명 통과다.** 이 카드가 쟀다:
//     · 앞 판의 central 이 아직 3010 을 쥐고 있으면
//     · 새 central 은 `EADDRINUSE` 로 **즉시 죽고**(종료코드 1) — `boot()` 은 stderr 를 안 본다
//     · `waitHttp` 는 **앞 판의 central** 에게 200 을 받아 "기동 성공"이라 답한다
//     · 앞 판이 끝나 그 central 이 죽으면 `page.goto` → `net::ERR_CONNECTION_REFUSED`
//   즉 포트가 답하는 것은 "**내** 서버가 떴다"의 증인이 아니다. 남의 서버일 수 있다.
//
// ⇒ 증인을 **내가 띄운 아이의 입**으로 바꾼다. central 은 `listen` 콜백 안에서
//   `[central] 🏛️ central server up on :PORT` 를 제 손으로 찍는다 — 그 줄이 나왔다는 것은
//   **그 프로세스가 그 포트를 쥐었다**는 뜻이고, 남의 서버로는 절대 만들 수 없는 증거다.
//   아이가 죽으면(EADDRINUSE 포함) 그 자리에서 **이름을 붙여** 돌려준다(조용한 빨강 0).
//
// 상한은 **표에만** 둔다 — 시간을 재서 판정하지 않는다(족보 ⑩). 걸리면 부르는 쪽이 사유를 말한다.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @param {import('child_process').ChildProcess} child  `boot()` 이 돌려준 아이
 * @param {RegExp} re   아이가 스스로 찍는 기동 표식(예: /server up on/)
 * @param {{name?:string, capMs?:number}} [opts]
 * @returns {Promise<{ok:boolean, ms:number, why:string, tail:string}>}
 */
function waitUp(child, re, opts) {
  const name = (opts && opts.name) || 'server';
  const capMs = (opts && opts.capMs) || 120000;   // 표의 수 — 판정에 안 든다
  const t0 = Date.now();
  let tail = '';
  return new Promise((resolve) => {
    let done = false;
    const fin = (ok, why) => {
      if (done) return; done = true;
      clearTimeout(timer);
      if (child.stdout) child.stdout.removeListener('data', onData);
      if (child.stderr) child.stderr.removeListener('data', onData);
      child.removeListener('exit', onExit);
      resolve({ ok, ms: Date.now() - t0, why, tail: tail.slice(-500) });
    };
    const onData = (b) => {
      const s = String(b); tail += s;
      if (re.test(s)) fin(true, `${name} 기동 (${Date.now() - t0}ms · 아이가 제 입으로 말했다)`);
    };
    const onExit = (code, sig) => {
      const busy = /EADDRINUSE/.test(tail);
      fin(false, `★${name} 이 뜨지도 못하고 죽었다 — 종료코드 ${code}${sig ? '/' + sig : ''}`
        + (busy ? ' · **포트를 이미 누가 쥐고 있다(EADDRINUSE)** — 앞 판의 서버가 안 내려갔다'
                : ` · 마지막 출력: ${tail.slice(-200).replace(/\n/g, ' ')}`));
    };
    const timer = setTimeout(() => fin(false,
      `★${name} 이 ${(capMs / 1000) | 0}초 동안 기동 표식을 안 찍었다(상한은 표에만 · 아래가 조용히 빨개지지 않게 이름을 붙인다)`), capMs);
    // ★[T349] **입이 막혀 있으면 상한까지 기다리지 않는다.** `spawn` 의 stdio 가 'ignore' 면
    //   아이가 표식을 찍어도 이쪽엔 안 온다 — 그건 "안 떴다"가 아니라 **못 듣는 것**이고,
    //   구분해서 말해야 부르는 쪽이 고칠 자리를 안다(120초를 조용히 버리는 대신).
    if (!child.stdout && !child.stderr) {
      return fin(false, `★${name} 의 입이 막혀 있다 — spawn 의 stdio 를 ['ignore','pipe','pipe'] 로 열어야 이 자가 듣는다`);
    }
    if (child.stdout) child.stdout.on('data', onData);
    if (child.stderr) child.stderr.on('data', onData);
    child.on('exit', onExit);
    if (child.exitCode !== null) onExit(child.exitCode, child.signalCode);
  });
}

module.exports = { waitUp };

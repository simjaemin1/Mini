// @@split:37-r1-weather — R1 — 날씨 화면 효과: 비·눈 (T93)
//
// ★★[재민 확정 2026-09-04 · T21 첫 판] **화면 효과만이다 — 플레이 영향 0.**
//   서버 판정은 한 줄도 안 건드린다. 이 층은 서버가 이미 보내는 날씨를 **읽어 그리기만** 한다.
//
// ★★§0 실측이 카드의 짐작을 뒤집었다(`보고/T93_2026-09-04.md` §0-ⓐ):
//   카드는 "눈이냐 비냐"를 어려운 쪽으로 봤는데 **거꾸로다.**
//     · 눈이냐 비냐 — `wx.tempC` 하나면 끝난다. **물은 0℃에서 언다** — 세계 규칙이 아니라 물리다.
//     · **비가 오느냐** — 그걸 정하는 정본이 **세계에 없다.** `server/weather.js` 는 기온 곡선뿐이고
//       (`tempAt`·`outdoorCold`·`hintOf`), `server/wind.js` 는 바람뿐이다. 강수는 어디에도 없다.
//   ⇒ **강수를 여기서 지어내지 않는다.** `zone.js elevKmAt` 이 *"여기에 '산 근처면 0.5km' 같은
//     대리값을 넣지 마라 — 그건 지형이 아니라 소원이다"* 라고 적어 둔 그 자리와 같은 규약이다.
//     기온 잡음(`devCOf`)의 부호로 비를 짐작하는 것도 같은 종류의 소원이다. ⇒ **회부(K 카드).**
//   ⇒ 이 층은 `wx.precip`(0..1)을 **읽을 뿐**이다. 세계가 그 값을 보내는 날 저절로 켜진다.
//     그때까지 제품 화면엔 안 나오고, 진단 훅 `__rainForce` 로만 켜진다(제품 경로 아님 · `__` 접두).
//
// ⚠훅 이름을 `__wx*` 로 짓지 마라 — **이미 임자가 있다.** `34-m-renderloop.js:110` 의 `__wxDbg`·`__wxFeed`
//   는 **날씨 사건**(🌵가뭄·🌈풍요 타일 상태) 축이고 `e2e-tilestate`·`e2e-village` 가 그걸 읽는다.
//   처음에 `__wxDbg` 로 지었다가 그 훅을 **조용히 덮었다**(첫 프레임에). `test-client-globals` 는
//   *선언* 충돌(①)과 *브라우저* 전역 충돌(②)만 보므로 `window.__x = …` 재대입은 안 잡힌다 — 회부.
//
// ★그리는 자리 — **안개 합성 뒤 · 밤 오버레이 앞**(렌더루프 4-0). 근거는 이 레포가 적어 둔 규약이다:
//   `34-m-renderloop.js` 가 *"↓↓ 여기부터는 안개 위다. 월드 사물을 여기서 그리면 미탐사 셀에
//   누출된다. 지금 안개 위에 남는 것 = 밤 오버레이 · 화살 · HUD — 전부 화면 UI"* 라고 못 박았다.
//   비는 **셀에 붙은 사물이 아니라 카메라와 세상 사이의 공기**다(밤 오버레이와 같은 부류) ⇒ 안개 위.
//   밤 오버레이보다는 **아래**다 — 밤이 비를 같이 어둡게 덮어야 공기지, 빗줄기만 훤하면 유리창 무늬다.
//   ⚠엔티티 아래로 내리면 두 가지가 깨진다: ⓐ 사람 앞에 비가 안 와 배경 그림처럼 보이고
//     ⓑ 안개 마스크가 비를 **탐사한 데까지만** 잘라 비가 안개 경계에서 뚝 끊긴다.
//
// ★파티클 없다(성능 규약). 물방울 객체 배열도, 프레임 간 상태도 없다 — 자리는 **번호의 해시**로
//   내고 시각으로 흘린다. 그래서 프레임마다 하는 일이 일정하고, 스트로크는 **한 번의 stroke()** 다.
//
// ★색은 세계 리터럴이다(판 토큰 금지 — T66 §1): 비는 흐린 하늘빛 회청, 눈은 바랜 흰빛.
  const WX_RAIN_RGBA = 'rgba(176, 196, 214, 0.55)';   // 비 — 흐린 날 하늘이 실린 물빛
  const WX_SNOW_RGBA = 'rgba(232, 238, 244, 0.88)';   // 눈 — 바랜 흰빛(순백은 화면에서 뜬다)
  // ★수는 **화면 넓이에서 유도한다**(눈대중 금지 — 족보 74): 아이소 한 셀의 화면 넓이는
  //   마름모 64×32/2 = 1,024px². "한 셀에 한 줄기"를 세기 1의 뜻으로 삼는다.
  const WX_CELL_AREA = 64 * 32 / 2;
  // ★★상한도 재서 골랐다(§0-ⓒ · 보고서 표). **자는 이 레포가 같은 자리에 이미 그리는
  //   화면 전체 오버레이 = 밤 오버레이**다(렌더루프 4-1 · 라디얼 그라디언트 + 전면 fillRect).
  //   같은 순간 같은 ctx 에서 `getImageData` 로 래스터까지 강제해 재면 밤 = 2.893ms/회.
  //   비싼 쪽(눈)이 획당 0.985µs 이므로 밤과 같아지는 경계는 2,937획.
  //   ⇒ **그 절반**을 잡는다 — 기계가 달라도 배는 견딘다. (1280×800 에선 밀도식이 1,000 이라
  //     상한이 안 문다. 1920×1080 의 2,025 도 안 문다 — 큰 화면에서 비가 성기어지지 않는다.)
  const WX_MAX = 1400;
  const WX_RAIN_LEN = 14, WX_RAIN_W = 1, WX_RAIN_PXPS = 760;   // 빗줄기 길이·굵기·낙하 속도(px/s)
  // ★눈 획은 **둥근 끝을 안 쓴다**(§0-ⓒ 실측): `lineCap:'round'` 는 같은 획을 2.4배 비싸게 만들고,
  //   굵기를 올리면 더 가팔라진다(2.2폭 round 2.356µs vs 1.0폭 round 0.252µs — 9.4배).
  //   2.6×2.0 의 뭉툭한 획도 이 크기에선 그냥 점이라 잃는 게 없다. ⇒ 비·눈 둘 다 butt.
  const WX_SNOW_LEN = 2.0, WX_SNOW_W = 2.6, WX_SNOW_PXPS = 95; // 눈은 점에 가깝고 느리다
  const WX_TILT_K = 1.4;    // 바람(부호 있는 계절풍)에서 기울기로. |tilt| ≤ 1 로 자른다.
  let _wxForce = null;      // 진단 훅이 넣은 값(제품 경로 아님)
  let _wxHooked = false;
  let _wxLast = { on: false, kind: null, n: 0, tilt: 0, indoor: false, precip: 0 };

  // 정수 해시 — 자리를 상태 없이 낸다(자연물 산포와 같은 문법).
  function _wxH(i, salt) {
    let h = (i * 374761393 + salt * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // 진단 훅 — **첫 프레임에 붙인다.** 최상위 실행문을 안 만들려는 것이다
  //   (`test-client-globals ③` 이 99-main 밖 최상위 실행문을 센다 — 기준선을 안 늘린다).
  function wxHooks() {
    if (_wxHooked) return;
    _wxHooked = true;
    // 강수는 세계가 아직 안 보낸다(위 주석) — 그걸 손으로 켜는 자리. 하네스와 실기용.
    window.__rainForce = (o) => { _wxForce = (o && typeof o === 'object') ? Object.assign({}, o) : null; };
    window.__rainDbg = () => Object.assign({}, _wxLast);
  }
  // 지금 그릴 날씨 — 서버가 보낸 것 위에 진단 훅을 덮는다(훅이 없으면 순수 서버 값).
  function wxState() {
    const w = (typeof myWeather !== 'undefined' && myWeather) ? myWeather : null;
    const base = { precip: w && w.precip != null ? +w.precip : 0,
                   tempC: w && w.tempC != null ? +w.tempC : null,
                   wind: w && w.wind != null ? +w.wind : 0 };
    return _wxForce ? Object.assign(base, _wxForce) : base;
  }

  /** 비·눈을 그린다. 그린 줄기 수를 낸다(0 = 안 그렸다). 렌더루프가 **안개 합성 뒤**에 부른다. */
  function drawWeather(ctx, W, H, nowMs) {
    wxHooks();
    const w = wxState();
    const precip = Math.max(0, Math.min(1, w.precip || 0));
    // ★지붕 아래선 안 그린다 — 실내 술어는 **방 정본**을 그대로 부른다(사본 금지).
    //   `playerIsIndoors` 는 서버가 보낸 방을 꺼내 볼 뿐이다(`20-r2-visibility.js`).
    const indoor = (typeof playerIsIndoors === 'function') ? !!playerIsIndoors() : false;
    if (!(precip > 0) || indoor) {
      _wxLast = { on: false, kind: null, n: 0, tilt: 0, indoor, precip };
      return 0;
    }
    // 눈이냐 비냐 — 어는점 하나(물리). 기온이 없으면 비로 본다.
    const snow = (w.tempC != null && w.tempC < 0);
    const n = Math.min(WX_MAX, Math.round((W * H) / WX_CELL_AREA * precip));
    // 바람은 **부호 있는 계절풍**이다(`server/wind.js seasonWind` — s>0 이면 남동향).
    //   그 부호가 그대로 기울기 부호가 된다. 세기는 |s| 에 비례하되 1 을 안 넘는다.
    const tilt = Math.max(-1, Math.min(1, (w.wind || 0) * WX_TILT_K));
    const t = (nowMs || 0) / 1000;
    const len = snow ? WX_SNOW_LEN : WX_RAIN_LEN;
    const spd = snow ? WX_SNOW_PXPS : WX_RAIN_PXPS;
    const span = H + len + 8;                       // 위로 나가면 아래에서 다시 들어온다
    ctx.save();
    ctx.strokeStyle = snow ? WX_SNOW_RGBA : WX_RAIN_RGBA;
    ctx.lineWidth = snow ? WX_SNOW_W : WX_RAIN_W;
    ctx.lineCap = 'butt';   // ★둘 다 뭉툭 — 둥근 끝은 §0-ⓒ 에서 2.4배였다
    ctx.beginPath();                                // ★한 경로에 다 담고 stroke() 는 한 번이다
    for (let i = 0; i < n; i++) {
      const sp = spd * (0.75 + 0.5 * _wxH(i, 3));   // 줄기마다 조금씩 다른 속도(같은 속도면 격자로 보인다)
      const y0 = (_wxH(i, 1) * span + t * sp) % span - len;
      // 눈은 좌우로 조금 흔들린다 — 바람과 별개로 공기에 뜨는 값(비는 안 흔들린다).
      const sway = snow ? Math.sin(t * (0.7 + _wxH(i, 5)) + i) * 6 : 0;
      const x0 = ((_wxH(i, 2) * W + tilt * y0 + sway) % W + W) % W;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + tilt * len, y0 + len);
    }
    ctx.stroke();
    ctx.restore();
    _wxLast = { on: true, kind: snow ? 'snow' : 'rain', n, tilt: +tilt.toFixed(4), indoor: false, precip };
    return n;
  }

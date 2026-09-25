# 대금 슬러의 기계적인 글리산도 제거 R&D

Date: 2026-09-25

## 사용자 판정과 원인

사용자 청취 판정은 “음정이 이동할 때 현악기 글리산도처럼 연속해서 내려가 기계적으로
들린다”였다. 이 지적은 정확했다. 당시 public DDSP-Gugak 대금 런타임과 score-expression
compiler는 일반 `slur`에 최대 90 ms의 linear-Hz pitch sweep을 만들고 있었다. 별도의 generic
preview도 100 Hz control row를 `numpy.interp`로 선형-Hz 보간해, 짧게 고친 곡선을 다시 긴
두 구간의 glide로 들려줄 수 있었다.

이는 새 숨, 재어택, 한 호흡 안의 운지 변화, 의도적인 추성·퇴성을 구분하지 않고 “붙은 음은
pitch ramp”로 처리한 것이 문제였다. 일반 관악기 slur는 호흡과 oscillator phase를 유지하되
운지는 빠르게 바뀌어야 하며, 긴 portamento는 명시적인 장식일 때만 허용해야 한다.

## 구현한 수정

### 1. 90 ms linear-Hz sweep 제거

Commit `9a946d58` (`fix(bgm): replace wind slur pitch sweeps`)

- ordinary slur pitch 후보를 8/12/20 ms로 제한했다.
- pitch는 linear Hz가 아니라 log-frequency/cents의 monotonic minimum-jerk S-curve다.
- 12 ms는 연구 근거에 따른 임시 canonical default일 뿐, 사람 청취 확정값은 아니다.
- 새 onset, voicing dip, phase reset을 만들지 않는다.
- 별도로 저작된 음량 변화는 pitch와 분리해 80 ms 동안 entry→target으로 이동한다.
  overshoot나 인위적인 dip 없이 100 ms 안에 목표에 도달해야 한다.
- 실제 250 Hz controls에서 target pitch 50 ms 이내, intermediate-pitch dwell 20 ms 미만을
  fail-closed gate로 검사한다.

실제 wet 후보:

- 8 ms: `_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-150000-slur8/`
- 12 ms: `_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-150100-slur12/`
- 20 ms: `_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-150200-slur20/`

움직이는 slur의 intermediate control dwell은 각각 4/8/16 ms였다. 세 후보 모두 dry written
rest exact zero, release boundary, native-reverb prefix, 동일 `[0, 6.48)` RMS -24 dBFS, no
compressor/limiter gate를 통과했다.

### 2. generic preview의 재-glide 방지

Commit `ddec3096` (`fix(bgm): reconstruct preview slurs at audio rate`)

- score-expression manifest를 v2로 올리고 각 명시적 slur에 source-boundary F0,
  target-entry F0, 48 kHz transition sample range, post-transition authored rejoin F0를 기록했다.
- generic synthetic preview는 manifest에 기록된 canonical 12 ms transition만 48 kHz에서
  log-cents minimum-jerk로 재구성한다.
- 12 ms 뒤 첫 authorial control row까지도 linear Hz가 아니라 log-frequency로 잇는다.
- oscillator phase는 한 번만 적분하며 slur 경계에서 reset하지 않는다. 새 attack/amplitude
  envelope도 만들지 않는다.
- 옛 v1 manifest, 누락된 boundary metadata, alternate timing, voicing dip, archive/manifest
  mismatch는 output을 만들기 전에 거부한다.
- prior vibrato나 빠른 target gesture가 있는 유효한 score 자체는 compiler가 거부하지 않는다.

### 3. phase-continuous hard-F0-step 대조군

Commit `4b12244c` (`feat(bgm): audition phase-continuous hard F0 steps`)

`--experimental-hard-f0-step`은 경계 직전 250 Hz row까지 source F0를 유지하고 경계 row부터
target F0를 준다. loudness, voicing, checkpoint, seed는 canonical 12 ms와 동일하다. 공개
oscillator의 250 Hz→16 kHz linear upsampling 때문에 audio에서는 약 한 control frame(약 4 ms)
정도 완화될 수 있지만, intermediate control dwell은 정확히 0이고 phase/onset reset은 없다.

동일 gain 직접 비교:

- A, canonical 12 ms:
  `_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-155400-hard-step-diagnostic/A_canonical_12ms_daegeum_shared_gain.wav`
  (`6f7fe65e0524a2f2d22e24bcbcc6d718f4b34e9b1018d85752c67ac2f3672d2e`)
- B, experimental hard step:
  `_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-155400-hard-step-diagnostic/B_experimental_hard_f0_step_daegeum_shared_gain.wav`
  (`6fbd87470f44ec1c5aec12854300b76ad8cedc5ec4cf1682323b2311ff64a6db`)
- report:
  `_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-155400-hard-step-diagnostic/runtime_report.json`
  (`63dfa360cbc1bbfe127f562adeeb989e89a1e234d1cfa389616aa95dfb97d0c9`)

실제 BGM 문맥에 가까운 hard-step checkpoint-native reverb 판도 별도로 만들었다.

- wet score-length audition:
  `_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-160000-hard-step-wet/C_published_daegeum_checkpoint_native_reverb_score_length_shared_interval_rms_matched.wav`
  (`8aa98a39ce705501bcb1418857387f70192322c47be6b3cd5ea6c3c407a001b6`)
- report:
  `_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-160000-hard-step-wet/runtime_report.json`
  (`168d91b8ba9a62e1e88c38aaa7e2eafdec44a74c0d5fc948bcc31773700b96a2`)

이 wet 판도 shared interval -24.000267 dBFS, hard-step intermediate control dwell 0,
dry written-rest exact zero, reverb full-tail/score-length prefix equality, release QA를 통과했다.

두 후보에는 canonical에서 계산한 단 하나의 gain `33.75462052226489`를 공통 적용했다. 독립
정규화, compressor, limiter는 없다. F0 차이는 정확히 moving-slur control frames
`1260–1262`, `1440–1442`뿐이며 loudness/voicing/seed 등 나머지 decoder input은 exact-equal이다.

## public Daegeum checkpoint가 실제로 한 일

이 checkpoint의 decoder는 F0와 linear loudness를 각각 MLP로 인코딩한 뒤 512-unit
unidirectional GRU를 통과시킨다. 따라서 한 render call 안에서 과거 control 문맥은 본다.
그러나 articulation, breath, fingering, onset class 입력은 없다. 동일한 F0+loudness history라면
score가 `slur`인지 `rearticulate`인지 이름만 보고 구분할 수 없다.

hard-step과 canonical 12 ms를 같은 seed로 재렌더해 decoder의 harmonic amplitude `a`,
harmonic distribution `c`, filtered-noise response `H`를 -4/0/4/8/12/20/+100 ms에서 비교했다.
차이는 대체로 float-noise 수준이었다.

- `a`: 0 또는 수 micro-dB
- `c/H`: 대략 `1e-8–1e-6` 규모
- +100 ms recurrent carry: 극미
- harmonic+noise stem→dry reconstruction max error: 두 후보 모두
  `2.3283064365386963e-10`

따라서 이 A/B에서 들리는 차이는 거의 oscillator F0 trajectory 차이다. checkpoint가 자연스러운
대금 운지 transient를 새로 만들었다고 주장할 근거는 없다.

## 현재 결정

1. 일반 slur에 85–100 ms pitch sweep을 쓰는 정책은 폐기한다.
2. 코드의 보수적인 default는 아직 12 ms다. 8/12/20 ms 중 어느 하나도 사람 청취로
   “확정”하지 않았다.
3. 사용자의 문제 진술에 가장 직접적으로 대응하는 후보는 hard-step B다. A/B 청취에서 B가
   낫다면 다음 R&D canonical을 hard-step으로 승격할 수 있다.
4. B가 glide는 없지만 너무 밋밋하거나 전자음처럼 들리면, timing을 다시 늘릴 문제가 아니다.
   현 checkpoint에 없는 운지/혀/청·호흡 transient 모델이 필요하다는 뜻이다.
5. 다음 합성 실험의 우선순위는 (a) 권리 확인된 연속 대금 데이터로 articulation/onset residual을
   학습하거나, (b) 그 전의 제한된 대조군으로 learned `H` shape는 그대로 둔 채 noise stem에
   12 ms, 최대 ±1.5 dB Hann micro-transient를 명시적으로 적용하는 것이다. 후자는 학습된
   운지라고 부르지 않는다.

## 범위와 승격 금지선

- 이 작업은 대금 한 악기의 R&D renderer에 관한 것이다. 단소·피리·해금·아쟁 또는 타악까지
  검증했다는 뜻이 아니다.
- 공개 DDSP-Gugak repository code의 MIT license는 확인했지만, 별도 checkpoint의 게임 배포권은
  확립되지 않았다. 모든 output은 R&D-only다.
- default `bgm.js`, `bgm-loops.js`, `render-meta.json`, OGG/M4A는 변경하지 않았다.
- legacy opt-in browser phrase path와 offline `phrase.py`에는 아직 85/100/45 ms glide 정책이
  남아 있다. 이것은 의도적으로 이번 R&D commit에서 수정하지 않았다. 청취 승격 전 default
  runtime 동작을 바꾸지 않는 프로젝트 gate 때문이다.
- current default/game assets에 연결하려면 사람 청취 판정, checkpoint/output 권리 확인, 전체
  상황별 stem 회귀가 별도 gate로 필요하다.

## 검증

현재 HEAD에서 다음 45개 contract test가 통과했다.

- public DDSP-Gugak runtime: 14
- score-expression compiler: 8
- audio-rate generic preview: 8
- score/phrase compatibility: 2
- synthesis harness: 5
- synthesis manifest: 4
- renderer readiness: 4

위 합계는 중복 없이 `45`다. 또한 두 최신 commit의 `git diff --check`, default-BGM guard,
실제 CPU PyTorch 2.3.1 render가 통과했다.

## 연구 근거의 한계

- Almeida et al., *The mechanics of woodwind toneholes and fingering transitions*, JASA 2009:
  https://www.phys.unsw.edu.au/jw/reprints/AlmeidaetalJASA09.pdf
- Dannenberg & Derenyi, phrase-continuous spectral synthesis:
  https://www.cs.cmu.edu/~rbd/papers/spectral-jnmr-98.pdf
- DDSP, phase from integrated instantaneous frequency:
  https://arxiv.org/abs/2001.04643

약 10–20 ms fingering timing은 서양 flute/woodwind 연구에서 가져온 R&D prior이며, 직접 측정한
대금 연주 통계가 아니다. 그러므로 12 ms는 보수적인 출발점이지 국악 연주법의 정답이 아니다.

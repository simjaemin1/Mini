# BGM R&D-08 — 지속음 국악기의 score→표현→합성 모델 계획

## 결론

대금·단소·피리·해금·아쟁의 문제는 “음 하나를 더 좋은 WAV로 바꾸면 끝”이 아니다.
작곡된 음열과 실제 연주 사이에 호흡, 혀/활 어택, 농현·비브라토, 음량 호, 장단 안의
미세 timing이라는 **표현 층**이 있다. 음 단위 sample join은 이 층을 매 경계에서 버리며,
텍스트-to-audio 모델은 이 층을 제어할 수 없다.

따라서 권장 구조는 다음이다.

```text
symbolic composition / source-led motif
  → note + authorial articulation + phrase context
  → continuous performance controls
      (F0 deviation, loudness, vibrato/ornament contour, attack/noise,
       harmonic/noise/timbre controls)
  → neural source-filter / DDSP-style renderer
  → offline BGM stem
```

이는 MIDI-DDSP가 notes → performance → synthesis를 나누는 이유와 같다. 다만 이
프로젝트에서는 score가 없는 source도 많으므로, 첫 모델은 자동 검출 control을
재구성하는 **instrument-specific resynthesis**여야 하며, 그 뒤에 score→control prior를
학습한다. 바로 score→waveform 생성부터 시작하지 않는다.

## 무엇을 학습하고 무엇을 보존하는가

| 층 | 입력 | 출력 | 대금에서 의미하는 것 |
|---|---|---|---|
| 작곡 | motif/정간보/score | 음·길이·명시 articulation | `77→77` 재발음과 `77→74→72` slur를 구별 |
| 표현 | note context + source controls | 연속 F0·세기·발음/노이즈·농현 곡선 | 평음→요성, tongue attack, 호흡의 실제 호 |
| 합성 | frame-level controls | audio | harmonic tone + breath/noise + resonance |

가야금·거문고·양금·타악은 각 note의 attack 자체가 악기 정체성이라, 첫 단계에는
실제 sample/phrase bank가 주력이다. 지속음 악기만 위의 control trajectory와 neural
renderer를 우선한다. 하나의 보편 model로 모두를 억지로 합치지 않는다.

## 1단계: 권리 분리와 학습용 manifest

현재 국립국악원 다운로드는 R&D provenance가 있는 source 후보일 뿐이다. 학습 또는
출시권은 별도 gate가 열리기 전까지 `not_a_training_item`, `not_a_game_asset` 상태로
유지한다.

각 source는 다음을 갖는다.

- SHA-256, native sample rate/channels/frame count, root-relative path
- instrument family / conservative source-role hint
- source 전체가 아닌 frame range 단위의 feature lineage
- source recording 단위 train/validation/test split

frame을 무작위 split하면 같은 연주의 이웃 frame이 train과 validation에 섞여 성능이
부풀려진다. source take 또는 performer/session 단위로만 나눈다.

## 2단계: self-supervised control extraction

원본 WAVE는 변경하지 않고 아래 cache만 R&D output에 만든다.

1. robust F0 + voicing confidence
2. loudness/RMS, onset flux, silence context
3. harmonic distribution / spectral envelope, noise residual
4. F0의 상대편차·속도·곡률, amplitude의 attack/decay descriptor
5. 고정 길이 contour segment의 unsupervised codebook (선택)

이 cache는 `시김새 label`이 아니다. low-variation segment, onset, pitch contour는 다음
단계의 sampling/analysis 우선순위일 뿐, 자동으로 breath/slur/농현 이름을 붙이지 않는다.

## 3단계: per-instrument resynthesis baseline

처음에는 대금 한 악기, 24 kHz mono, 1–2초 phrase-context crop으로 시작한다. 목표는
새 곡을 만들기가 아니라 원본의 F0/loudness/spectral-noise control로 원본을 재구성하는
것이다.

- differentiable harmonic + filtered-noise source-filter renderer
- control encoder: F0, loudness, onset/noise, instrument ID
- loss: multi-resolution STFT + log loudness + F0 consistency + onset/noise weighting
- validation: source take holdout; pitch-shifted input은 별도 stress test

원본 재구성이 나쁘면 score generation을 붙여도 좋은 결과가 나올 수 없다. 이 단계에서
raw phrase가 나은 경우에는 raw phrase를 우선 사용한다.

## 4단계: score→performance prior

resynthesis가 안정된 뒤에만 note sequence와 articulation context에서 expression control을
생성한다. model의 입력에는 최소한 이전/다음 음, phrase position, 장단 위치, 명시
`breath_start`/`rearticulate`/`slur`/`detached`가 있어야 한다.

출력은 audio waveform이 아니라 예측 가능한 control trajectory다. 따라서 score author가
특정 slur를 해제하거나 vibrato depth를 조절할 수 있고, 모델이 어택을 모른 채 모든
붙은 음을 crossfade로 해결하는 일을 막는다.

데이터가 적은 악기는 shared encoder + per-instrument adapter로 시작하되, source family와
attack class는 섞지 않는다. 모델이 예측하지 못하는 edge는 raw phrase retrieval 또는
명시 rearticulation fallback을 쓴다.

## 5단계: offline stem과 검증

브라우저 runtime에서 실시간 neural inference를 하지 않는다. GPU에서 offline stem을
굽고, 기존 `bgm.js`는 검증된 stem만 crossfade한다.

승격 전 자동 gate:

1. source/모델/feature manifest와 이용권 범위가 일치
2. score articulation map과 renderer entry mode가 일치
3. F0·loudness·silent-hole·click·peak/headroom regression 통과
4. source take holdout reconstruction 및 pitch/time stress metric 기록
5. synthetic output은 raw recording과 provenance를 섞어 표기하지 않음

이 gate를 통과하지 못하면 현 default 13곡을 바꾸지 않는다.

## 구현 우선순위

1. corpus inventory와 source-role 분리
2. phrase boundary triage + source-led stem (실제 연주를 보존하는 즉시 경로)
3. 대금 control cache / source-led contour scaffold
4. 대금 resynthesis CPU smoke + 4060 WSL training harness
5. holdout 비교 후 score→performance prior
6. 단소·피리·해금·아쟁 순으로 adapter 확장

## 참고 구현/논문

- DDSP: Differentiable Digital Signal Processing, ICLR 2020 —
  https://arxiv.org/abs/2001.04643
- MIDI-DDSP: Detailed Control of Musical Performance via Hierarchical Modeling,
  ICLR 2022 — https://arxiv.org/abs/2112.09312

두 자료는 hierarchy의 근거이지 현재 국악 corpus에 대한 성능 보증은 아니다. 특히
MIDI-DDSP 공개 구현은 archived 상태이므로 그대로 제품 의존성으로 채택하지 않고,
notes/performance/synthesis 분리 원칙과 eval 설계만 참고한다.

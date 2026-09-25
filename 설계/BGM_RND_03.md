# BGM R&D-03 — 실제 산조대금 발음 청취 게이트

## 결정

R&D-01의 oscillator A/B는 제품 후보에서 제외한다. `village_day / ari`의
대금 문제는 “연결 값을 조금 늘리거나 줄이는” 문제가 아니었다. 첫 숨, 혀
재발음, 운지로 이어지는 slur가 서로 다른 실제 사건인데 이전 구현은 둘 중 한
극단(전부 연결 / 전부 첫 음)을 택했기 때문이다.

이번 카드는 그 차이를 **실제 국립국악원 산조대금 녹음**으로 들을 수 있게 만든
오프라인 청취 게이트다. 이것은 아직 게임 런타임 교체나 AI 악기 모델의 성공
선언이 아니다.

## 원본 조사 결과

- 백업의 정악대금(JDAE) 113 조각은 이미 잘린 단음 bank다. `head`/`hold`를
  검증하는 데는 좋지만, 브라우저 `village_day / ari`의 원음역(`do=70`)에 몇
  음은 큰 pitch shift가 필요하고 일반 운지 slur의 정답 데이터는 아니다.
- 백업의 산조대금에는 긴 `sus`, `staccato`, `nina`, `nira`, 농현 scale 원본이
  있다. 새 숨과 혀 재발음의 실제 재료는 여기 있다.
- 단, scanner index의 `stacatto_60__003.wav` 하나에는 약 72/75/77의 여러
  타격이 들어 있고 단일 `midi=75.04`가 붙어 있다. 이 태그만 믿고 77 재발음에
  쓰면 잘못된 onset을 붙이는 오류가 난다.
- 그래서 77 재발음은 원본
  `대금_sanjo_deageum_stacatto_60.wav`의 **10.730–11.050초**를 사람이 확인한
  crop으로 쓴다. 이전 10.786초 cut보다 약 56ms 앞에서 시작해, 약 4ms의 조용한
  lead-in과 그 뒤의 실제 attack ramp를 보존한다. attack의 안정 F0는 약 77.04,
  정적 이동은 -4 cents다.
- 산조 `nira`에는 실제로 끊기지 않은 제스처도 있다. 예를 들어 원본
  `대금_sanjo_deageum_nira_23.wav`의 34.770–35.011초는 약 82.86→77.88로
  바뀌며 경계 RMS가 0.166→0.164로 떨어지지 않는다. 하지만 이것은 특정 산조
  장식이고, Ari가 요구하는 70→77 / 77→74→72 일반 전이 표는 아니다.

따라서 현재 자료로 “모든 음쌍의 자연 운지 전이”를 만들었다고 말하면 안 된다.
그 일을 하려면 전이 녹음/라벨 또는 별도 검증된 표현 모델이 필요하다.

## 청취본

대상은 **브라우저** Ari 원전의 사람 기준 8–10마디(`ARIRANG[7:10]`; 엔진의
zero-based `b=7..9`)다. 오프라인 `arirang.py`의 `root_do=72`가 아니라
브라우저와 같은 `do=70`, `beat=0.72초`를 쓴다. 랜덤 장식음은 발음 비교를
오염시키므로 끈다.

여기의 발음 표기는 브라우저 `bgm.js`의 기존 시간 기반
`planPerformancePhrase()` 출력을 재현한 것이 아니다. 특히 9마디의 반복 F5를
`rearticulate`, 10마디의 세 음을 명시 slur로 적은 것은 이 실험을 위한 **수동
R&D 악보 해석**이다. 기존 runtime은 그대로 두며, 이것을 drop-in parity나
게임 기본 BGM 교체물이라고 읽으면 안 된다. 제품으로 올릴 때에는 이 표기를
공유 score/articulation map으로 승격하고 별도의 parity test를 추가해야 한다.

| 파일 | 의도 | 실제 렌더 방식 |
|---|---|---|
| `01_all_sustain_heads.wav` | 너무 끊기는 극단 | 모든 음에 full sustain head |
| `02_all_steady_crossfades.wav` | 너무 붙는 극단 | 쉼 뒤만 full head, 나머지는 steady body crossfade |
| `03_score_articulated.wav` | 후보 | 새 숨=full head, 재발음=짧은 실제 staccato onset+steady body, 명시 slur=steady body crossfade |

렌더러는 `render_village_day_ari_sanjo_audition.py`다. 입력 원본 경로를
명시해야 하며 fallback/oscillator/reverb/합성 vibrato를 금지한다.

```sh
PYTHONPATH=public/assets/audio/bgm /path/to/python \
  public/assets/audio/bgm/render_village_day_ari_sanjo_audition.py \
  --samples-sanjo /restored/samples_daegeum \
  --output-dir /tmp/village-day-ari-audition
```

`provenance.json`에는 source WAV SHA-256, source-time crop, source/목표 MIDI,
정적 pitch shift, source calibration, 공통 post-mix gain, score 좌표를 남긴다.
세 파일은 각각 정규화하지 않고 하나의 공통 gain만 받는다.
`--output-dir`은 기존 청취본을 덮어쓰지 않도록 **아직 없는 새 디렉터리**여야
하며, 렌더 완료 전에는 sibling staging 디렉터리에만 파일을 쓴다.

scanner가 자른 WAV는 첫 sample이 0이 아닐 수 있다. 그래서 full head와 raw
staccato onset의 디지털 경계에는 **2.5ms de-click ramp**만 넣는다. 이는 새
attack을 합성하는 처리가 아니라 zero→임의 waveform phase의 click을 막는 최소
편집이며, score onset은 움직이지 않는다.

## 통과한 기술 게이트

- score planner가 `breath_start`, `rearticulate`, 명시 slur를 시간 인접성만으로
  혼동하지 않는다.
- candidate의 재발음은 full head가 아니라 `recorded_staccato_onset_proxy`와
  `recorded_steady_sustain_body` 두 component로 남는다.
- candidate의 세 slur는 70ms equal-power crossfade에만 steady body를 쓰며,
  score onset은 옮기지 않는다.
- 실제 source integration gate가 16개 검사를 통과한다: 실제 WAV/mono 44.1kHz,
  Daegeum provenance, pitch cap(225 cents), clipping 없음, raw 77 crop 일치,
  slur 경계의 의도치 않은 30ms 무음 hole 없음, output overwrite 거부,
  provenance의 로컬 source-root 비노출.

이 검사는 “좋게 들린다”를 증명하지 않는다. 다음 사람 청취가 그 판정이다.

## 사람 청취 게이트

`03_score_articulated.wav`를 두 극단과 비교해 아래만 판정한다.

1. 8마디 쉼 뒤 9마디 첫 음이 새 숨으로 들리는가.
2. 9마디 반복 F5가 첫 음을 통째로 다시 붙인 소리보다 자연스러운 짧은
   재발음으로 들리는가.
3. 10마디 77→74→72가 과도한 onset이나 무음 hole 없이 이어지는가.
4. 두 극단보다 나은지, 혹은 여전히 source 간 이음새가 들리는지.

사람 청취가 통과하기 전에는 `bgm.js`, 제품 기본 BGM, 또는 배포 음원에 연결하지
않는다. raw archive도 public asset으로 복사하지 않는다.

## AI를 실제로 쓰는 다음 단계

현재 6개 산조 long take와 잘린 JDAE 단음만으로 end-to-end DDSP/신경 vocoder를
학습하면, 모델은 자연 전이를 배우기보다 한 연주자·몇 개 scale을 외울 가능성이
크다. 전문가 경로는 다음처럼 분리한다.

```text
score + authorial articulation
        │
        ▼
expression controller (F0 residual, loudness, brightness, air/buzz,
                       onset/release class, sigim curve)
        │
        ├── verified raw head / tongue / native-transition retrieval
        └── learned residual renderer (offline only, after data gate)
        │
        ▼
loop-locked lead stem → identical accompaniment / BGM mix → Ogg + M4A
```

학습용 파일럿은 한 악기/한 연주자 안에서 아래를 새로 모아야 한다.

- 게임 음역의 각 음에 대해 breath head·tongue reattack·sustain을 최소 2–3
  dynamics로 녹음한다.
- 자주 쓰는 상행/하행 인접 음쌍과 3음 연결을 slur/portato/reattack별로
  별도 녹음한다. 이것이 현재 가장 큰 빈칸이다.
- F0, loudness, spectral brightness, 청공/buzz, onset/release, 시김새 곡선을
  frame 단위로 라벨하고 국악 연주자가 spot-check한다.
- 첫 ML은 작곡 모델이 아니라 score+articulation→expression curve 예측과
  onset residual을 분리한 대금 전용 offline renderer여야 한다. generic
  text-to-music은 음 단위 제어와 재현 가능한 BGM loop에 맞지 않는다.

그 데이터와 ABX 청취를 통과한 뒤에만 DDSP/NSF 계열을 GPU에서 학습하고, 결과는
먼저 pre-rendered stem으로 굽는다. 브라우저가 단음 100여 개를 실시간 조립하거나
신경 모델을 직접 실행하는 것이 아니다.

## 런타임 승격 조건

청취 통과 후에도 바로 기존 엔진을 덮지 않는다.

1. actual Daegeum lead를 오프라인 full mix 또는 loop-locked stems로 굽는다.
2. Ogg/M4A 양쪽에서 loop boundary 수치/청취 gate를 통과한다.
3. `bgm-loops.js`를 공유 `AudioContext`/music bus에 주입 가능한 player로
   고치고, 기존 절차형 BGM은 기본값으로 남긴 opt-in에서 첫 곡만 검증한다.
4. 장면 crossfade, 첫 user gesture, visibility, volume, attribution을 다시
   회귀 검사한다.

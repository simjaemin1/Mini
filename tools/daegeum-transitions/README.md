# 대금 전이 원음 판독기

`native_wav.py`는 R&D-06의 원본 WAV catalog를 위한 작은, 의도적으로
보수적인 판독기다. FLAC·변환본·리샘플된 파일을 받아들이지 않고, 원본의
native sample frame 좌표를 그대로 보존한다.

```sh
python3 tools/daegeum-transitions/native_wav.py \
  --root "$GUGAK_ROOT/monotone-6" \
  "$GUGAK_ROOT/monotone-6"
```

출력에는 절대 경로가 없다. `source`는 `--root`에 대한 상대 경로이고,
각 항목에는 SHA-256, RIFF/BWF metadata, native format, frame count와
analysis mono 정책이 들어간다.

Python API:

```python
from native_wav import inspect_wav, read_native_wav

metadata = inspect_wav(source_wav)
recording = read_native_wav(source_wav)
# recording.samples: (native_frames, native_channels), no resampling
# recording.analysis_mono: arithmetic mean of native input channels
```

`read_native_wav()`은 PCM(8/16/24/32/64 bit) 및 IEEE float(32/64 bit)만
안전하게 decode한다. 원음 파일을 쓰거나, trim·normalization·resampling을
수행하지 않는다. 큰 파일의 decode는 기본 1 GiB raw-data guard를 넘으면
호출자가 `max_decode_bytes`를 명시해 승인해야 한다.

검증:

```sh
python3 tools/daegeum-transitions/test_native_wav.py
```

## 점수 목표 우선 청취물 (R&D-06 보조 도구)

`target_audition.py`는 transition bank를 만들지 않는다. 이미 생성된 R&D-06 bundle의
`coverage.json` score target(예: `77→74`, `74→72`)에 대해 **아직 전부
`unreviewed`인** candidate를 자동으로 우선순위화해, auditable review artifact를
만든다.

각 candidate의 automatic proxy pitch `p₁→p₂`와 target `t₁→t₂` 사이에는 한 개의
global shift만 계산한다.

```text
global_shift = ((t₁ - p₁) + (t₂ - p₂)) / 2
interval_error = (p₂ - p₁) - (t₂ - t₁)
```

즉 시작음과 끝음을 각각 따로 맞춰서 점수를 속이지 않는다. target-compatible detector,
bounded global shift/endpoint gate, interval error, boundary의 RMS 변화·onset flux proxy,
global-shift magnitude, automatic voicing proxy 순으로 정렬한다. RMS/onset은 특히 볼륨이
툭 끊기는 후보를 뒤로 미루는 측정값일 뿐, slur·호흡·운지·자연 legato나 quality를 자동
판정하는 점수가 아니며 candidate는 계속 `unreviewed`다.

```sh
python3 tools/daegeum-transitions/target_audition.py \
  --bundle _bgm_rnd/daegeum-transition-bank-YYYYMMDD \
  --raw-daegeum-dir "$SANJO_DIRECT_WAV_ROOT" \
  --raw-daegeum-dir "$JEONGAK_DIRECT_WAV_ROOT" \
  --output-dir _bgm_rnd/daegeum-target-audition-YYYYMMDD \
  --render-gesture-warps
```

출력의 `index.html`, `target_priority.json`, `target_priority.tsv`는 target별 ranking이다.
각 shortlist row에는 다음만 들어간다.

- `A_raw_context.wav`: 원본의 넓은 context `[start,end)` frame을 byte-for-byte 복사한
  source-faithful WAV
- `B_raw_boundary_focus.wav`: 같은 원본의 boundary 근처 frame을 byte-for-byte 복사한
  source-faithful WAV
- 선택적 `P_gesture_warp_preview.wav`: Rubber Band R3 pitch map으로 한 global shift와
  작은 boundary interpolation을 적용한 **offline processed** preview

A/B는 새 minimal RIFF header를 사용할 뿐 gain, pitch shift, time stretch, resample,
channel 변경, fade를 하지 않는다. P는 반대로 source-faithful이 아니므로 metadata와
HTML에서 `not_native_legato`, `not_approved_transition`, `not_transition_bank_item`,
`not_game_asset`으로 명시한다. P는 자연 전이 증거나 게임 BGM 후보로 승격되지 않는다.

검증:

```sh
python3 tools/daegeum-transitions/test_target_audition.py
python3 tools/daegeum-transitions/target_audition.py --dry-run
```

## NGC 확장 대금산조 source ingest (R&D-only)

`fetch_ngc_extended_daegeum.py`는 국립국악원 digital-eum의 **확장 다운로드** catalog에서
대금산조 source를 가져오는 별도 ingest 도구다. transition detector나 renderer가 아니며,
catalog metadata/filename만으로 legato·자연 전이·학습 허가를 주장하지 않는다.

이 도구는 broad `대금` title match나 별도 **악구 다운로드** product를 쓰지 않는다. live
catalog의 exact `EXTEND0001` / `대금` / `division: 대금산조` filter에서 caller가 명시한
`--extend-seq`만 선택한다. `--all`은 없고 기본은 audio를 전혀 받지 않는 plan-first다.

```sh
# metadata/provenance plan만 만든다. audio download 없음.
python3 tools/daegeum-transitions/fetch_ngc_extended_daegeum.py \
  --output-dir _bgm_rnd/ngc-extended-daegeum-plan --extend-seq 1520

# plan 검토 뒤 한 source만 download한다.
python3 tools/daegeum-transitions/fetch_ngc_extended_daegeum.py \
  --output-dir _bgm_rnd/ngc-extended-daegeum-plan --extend-seq 1520 --download

# 네트워크 없이 existing source SHA/native-WAV provenance를 확인한다.
python3 tools/daegeum-transitions/fetch_ngc_extended_daegeum.py \
  --output-dir _bgm_rnd/ngc-extended-daegeum-plan --verify-only
```

여러 source를 실제로 받으려면 exact ID 외에 `--allow-batch`도 필요하며 한 run은 최대
30개다. manifest에는 `extendSeq`, returned catalog/detail metadata, original server
path/filename, returned filename, SHA-256/native WAV descriptor, KOGL notice, submitted
research purpose가 남는다. cookie/API key/hidden credential은 사용하지 않는다.

neutral local filename(`audio/extend-001520.wav`)을 R&D-06 candidate scan에 넣으려면
filename pattern 대신 explicit verified manifest를 함께 준다.

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/build.py \
  --raw-daegeum-dir _bgm_rnd/ngc-extended-daegeum-plan/audio \
  --ngc-extended-manifest _bgm_rnd/ngc-extended-daegeum-plan/ngc-extended-daegeum-sanjo.manifest.json \
  --output-dir _bgm_rnd/daegeum-transition-bank-ngc-review
```

The builder checks exact NGC scope, catalog/detail/filename agreement, SHA-256, native WAV
descriptor, research-only gates, and that the WAV is inside an explicit raw root. It grants only
`continuous_phrase_candidate` review scanning; every emitted event stays `unreviewed` until the
normal human label gate.

```sh
python3 tools/daegeum-transitions/test_fetch_ngc_extended_daegeum.py
```

## 연속 원본 프레이즈 풀과 raw audition (R&D-only)

`phrase_pool.py`는 위처럼 이미 SHA/native-WAV가 검증된 NGC 확장 대금산조 corpus의
feature cache만 읽어, 서로 다른 원본 take에서 **한 파일 안의 연속 native frame 범위**를
작은 다양성 묶음으로 고른다. 이것은 아리랑/국악 선율의 전사, 슬러·호흡·시김새 판정,
품질 판정, 학습 허가 또는 게임 사용 허가가 아니다. 원본 WAV는 열거나 바꾸지 않는다.

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/phrase_pool.py \
  --bundle _bgm_rnd/daegeum-transition-bank-ngc-YYYYMMDD \
  --ngc-extended-manifest _bgm_rnd/ngc-extended-daegeum-sanjo-YYYYMMDD/ngc-extended-daegeum-sanjo.manifest.json \
  --ngc-extend-seq-range 1520:1711 \
  --output-dir _bgm_rnd/daegeum-source-led-phrase-pool-YYYYMMDD
```

`phrase_span_audition.py --phrase-pool`은 이 report의 후보 하나를 실제로 꺼낼 때도
느슨하게 믿지 않는다. report SHA, R&D-06 source catalog SHA, exact NGC manifest SHA,
같은 `extendSeq` entry의 SHA/native descriptor, 그리고 explicit raw root의 실제 WAV를
다시 맞춘 뒤에만 `A_source_led_phrase_pool_span.wav`를 만든다. 이 파일은 source frame을
byte-for-byte 복사한 한 개의 연속 span이고, crossfade·gain·pitch shift·time stretch·resample·
channel change·fade가 없다.

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/phrase_span_audition.py \
  --bundle _bgm_rnd/daegeum-transition-bank-ngc-YYYYMMDD \
  --raw-daegeum-dir _bgm_rnd/ngc-extended-daegeum-sanjo-YYYYMMDD/audio \
  --phrase-pool _bgm_rnd/daegeum-source-led-phrase-pool-YYYYMMDD/phrase_pool.json \
  --ngc-extended-manifest _bgm_rnd/ngc-extended-daegeum-sanjo-YYYYMMDD/ngc-extended-daegeum-sanjo.manifest.json \
  --priority-rank 4 \
  --output-dir _bgm_rnd/daegeum-phrase-pool-audition-YYYYMMDD
```

출력은 계속 `unreviewed`, `not_a_verified_phrase_or_gesture_boundary`, `not_training_item`,
`not_game_asset`다. 즉 단음 이어붙임보다 자연스러운 **원본의 연속 호흡/음색 변화 후보**를
확보하는 R&D 단계일 뿐, 기본 BGM이나 런타임 asset을 바꾸지 않는다.

원본을 다시 decode하거나 변형하지 않고 score 배치 후보를 비교하려면 같은 pool report를
`source_led_contour.py`에 넣는다. 여기서 나오는 F0·RMS·voicing은 기존 feature cache의
proxy 요약일 뿐, 전사·아리랑 판정·호흡/슬러/legato 판정이 아니다.

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/source_led_contour.py \
  --bundle _bgm_rnd/daegeum-transition-bank-ngc-YYYYMMDD \
  --input-json _bgm_rnd/daegeum-source-led-phrase-pool-YYYYMMDD/phrase_pool.json \
  --priority-rank 4 \
  --output-dir _bgm_rnd/source-led-contour-YYYYMMDD
```

검증:

```sh
python3 tools/daegeum-transitions/test_phrase_pool.py
python3 tools/daegeum-transitions/test_phrase_span_audition.py
python3 tools/daegeum-transitions/test_source_led_contour.py
```

## 전체 cache-grid score 적합도 탐색 (R&D-only)

`exhaustive_score_span_search.py`는 작은 phrase pool만 다시 고르는 도구가 아니다. 하나의
명시적 score-expression plan에 대해, 기존 feature cache의 **모든 source 안에서** 시작·끝이
기존 feature centre인 연속 span을 전수 측정한다. score 전체 길이로부터 나온 한 개의 uniform
time ratio와 span 전체에 대한 한 개의 global pitch offset만 쓴다. 음마다 offset을 달리하거나
local warp·보간·missing-value fill을 하지 않는다.

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/exhaustive_score_span_search.py \
  --bundle _bgm_rnd/daegeum-transition-bank-ngc-YYYYMMDD \
  --score-plan tools/score-expression/plans/ari_source_led_response_r1.json \
  --output-dir _bgm_rnd/ari-exhaustive-score-span-search-YYYYMMDD
```

허용 ratio, voicing coverage, RMSE, P95 absolute pitch error, endpoint interval gate는 기존
`score_phrase_compatibility.py`와 동일한 고정값이다. CLI로 낮출 수 없다. FFT는 수천만 cache-grid
span의 global-offset SSE/coverage를 같은 계산으로 빠르게 구하는 용도이며 source를 변환하지
않는다. coverage/RMSE를 통과한 모든 span과 보고서의 best span은 기존 feature row에서 다시
직접 P95·endpoint까지 재측정한다.

이 "전수"는 raw audio를 열지 않은 상태에서 가능한 정확한 범위, 즉 **cache grid**에 한정된다.
report의 source span은 audio clip도 아니고, phrase·같은 호흡·재어택·슬러·자연 legato·연주
품질·학습 허가·게임 asset 판정도 아니다. 수치상 in-band인 결과조차 계속 `unreviewed`이며 기본
BGM/runtime asset을 바꾸지 않는다.

검증:

```sh
python3 tools/daegeum-transitions/test_exhaustive_score_span_search.py
python3 tools/daegeum-transitions/exhaustive_score_span_search.py --dry-run
```

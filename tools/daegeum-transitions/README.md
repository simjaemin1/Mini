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

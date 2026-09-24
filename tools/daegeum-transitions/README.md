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

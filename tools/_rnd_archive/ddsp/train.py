#!/usr/bin/env python3
"""하모닉+노이즈 디코더 한 개 [T353] — `train.sh` 가 부른다.

★스모크(`SMOKE=1`)는 **30초 안에 전 과정이 도는지만** 본다 — 모델 값은 쓰지 않는다.
  "돌았다"와 "배웠다"는 다른 말이고, 이 자리에서는 앞의 것만 말할 수 있다.
"""
import json, os, time
import numpy as np

SMOKE = os.environ.get("SMOKE", "0") == "1"
INST = os.environ.get("INST", "daegeum")
PREP = os.environ.get("PREP", ".")
SR, HOP, NH = 16000, 64, 60


def harmonic_noise(f0, amp, hdist, noise, sr=SR, hop=HOP):
    """f0(프레임) · 진폭 · 배음분포 · 노이즈 → 파형. DDSP 의 **디코더 쪽**만 쓴다."""
    import torch
    n = f0.shape[-1] * hop
    f0u = torch.repeat_interleave(f0, hop, -1)
    ampu = torch.repeat_interleave(amp, hop, -1)
    hd = torch.repeat_interleave(hdist, hop, -1)
    k = torch.arange(1, NH + 1, device=f0.device).view(-1, 1)
    fk = f0u.unsqueeze(-2) * k
    hd = hd * (fk < sr / 2)                       # 나이퀴스트 위는 끈다
    hd = hd / (hd.sum(-2, keepdim=True) + 1e-8)
    phase = torch.cumsum(2 * np.pi * fk / sr, -1)
    y = (torch.sin(phase) * hd).sum(-2) * ampu
    nz = (torch.rand(n, device=f0.device) * 2 - 1) * torch.repeat_interleave(noise, hop, -1)
    return y + nz


def main():
    t0 = time.time()
    import torch
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"  장치 {dev} · 악기 {INST} · 스모크 {SMOKE}")

    wavs = [f for f in sorted(os.listdir(PREP)) if f.endswith(".wav")] if os.path.isdir(PREP) else []
    if wavs:
        import soundfile as sf
        data = [sf.read(os.path.join(PREP, f))[0].astype("float32") for f in wavs[:64]]
        print(f"  조각 {len(data)}개")
    else:
        t = np.arange(SR * 2) / SR
        data = [(np.sin(2 * np.pi * 392 * t) * 0.3).astype("float32")]
        print("  조각이 없다 — 합성 톤 한 개로 관로만 돌린다")

    nf = len(data[0]) // HOP
    f0 = torch.full((1, nf), 392.0, device=dev)
    amp = torch.full((1, nf), 0.3, device=dev)
    hdist = torch.rand(1, NH, nf, device=dev, requires_grad=True)
    noise = torch.full((1, nf), 0.01, device=dev, requires_grad=True)
    opt = torch.optim.Adam([hdist, noise], lr=1e-2)
    tgt = torch.tensor(data[0][: nf * HOP], device=dev).unsqueeze(0)

    budget = 30.0 if SMOKE else float(os.environ.get("BUDGET_S", "0") or 0)
    step, loss = 0, None
    while True:
        opt.zero_grad()
        y = harmonic_noise(f0, amp, torch.softmax(hdist, 1), noise.abs())
        loss = torch.nn.functional.l1_loss(y, tgt)
        loss.backward(); opt.step(); step += 1
        if budget and time.time() - t0 > budget:
            break
        if not budget and step >= 2000:
            break
    out = dict(inst=INST, device=dev, smoke=SMOKE, steps=step,
               loss=float(loss), seconds=round(time.time() - t0, 1), chunks=len(wavs))
    if SMOKE:
        out["note"] = "★스모크다 — 전 과정이 돌았다는 것만 말한다. 모델 값은 안 쓴다(지어내지 않는다)."
    else:
        torch.save(dict(hdist=hdist.detach().cpu(), noise=noise.detach().cpu()),
                   os.path.join(PREP, "last.pt"))
        out["ckpt"] = os.path.join(PREP, "last.pt")
    print("  " + json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

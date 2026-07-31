"""oldinst.py — 고치기 전 악기 구현 (A/B 비교용 보존본)."""
import numpy as np
from gugak import (SR, rng_global, expdecay, lp, hp, bp, peak_eq, _ks_raw,
                   pitch_warp, adsr)


def old_janggu_gung(dur=0.7, amp=1.0, tune=96.0, seed=None):
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR); t = np.arange(n) / SR
    f = tune * (1 + 0.35 * np.exp(-t / 0.02))
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * expdecay(n, 0.16)
    body += 0.35 * np.sin(ph * 1.58 + 0.7) * expdecay(n, 0.07)
    skin = lp(rng.normal(0, 1, n).astype(np.float32), 900) * expdecay(n, 0.035)
    y = lp(body + skin * 0.55, 2600)
    return (y * amp * 0.6).astype(np.float32)


def old_janggu_chae(dur=0.35, amp=1.0, tune=520.0, seed=None):
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR); t = np.arange(n) / SR
    ph = 2 * np.pi * tune * t
    ring = (np.sin(ph) + 0.5 * np.sin(ph * 2.31) + 0.3 * np.sin(ph * 3.77))
    ring *= expdecay(n, 0.045)
    stick = bp(rng.normal(0, 1, n).astype(np.float32), 1800, 9000) * expdecay(n, 0.016)
    return (hp(ring * 0.55 + stick * 0.7, 300) * amp * 0.42).astype(np.float32)


def old_buk(dur=1.1, amp=1.0, tune=74.0, seed=None):
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR); t = np.arange(n) / SR
    f = tune * (1 + 0.5 * np.exp(-t / 0.025))
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * expdecay(n, 0.30) + 0.3 * np.sin(ph * 1.41) * expdecay(n, 0.10)
    y += lp(rng.normal(0, 1, n).astype(np.float32), 600) * expdecay(n, 0.05) * 0.5
    return (lp(y, 1800) * amp * 0.8).astype(np.float32)


def old_gayageum(freq, dur, amp=1.0, nonghyeon=0.0, seed=None, bright=0.75,
                 damp=0.9955, body=True, bend=0.0):
    seed = int(seed if seed is not None else rng_global.integers(1 << 20))
    base = _ks_raw(freq, max(dur, 2.6), damp, bright, seed % 97)
    n = int(dur * SR)
    y = base[:n].copy() if n <= len(base) else np.pad(base, (0, n - len(base)))
    if nonghyeon > 0 or bend:
        t = np.arange(n) / SR; cents = np.zeros(n, np.float32)
        if nonghyeon > 0:
            cents += nonghyeon * np.clip((t - 0.16) / 0.30, 0, 1) * np.sin(2 * np.pi * 4.4 * t)
        if bend:
            k = int(min(0.35, dur * 0.5) * SR)
            if k > 4:
                cents[-k:] += bend * np.linspace(0, 1, k) ** 1.4
        y = pitch_warp(y, cents)
    y = y * expdecay(len(y), max(0.55, 1.7 - freq / 700), hold=0.02)
    if body:
        y = peak_eq(y, 240, 1.0, 4.5)
        y = peak_eq(y, 780, 1.4, 2.5)
        y = hp(y, 90)
    y *= adsr(len(y), 0.002, 0.02, 0.95, min(0.22, dur * 0.35), curve=1.4)
    return (y * amp * 0.5).astype(np.float32)


def old_geomungo(freq, dur, amp=1.0, seed=None):
    y = old_gayageum(freq, dur, 1.0, nonghyeon=14, seed=seed, bright=0.35, damp=0.992)
    y = peak_eq(lp(y, 2200), 160, 0.9, 6.0)
    n = len(y)
    rng = np.random.default_rng((seed or 3) + 11)
    click = bp(rng.normal(0, 1, n).astype(np.float32), 900, 5000) * expdecay(n, 0.012) * 0.35
    return ((y + click) * amp * 1.1).astype(np.float32)

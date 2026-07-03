// General signal-processing helpers used by the rPPG pipeline.
import { fft, nextPow2 } from "./fft.js";

export function mean(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / (a.length || 1);
}

export function std(a) {
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - m; s += d * d; }
  return Math.sqrt(s / (a.length || 1));
}

export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

// Linearly resample irregular (times[], values[]) onto a uniform grid at `fs` Hz.
// times must be ascending seconds starting near 0. Returns Float64Array of length n.
export function resampleUniform(times, values, fs, n) {
  const out = new Float64Array(n);
  const last = times.length - 1;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    while (j < last - 1 && times[j + 1] < t) j++;
    if (t <= times[0]) { out[i] = values[0]; continue; }
    if (t >= times[last]) { out[i] = values[last]; continue; }
    const t0 = times[j], t1 = times[j + 1];
    const span = t1 - t0 || 1e-6;
    const a = (t - t0) / span;
    out[i] = values[j] * (1 - a) + values[j + 1] * a;
  }
  return out;
}

// Remove slow drift (e.g. gradual light changes) by subtracting a moving average.
export function movingDetrend(sig, win) {
  const n = sig.length;
  const out = new Float64Array(n);
  const half = Math.max(1, Math.floor(win / 2));
  // prefix sums for an O(n) sliding mean
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + sig[i];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    const avg = (pre[hi] - pre[lo]) / (hi - lo);
    out[i] = sig[i] - avg;
  }
  return out;
}

// Zero-phase-ish band-pass by zeroing out-of-band FFT bins (for display waveform).
export function bandpassFFT(sig, fs, lo, hi) {
  const n = sig.length;
  const N = nextPow2(n);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const m = mean(sig);
  for (let i = 0; i < n; i++) re[i] = sig[i] - m;
  fft(re, im, false);
  for (let k = 0; k < N; k++) {
    const f = (k <= N / 2 ? k : k - N) * fs / N;
    const af = Math.abs(f);
    if (af < lo || af > hi) { re[k] = 0; im[k] = 0; }
  }
  fft(re, im, true);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = re[i];
  return out;
}

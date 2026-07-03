// Remote-PPG core: the POS algorithm and heart-rate estimation.
//
// POS = "Plane-Orthogonal-to-Skin", Wang et al., IEEE TBME 2017.
// It is robust to head motion and slow illumination changes because each short
// window is temporally normalised (divided by its own mean) before projection.
import { fft, nextPow2 } from "./fft.js";
import { std, mean, hann } from "./signal.js";

// Input: rgb = array of [r,g,b] means per frame (uniform fs). Output: pulse signal.
export function POS(rgb, fs) {
  const N = rgb.length;
  const H = new Float64Array(N);
  const l = Math.max(2, Math.round(1.6 * fs)); // ~1.6 s sliding window
  if (N < l) return H;

  for (let n = 0; n + l <= N; n++) {
    // temporal mean of this window, per channel
    let mr = 0, mg = 0, mb = 0;
    for (let i = n; i < n + l; i++) { mr += rgb[i][0]; mg += rgb[i][1]; mb += rgb[i][2]; }
    mr /= l; mg /= l; mb /= l;
    if (mr <= 0 || mg <= 0 || mb <= 0) continue;

    // projection: P = [[0,1,-1],[-2,1,1]] on temporally-normalised RGB
    const S1 = new Float64Array(l);
    const S2 = new Float64Array(l);
    for (let i = 0; i < l; i++) {
      const r = rgb[n + i][0] / mr;
      const g = rgb[n + i][1] / mg;
      const b = rgb[n + i][2] / mb;
      S1[i] = g - b;
      S2[i] = -2 * r + g + b;
    }
    const s1 = std(S1);
    const s2 = std(S2);
    const alpha = s2 === 0 ? 0 : s1 / s2;

    // h = S1 + alpha*S2, then overlap-add with its window mean removed
    let hm = 0;
    const h = new Float64Array(l);
    for (let i = 0; i < l; i++) { h[i] = S1[i] + alpha * S2[i]; hm += h[i]; }
    hm /= l;
    for (let i = 0; i < l; i++) H[n + i] += h[i] - hm;
  }
  return H;
}

// Estimate heart rate from a pulse signal via zero-padded FFT + parabolic peak refine.
// Returns { bpm, snr, peakFreq, freqs[], power[] } with freqs in Hz.
export function estimateHeartRate(pulse, fs, loHz = 0.7, hiHz = 4.0) {
  const n = pulse.length;
  const N = nextPow2(n * 2); // zero-pad ×2 for finer frequency resolution
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const m = mean(pulse);
  const w = hann(n);
  for (let i = 0; i < n; i++) re[i] = (pulse[i] - m) * w[i];
  fft(re, im, false);

  const half = N >> 1;
  const freqs = new Array(half + 1);
  const power = new Array(half + 1);
  let peakK = -1, peakP = -1, bandSum = 0;
  for (let k = 0; k <= half; k++) {
    const f = (k * fs) / N;
    const p = re[k] * re[k] + im[k] * im[k];
    freqs[k] = f;
    power[k] = p;
    if (f >= loHz && f <= hiHz) {
      bandSum += p;
      if (p > peakP) { peakP = p; peakK = k; }
    }
  }

  // parabolic interpolation around the peak bin for sub-bin frequency accuracy
  let kf = peakK;
  if (peakK > 0 && peakK < half) {
    const a = power[peakK - 1], b = power[peakK], c = power[peakK + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) kf = peakK + (0.5 * (a - c)) / denom;
  }
  const peakFreq = (kf * fs) / N;
  const bpm = peakFreq * 60;

  // Signal-to-noise: energy within ±0.15 Hz of the fundamental and its first
  // harmonic (real pulse energy spreads over a few bins) vs. the rest of the band.
  const halfWidth = 0.15; // Hz
  let sigPow = 0;
  for (let k = 0; k <= half; k++) {
    const f = freqs[k];
    if (f < loHz || f > hiHz) continue;
    if (Math.abs(f - peakFreq) <= halfWidth || Math.abs(f - 2 * peakFreq) <= halfWidth) sigPow += power[k];
  }
  const snr = sigPow / (bandSum - sigPow || 1e-9);
  return { bpm, snr, peakFreq, freqs, power };
}

// Map SNR to a 0..1 confidence for display.
export function snrToConfidence(snr) {
  if (!isFinite(snr) || snr <= 0) return 0;
  return snr / (snr + 1.2);
}

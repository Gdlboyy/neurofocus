import { chromium } from 'playwright';
import fs from 'fs';
const url = 'file:///C:/Users/first/OneDrive/Desktop/neurofocus/index.html';
const REC_SEC = 10, SETTLE = +(process.env.SETTLE||4.5);

// ---------- DSP helpers ----------
function fft(re, im) { // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2; const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr; } } }
}
function biquad(type, fs, f0, Q) { const w = 2 * Math.PI * f0 / fs, a = Math.sin(w) / (2 * Q), c = Math.cos(w); let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; } else { b0 = a; b1 = 0; b2 = -a; }
  a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; const k = [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = k[0] * x + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }; }
function filt(x, fn) { const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = fn(x[i]); return y; }
function envelope(x, fs, cut, outRate) { const lp = biquad('lp', fs, cut, 0.707), lp2 = biquad('lp', fs, cut, 0.707); const step = Math.round(fs / outRate); const out = []; for (let i = 0; i < x.length; i++) { const e = lp2(lp(Math.abs(x[i]))); if (i % step === 0) out.push(e); } return { env: Float32Array.from(out), rate: fs / step }; }
function modSpectrum(env, rate) { const n = 1 << Math.floor(Math.log2(env.length)); const re = new Float32Array(n), im = new Float32Array(n); const mean = env.slice(0, n).reduce((a, b) => a + b, 0) / n; for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); re[i] = (env[i] - mean) * w; } fft(re, im); const mag = new Float32Array(n / 2); for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]) / (n / 4) / (mean || 1); return { mag, df: rate / n, mean }; }
function avgSpectrum(x, fs, N = 4096) { const acc = new Float64Array(N / 2); let frames = 0; const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  for (let s = 0; s + N <= x.length; s += N / 2) { const re = new Float32Array(N), im = new Float32Array(N); for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i]; fft(re, im); for (let i = 0; i < N / 2; i++) acc[i] += re[i] * re[i] + im[i] * im[i]; frames++; }
  for (let i = 0; i < N / 2; i++) acc[i] /= frames; return { p: acc, df: fs / N }; }
const db = v => 20 * Math.log10(Math.max(v, 1e-9));

function analyze(L, R, fs, hz, hz2, name) {
  const n = L.length; const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = (L[i] + R[i]) / 2;
  let peak = 0, sq = 0; for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; sq += x[i] * x[i]; } const rms = Math.sqrt(sq / n);
  // spectrum
  const { p, df } = avgSpectrum(x, fs); let num = 0, den = 0, hf = 0, tot = 0;
  for (let i = 1; i < p.length; i++) { const f = i * df; num += f * p[i]; den += p[i]; tot += p[i]; if (f > 4000) hf += p[i]; }
  const centroid = num / den, hfRatio = hf / tot;
  const bandP = (a, b) => { let s = 0, c = 0; for (let i = 1; i < p.length; i++) { const f = i * df; if (f >= a && f < b) { s += p[i]; c++; } } return s / c; };
  const slope = (10 * Math.log10(bandP(2000, 4000) / bandP(125, 250))) / 4; // dB/oct between 177 Hz and 2.8 kHz
  // modulation in mid band 200-1000
  const mid = filt(filt(filt(filt(x, biquad('hp', fs, 200, 0.707)), biquad('hp', fs, 200, 0.707)), biquad('lp', fs, 1000, 0.707)), biquad('lp', fs, 1000, 0.707));
  const { env, rate } = envelope(mid, fs, 120, 1000); const ms = modSpectrum(env, rate);
  const at = f => { if (!f) return 0; const i = Math.round(f / ms.df); let m = 0; for (let k = i - 2; k <= i + 2; k++) if (k > 0 && k < ms.mag.length) m = Math.max(m, ms.mag[k]); return m; };
  let bg = 0, bgc = 0; for (let i = Math.round(1 / ms.df); i < Math.round(60 / ms.df); i++) { const f = i * ms.df; if ((hz && Math.abs(f - hz) < 1) || (hz2 && Math.abs(f - hz2) < 1)) continue; bg += ms.mag[i]; bgc++; } bg /= bgc || 1;
  // roughness proxy: full-band envelope fluctuation 30-300 Hz excluding targets
  const { env: env2, rate: rate2 } = envelope(x, fs, 400, 2000); const ms2 = modSpectrum(env2, rate2); let rough = 0;
  for (let i = Math.round(30 / ms2.df); i < Math.round(300 / ms2.df); i++) { const f = i * ms2.df; if ((hz && Math.abs(f - hz) < 1.5) || (hz2 && Math.abs(f - hz2) < 1.5)) continue; rough += ms2.mag[i] * ms2.mag[i]; } rough = Math.sqrt(rough);
  // clicks: env at 1 kHz rate, jumps > 12 dB within 5 ms
  const xh = filt(x, biquad('hp', fs, 2000, 0.707)); const { env: e3 } = envelope(xh, fs, 300, 1000); let clicks = 0; for (let i = 5; i < e3.length; i++) { if (e3[i] > 4 * e3[i - 5] && e3[i] > 0.004) clicks++; }
  // envelope smoothness: std of slow envelope (1 Hz) relative to mean
  const { env: e4 } = envelope(x, fs, 1.5, 100); const m4 = e4.reduce((a, b) => a + b, 0) / e4.length; const sd4 = Math.sqrt(e4.reduce((a, b) => a + (b - m4) ** 2, 0) / e4.length);
  return { name, hz, hz2, peak_dB: +db(peak).toFixed(1), rms_dB: +db(rms).toFixed(1), crest_dB: +(db(peak) - db(rms)).toFixed(1), centroid_Hz: Math.round(centroid), hf4k_pct: +(hfRatio * 100).toFixed(2), slope_dB_oct: +slope.toFixed(1), mod_target: +at(hz).toFixed(3), mod_target2: +at(hz2).toFixed(3), mod_bg: +bg.toFixed(3), mod_snr: +(at(hz) / (bg || 1e-9)).toFixed(1), rough: +rough.toFixed(3), clicks_per_s: +(clicks / REC_SEC).toFixed(1), slow_var_pct: +(sd4 / m4 * 100).toFixed(1) };
}

// ---------- capture ----------
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(url);
await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
await page.click('#play'); await page.waitForTimeout(300);
await page.evaluate(() => {
  const c = Engine.ctx; window.__rec = { L: [], R: [], on: false };
  const sp = c.createScriptProcessor(4096, 2, 2); Engine.analyser.connect(sp); sp.connect(c.destination);
  sp.onaudioprocess = e => { if (!window.__rec.on) return; window.__rec.L.push(Array.from(e.inputBuffer.getChannelData(0))); window.__rec.R.push(Array.from(e.inputBuffer.getChannelData(1))); };
  window.__fs = c.sampleRate;
});
const combos = JSON.parse(process.argv[2] || 'null') || await page.evaluate(() => MODES.map(m => ({ mode: m.id, world: m.mundo })));
const results = [];
for (const cb of combos) {
  await page.evaluate(cb => { selectMode(cb.mode, false); selectWorld(cb.world); }, cb);
  await page.waitForTimeout(SETTLE * 1000);
  await page.evaluate(() => { window.__rec.L = []; window.__rec.R = []; window.__rec.on = true; });
  await page.waitForTimeout(REC_SEC * 1000);
  const d = await page.evaluate(() => { window.__rec.on = false; return { L: window.__rec.L.flat(), R: window.__rec.R.flat(), fs: window.__fs, hz: Session.mode.hz, hz2: Session.mode.hz2 }; });
  const r = analyze(Float32Array.from(d.L), Float32Array.from(d.R), d.fs, d.hz, d.hz2, `${cb.mode}/${cb.world}`);
  results.push(r); console.log(JSON.stringify(r));
}
fs.writeFileSync('audit.json', JSON.stringify(results, null, 1));
await browser.close();

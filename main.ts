// gta6-trophy-rarity-forecast-01: forecast each GTA VI PlayStation 5 trophy's
// Exophase earn rate at the case's target.
//
// Method. A trophy's earn rate is earners / players-tracked, and the two move
// for different reasons: new players joining Exophase dilute every rate, while
// players already tracked keep earning. The launch-night refresh proved it:
// the tracked population jumped 638 -> 3,868 and every rate fell, though
// nobody un-earned a trophy. So the rate's history has a level shift at the
// refresh, and a trend fit must not treat that shift as a trend. This program
// finds the largest jump in players-tracked between consecutive reads and
// fits only on reads from that jump onward (the stable regime), then fits, per
// trophy, the log-odds of its rate against log-time since release:
//
//   logit(rate_i(t)) = a_i + b_i * ln(1 + t),   t in hours
//
// The log-odds is the right scale twice over: the scorer measures pinball loss
// on it, and it saturates at 100% where a fit to the rate itself (or to the
// earners count) would extrapolate past it. Slopes are shrunk toward the
// median slope of their tier (partial pooling), so a trophy with a flat or
// noisy history borrows the typical growth of its peers instead of
// extrapolating noise. The median is the fitted rate at the target; the spread
// is a random-walk term widening with the horizon plus the fit's own residual,
// so a trophy whose history says little gets a wide band. The house baseline
// (persistence: rates stay where the last read put them) is the special case of
// a flat history; over a week that is wrong, because earners keep growing
// while the tracked population's growth slows, so rates rise.
//
// The program reads every <id>.in in the input directory and writes one
// <id>.out per case: {"trophies":[{"id":n,"q":[q05,q25,q50,q75,q95]}, ...]}.
// Deterministic, standard library only, no network, well inside 8 s.
//
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level. */
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
/** Base spread of a rate's move, in logit units per square-root day. */
const SIGMA = 0.5;
/** Extra spread (logit) when a trophy's history never moved. */
const FLAT_SPREAD = 0.3;
/** Extra drift (logit) for a trophy whose history never moved: over a launch
 * week, earn rates rise as players play, so a flat history is evidence of a
 * stale page, not of a flat future. Grows with the horizon like a walk's mean. */
const FLAT_DRIFT = 0.15;
/** A jump in players-tracked bigger than this between two reads marks the
 * launch refresh; reads before it are a different regime and are not fitted. */
const JUMP_RATIO = 1.5;

interface Trophy { id: number; name: string; tier: string; points: number; secret: boolean }
interface Read { slot: string; at: string; players_tracked: number; trophies_earned: number; rates: Array<number | null> }
interface Case {
  id: string; at: string; horizon_minutes: number; target: string;
  levels: number[]; game: { name: string; platform: string; release_date: string; source: string };
  trophies: Trophy[]; history: Read[]; notes?: string;
}

const clampPct = (x: number): number => Math.min(99.99, Math.max(0.01, x));
const logit = (pct: number): number => Math.log(clampPct(pct) / (100 - clampPct(pct)));
const sigmoidPct = (l: number): number => 100 / (1 + Math.exp(-l));
/** x rounded to 4 decimals. */
const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Least-squares line y = a + b*x; also the residual standard deviation. */
function linfit(xs: number[], ys: number[]): { a: number; b: number; sd: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0; let sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ys[i] - (a + b * xs[i])) ** 2;
  return { a, b, sd: n > 2 ? Math.sqrt(ss / (n - 2)) : 0 };
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (c.levels.length !== LEVELS.length || c.levels.some((t, j) => t !== LEVELS[j])) throw new Error(`${file} asks for levels ${JSON.stringify(c.levels)}, not ${JSON.stringify(LEVELS)}`);
  if (c.history.length === 0) throw new Error(`${file} has no history`);

  // Hours since release (midnight UTC of the release date), floored so the
  // first reads, taken just before midnight, still have a positive time.
  const release = Date.parse(`${c.game.release_date}T00:00:00Z`);
  const hours = (iso: string): number => Math.max(0.05, (Date.parse(iso) - release) / 3_600_000);
  const xOf = (iso: string): number => Math.log(1 + hours(iso));
  const xTarget = xOf(c.target);
  const horizonDays = c.horizon_minutes / 1440;

  // Find the launch refresh: the biggest jump in players-tracked between
  // consecutive reads. Reads before it belong to the pre-refresh regime.
  let cut = 0;
  let worst = 1;
  for (let j = 1; j < c.history.length; j++) {
    const prev = c.history[j - 1].players_tracked;
    const cur = c.history[j].players_tracked;
    if (prev > 0 && cur / prev > worst) { worst = cur / prev; cut = j; }
  }
  const start = worst > JUMP_RATIO ? cut : 0;
  const xs = c.history.map((r) => xOf(r.at));

  // One log-odds line per trophy, fitted on the stable regime.
  interface Fit { b: number; sd: number; flat: boolean; lastRate: number; saturated: boolean }
  const fits: Fit[] = c.trophies.map((t, i) => {
    const pts: Array<[number, number]> = [];
    let flat = true; let prev: number | null = null;
    for (let j = start; j < c.history.length; j++) {
      const r = c.history[j].rates[i];
      if (r === null || r === undefined) continue;
      if (prev !== null && r !== prev) flat = false;
      prev = r;
      pts.push([xs[j], logit(r)]);
    }
    const lastRate = c.history[c.history.length - 1].rates[i];
    if (pts.length < 2) return { b: 0, sd: 0, flat, lastRate: lastRate ?? 0, saturated: lastRate === 100 };
    const f = linfit(pts.map((p) => p[0]), pts.map((p) => p[1]));
    return { b: f.b, sd: f.sd, flat, lastRate: lastRate ?? 0, saturated: lastRate === 100 };
  });

  // Tier medians of the slopes, for partial pooling (platinum has one member,
  // so it pools to a low percentile instead: the platinum can only rise as
  // fast as the slowest trophy it needs, never as fast as the typical one).
  const allSlopes = fits.filter((f) => !f.saturated).map((f) => f.b);
  const overallMed = allSlopes.length ? median(allSlopes) : 0;
  const sortedSlopes = [...allSlopes].sort((a, b) => a - b);
  const lowPct = sortedSlopes.length ? sortedSlopes[Math.floor(0.25 * (sortedSlopes.length - 1))] : overallMed;
  const tierMed = new Map<string, number>();
  for (const tier of new Set(c.trophies.map((t) => t.tier))) {
    const s = fits.filter((f, i) => !f.saturated && c.trophies[i].tier === tier).map((f) => f.b);
    if (s.length >= 3) tierMed.set(tier, median(s));
  }

  const medians: number[] = [];
  const spreads: number[] = [];
  for (let i = 0; i < c.trophies.length; i++) {
    const f = fits[i];
    const t = c.trophies[i];
    if (f.saturated) { medians.push(100); spreads.push(0.05); continue; }
    // Shrink the slope toward its tier's median (3 parts own, 1 part pool);
    // the platinum pools toward the low percentile of slopes instead, since
    // it can only rise as fast as the slowest trophy it needs.
    const pool = t.tier === 'platinum' ? lowPct : (tierMed.get(t.tier) ?? overallMed);
    const w = t.tier === 'platinum' ? 0.5 : 0.75;
    const b = Math.min(4, Math.max(-1, w * f.b + (1 - w) * pool));
    // Refit the intercept at the shrunk slope by least squares (mean of
    // y - b*x over the fitted reads), which averages out the page's
    // 2-decimal rounding instead of anchoring on a single read.
    const pts: Array<[number, number]> = [];
    for (let j = start; j < c.history.length; j++) {
      const r = c.history[j].rates[i];
      if (r === null || r === undefined) continue;
      pts.push([xs[j], logit(r)]);
    }
    let a = 0;
    if (pts.length) {
      const meanY = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const meanX = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      a = meanY - b * meanX;
    }
    let med = clampPct(sigmoidPct(a + b * xTarget));
    // A trophy whose rate never moved gets a small upward drift: a launch
    // week's players are earning, so a flat page is stale, not static.
    // The platinum drifts half as far, since it needs every other trophy.
    if (f.flat) {
      const drift = FLAT_DRIFT * Math.sqrt(horizonDays) * (t.tier === 'platinum' ? 0.5 : 1);
      med = clampPct(sigmoidPct(logit(med) + drift));
    }
    medians.push(med);
    const base = SIGMA * Math.sqrt(horizonDays);
    const fitSd = Math.min(f.sd, 0.6);
    const flatExtra = f.flat ? FLAT_SPREAD : 0;
    spreads.push(Math.sqrt(base * base + fitSd * fitSd + flatExtra * flatExtra));
  }

  // The platinum can only be earned by earning everything else, so it never
  // sits above the lowest other trophy's forecast.
  const platIdx = c.trophies.findIndex((t) => t.tier === 'platinum');
  if (platIdx >= 0 && !fits[platIdx].saturated) {
    const others = medians.filter((_, i) => i !== platIdx);
    if (others.length) medians[platIdx] = Math.min(medians[platIdx], Math.min(...others));
  }

  const trophies = c.trophies.map((t, i) => {
    const l = logit(medians[i]);
    const s = spreads[i];
    return { id: t.id, q: Z.map((z) => (medians[i] === 100 ? 100 : round4(clampPct(sigmoidPct(l + z * s))))) };
  });
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ trophies })}\n`);
}

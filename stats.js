// Coach stats: one record per graded decision, persisted in localStorage.
// Record: { t, piece, hold, res, v, need, best, killer, traps, ct, ms, hint }
//   v: safe | risky | doomed | noclear   need: lookahead the move required (doomed only)
//   traps: lookahead depths at which an alternative would have doomed the combo
//   ct: 1 if a move robust to the unseen piece existed alongside a weaker one (risky = picked the weaker)
(function (global) {
  const KEY = '4w_coach_v1', MAX = 3000;
  const MIN_OPP = 5, TOL = 0.15, MAX_NEED = 5, MIN_NOHINT = 30;

  function summarize(all) {
    // hint-off decisions measure real lookahead; fall back to everything until there are enough
    const noHint = all.filter(r => !r.hint);
    const useNoHint = noHint.length >= MIN_NOHINT;
    const rs = useNoHint ? noHint : all;

    const byNeed = {}, byPiece = {}, killers = {}, bag = { opp: 0, err: 0 };
    let safe = 0, doomed = 0, noclear = 0, msSafe = 0, nSafe = 0, msErr = 0, nErr = 0;
    for (const r of rs) {
      if (r.v === 'noclear') { noclear++; continue; } // dropping without a clear isn't a lookahead miss
      if (r.v === 'safe') safe++; else if (r.v === 'doomed') doomed++;
      if (r.ct) { bag.opp++; if (r.v === 'risky') bag.err++; }
      if (r.traps.length) {
        const p = byPiece[r.piece] || (byPiece[r.piece] = { opp: 0, err: 0 });
        p.opp++; if (r.v === 'doomed') p.err++;
        if (r.v === 'safe') { msSafe += r.ms; nSafe++; } else if (r.v === 'doomed') { msErr += r.ms; nErr++; }
      }
      for (const d of r.traps) {
        const b = byNeed[d] || (byNeed[d] = { opp: 0, err: 0 });
        b.opp++; if (r.v === 'doomed' && r.need === d) b.err++;
      }
      if (r.v === 'doomed') killers[r.killer] = (killers[r.killer] || 0) + 1;
    }

    // horizon = deepest lookahead you handle, with every shallower depth handled too
    let horizon = 0, limit = null;
    for (let d = 1; d <= MAX_NEED; d++) {
      const b = byNeed[d];
      if (!b || b.opp < MIN_OPP) { limit = { d, why: 'data' }; break; }
      const rate = b.err / b.opp;
      if (rate > TOL) { limit = { d, why: 'errors', rate }; break; }
      horizon = d;
    }

    const weakPieces = Object.entries(byPiece)
      .filter(([, v]) => v.opp >= 4 && v.err > 0)
      .map(([id, v]) => ({ id, opp: v.opp, err: v.err, rate: v.err / v.opp }))
      .sort((a, b) => b.rate - a.rate || b.opp - a.opp).slice(0, 3);

    return {
      n: rs.length, total: all.length, useNoHint,
      safe, doomed, noclear, byNeed, bag, horizon, limit, weakPieces,
      killers: Object.entries(killers).sort((a, b) => b[1] - a[1]).slice(0, 3),
      avgMsSafe: nSafe ? msSafe / nSafe : null,
      avgMsErr: nErr ? msErr / nErr : null,
    };
  }

  const hasLS = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  let recs = [];
  if (hasLS) { try { recs = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {} }
  function save() { if (hasLS) { try { localStorage.setItem(KEY, JSON.stringify(recs)); } catch (e) {} } }

  const S = {
    summarize,
    all: () => recs,
    add(r) { recs.push(r); if (recs.length > MAX) recs.shift(); save(); },
    clear() { recs = []; save(); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  else global.Stats = S;
})(typeof window !== 'undefined' ? window : globalThis);

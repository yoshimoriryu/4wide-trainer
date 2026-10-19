// node test/audit.test.js
const assert = require('node:assert/strict');
const E = require('../engine.js');
const Stats = require('../stats.js');

const SEQ_LEN = 6;
function bag(rng) {
  const p = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  for (let i = 6; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// every clearing move reachable from the position, as audit `chosen` inputs
function allChoices(rows, hold, seq) {
  const out = [];
  const routes = [{ piece: seq[0], holdUsed: false }];
  if (hold) routes.push({ piece: hold, holdUsed: true });
  else if (seq[1]) routes.push({ piece: seq[1], holdUsed: true });
  for (const r of routes) for (const pl of E.placements(rows, r.piece)) out.push({ holdUsed: r.holdUsed, rows: pl.rows, cleared: pl.cleared });
  return out;
}

function nextState(hold, queue, c) {
  // mirrors the game: hold swaps in the held piece, or pulls the next one when hold is empty
  if (!c.holdUsed) return { hold, queue: queue.slice(1) };
  return hold ? { hold: queue[0], queue: queue.slice(1) } : { hold: queue[0], queue: queue.slice(2) };
}

let decisions = 0, doomedSeen = 0, trapsSeen = 0;
for (let seed = 1; seed <= 6; seed++) {
  const rng = mulberry(seed);
  let queue = [...bag(rng), ...bag(rng)], hold = null;
  let rows = new Array(E.H).fill(0); rows[E.H - 1] = 7;
  for (let step = 0; step < 40; step++) {
    while (queue.length < 14) queue.push(...bag(rng));
    const seq = [queue[0], ...queue.slice(1, SEQ_LEN)];

    const choices = allChoices(rows, hold, seq);
    const clearing = choices.filter(c => c.cleared > 0);
    if (!clearing.length) break;

    let bestSeen = 0, safeChoice = null;
    for (const c of clearing) {
      const a = E.auditMove(rows, hold, seq, c);
      decisions++;
      assert.ok(['safe', 'doomed'].includes(a.verdict), `clearing move graded ${a.verdict}`);
      assert.ok(a.depth >= 1 && a.depth <= a.bestDepth, 'depth within [1, bestDepth]');
      assert.ok(a.bestDepth <= seq.length);
      if (a.verdict === 'safe') { assert.equal(a.depth, a.bestDepth); safeChoice = safeChoice || c; }
      if (a.verdict === 'doomed') {
        doomedSeen++;
        assert.ok(a.depth < a.bestDepth);
        assert.equal(a.killer, seq[a.depth], 'killer is the piece at the doom index');
        assert.ok(a.traps.includes(a.depth));
      }
      for (const d of a.traps) { assert.ok(d >= 1 && d < a.bestDepth); trapsSeen++; }
      bestSeen = Math.max(bestSeen, a.bestDepth);

      // independent check: bestDepth is the longest prefix comboSurvives agrees with
      let ref = 0;
      for (let k = 1; k <= seq.length; k++) if (E.comboSurvives(rows, hold, seq.slice(0, k), true)) ref = k; else break;
      assert.equal(a.bestDepth, ref, `seed ${seed} step ${step}: bestDepth ${a.bestDepth} vs comboSurvives ${ref}`);
      // the suggested move is itself a safe move
      if (a.best) {
        const sug = E.auditMove(rows, hold, seq, { holdUsed: a.best.holdUsed, rows: a.best.pl.rows, cleared: a.best.pl.cleared });
        assert.equal(sug.verdict, 'safe', 'suggested move grades safe');
      }
    }
    assert.ok(safeChoice, `a safe move exists whenever any clearing move does (seed ${seed} step ${step})`);

    // the hint's move (when it places a piece) must grade safe too
    const hint = E.bestSurvivingMove(rows, hold, seq.slice(0, bestSeen), true);
    if (hint && !hint.holdOnly) {
      const a = E.auditMove(rows, hold, seq, { holdUsed: hint.holdUsed, rows: hint.pl.rows, cleared: hint.pl.cleared });
      assert.equal(a.verdict, 'safe', `hint move graded ${a.verdict}`);
    }
    const ns = nextState(hold, queue, safeChoice);
    hold = ns.hold; queue = ns.queue; rows = safeChoice.rows;
  }
}
assert.ok(decisions > 100, `exercised ${decisions} decisions`);
assert.ok(doomedSeen > 0, 'simulated games contained at least one doomed option');

// no-clear and forced verdicts
{
  const rows = new Array(E.H).fill(0); rows[E.H - 1] = 7;
  const seq = ['O', 'O', 'O', 'O', 'O', 'O'];
  const dead = E.placements(rows, 'O').find(p => p.cleared === 0);
  const a = E.auditMove(rows, null, seq, { holdUsed: false, rows: dead.rows, cleared: 0 });
  assert.ok(['noclear', 'forced'].includes(a.verdict));
}

// stats aggregation
{
  const rec = (v, traps, need, ms = 800, hint = 0, piece = 'T') => ({ v, traps, need, ms, hint, piece, killer: v === 'doomed' ? 'Z' : null });
  const rs = [];
  for (let i = 0; i < 8; i++) rs.push(rec('safe', [2]));             // 8 clean decisions at depth 2
  for (let i = 0; i < 6; i++) rs.push(rec('safe', [3]));
  for (let i = 0; i < 4; i++) rs.push(rec('safe', [1]));
  rs.push(rec('safe', [1]));
  for (let i = 0; i < 5; i++) rs.push(rec('doomed', [4], 4));         // fails every depth-4 trap
  for (let i = 0; i < 5; i++) rs.push(rec('doomed', [4], 4));
  const s = Stats.summarize(rs);
  assert.equal(s.byNeed[2].opp, 8);
  assert.equal(s.byNeed[4].err, s.byNeed[4].opp);
  // depth 1 has only 5 opps (min sample) and all clean; 2 and 3 clean; 4 fails
  assert.equal(s.horizon, 3, `horizon ${s.horizon}`);
  assert.equal(s.limit.d, 4);
  assert.equal(s.limit.why, 'errors');
  assert.deepEqual(s.killers[0], ['Z', 10]);

  // hint-on decisions are ignored once enough hint-off data exists
  const mixed = [];
  for (let i = 0; i < 30; i++) mixed.push(rec('safe', [2], 0, 500, 0));
  for (let i = 0; i < 10; i++) mixed.push(rec('doomed', [2], 2, 500, 1));
  const m = Stats.summarize(mixed);
  assert.equal(m.useNoHint, true);
  assert.equal(m.byNeed[2].err, 0);

  // not enough data -> horizon stays unknown, not inflated
  const thin = Stats.summarize([rec('safe', [2]), rec('safe', [2])]);
  assert.equal(thin.horizon, 0);
  assert.equal(thin.limit.why, 'data');
}

console.log(`ok · ${decisions} audited decisions, ${doomedSeen} doomed, ${trapsSeen} trap depths`);

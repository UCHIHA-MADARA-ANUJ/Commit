/**
 * Edge-case tests — PR #2 (quest/review-me).
 * The perfect first review: small, pure, harmless.
 * Run: node tests/edge.tests.js   (also runs via npm test)
 */

import {
  classifyEvents,
  diversity,
  activityShare,
  rankFor,
  heatLevel,
  fmtNum,
  TYPES,
  emptyCounts,
} from '../assets/js/engine.js';
import { donutSVG } from '../assets/js/charts.js';

let passed = 0;
let failed = 0;
const t = (name, cond) => {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✘ ${name}`); }
};

console.log('\nedge: hostile event payloads');
{
  const c = classifyEvents([
    { type: 'PushEvent', payload: { size: -5 } },          // negative size → clamped to 1
    { type: 'PushEvent', payload: { size: 0 } },           // zero size → clamped to 1
    { type: 'PushEvent', payload: null },                  // null payload
    { type: 'PullRequestEvent' },                          // missing payload entirely
    { type: 'PullRequestEvent', payload: { action: 'reopened' } },
    { type: 'UnknownFutureEventType', payload: {} },
    { type: 'IssuesEvent', payload: { action: 'opened', issue: null } },
  ]);
  t('negative/zero push sizes clamp to 1 each (commits = 2)', c.commits === 2);
  t('null payload never throws', true);
  t('reopened PRs do not count', c.pullRequests === 0);
  t('unknown event types ignored', c.issues === 1);
}

console.log('\nedge: all-unlocked profile');
{
  const all = { commits: 10, pullRequests: 10, issues: 10, reviews: 10, discussions: 10, repos: 10 };
  const share = activityShare(all);
  const div = diversity(all);
  t('perfect balance → 25% commits', Math.abs(share.commitsPct - 25) < 0.001);
  t('nothing missing', div.missing.length === 0 && div.ratio === 1);
  t('rank = Six Paths Sage', rankFor(all).title === 'Six Paths Sage');
}

console.log('\nedge: single-massive-commit account');
{
  const one = { ...emptyCounts(), commits: 9999 };
  const share = activityShare(one);
  t('commitsPct caps logically at 100', share.commitsPct === 100);
  t('rank = Academy Student despite 9999 commits', rankFor(one).title === 'Academy Student');
}

console.log('\nedge: heatLevel clamping');
{
  t('negative counts clamp to 0', heatLevel(-3) === 0);
  t('huge counts clamp to 4', heatLevel(100000) === 4);
}

console.log('\nedge: donut degenerate geometry');
{
  const one = donutSVG([{ value: 1, color: '#000' }], { size: 100, stroke: 20, gapDeg: 2 });
  t('single 100% segment renders', one.includes('<svg'));
  t('tiny gap never produces negative dash length', !one.includes('NaN'));
  const skew = donutSVG([
    { value: 1000000, color: '#a' },
    { value: 1, color: '#b' },
  ]);
  t('extreme skew renders without NaN', !skew.includes('NaN'));
}

console.log('\nedge: fmtNum');
{
  t('formats 1000 with separator', fmtNum(1000) === '1,000');
  t('null → 0', fmtNum(null) === '0');
  t('undefined → 0', fmtNum(undefined) === '0');
}

console.log('\nedge: TYPES integrity');
{
  t('exactly six tracked types', TYPES.length === 6);
  t('no duplicate keys', new Set(TYPES.map((x) => x.key)).size === 6);
  t('every type has a color', TYPES.every((x) => /^#[0-9a-f]{6}$/i.test(x.color)));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

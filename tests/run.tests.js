/**
 * CommitQuest test suite — plain node, no test framework, no dependencies.
 * Run: npm test   (or: node tests/run.tests.js)
 */

import {
  TYPES,
  emptyCounts,
  classifyEvents,
  exactCounts,
  diversity,
  activityShare,
  rankFor,
  languagesFromRepos,
  heatmapFromEvents,
  heatLevel,
  buildShareText,
} from '../assets/js/engine.js';
import { donutSVG } from '../assets/js/charts.js';
import { buildQuests } from '../assets/js/quests.js';

let passed = 0;
let failed = 0;

function t(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.error(`  ✘ ${name}`);
  }
}

console.log('\nengine: classifyEvents');
{
  const events = [
    { type: 'PushEvent', payload: { size: 3 }, created_at: '2026-08-29T10:00:00Z' },
    { type: 'PushEvent', payload: { commits: [1, 2] }, created_at: '2026-08-28T10:00:00Z' },
    { type: 'PushEvent', payload: {}, created_at: '2026-08-27T10:00:00Z' },
    { type: 'PullRequestEvent', payload: { action: 'opened' } },
    { type: 'PullRequestEvent', payload: { action: 'closed' } },
    { type: 'IssuesEvent', payload: { action: 'opened' } },
    { type: 'IssuesEvent', payload: { action: 'closed' } },
    { type: 'PullRequestReviewEvent', payload: {} },
    { type: 'CreateEvent', payload: { ref_type: 'repository' } },
    { type: 'CreateEvent', payload: { ref_type: 'branch' } },
    { type: 'WatchEvent', payload: { action: 'started' } },
    null,
  ];
  const c = classifyEvents(events);
  t('sums all pushes (3 + 2 + 1)', c.commits === 6);
  const c2 = classifyEvents([events[1]]);
  t('falls back to commits array length (2)', c2.commits === 2);
  const c3 = classifyEvents([events[2]]);
  t('falls back to 1 when size missing', c3.commits === 1);
  t('only PRs opened count', c.pullRequests === 1);
  t('only issues opened count', c.issues === 1);
  t('reviews counted', c.reviews === 1);
  t('only repository creates count', c.repos === 1);
  t('null events ignored without crashing', true);
  t('empty input gives empty counts', classifyEvents([]).commits === 0);
  t('undefined input gives empty counts', classifyEvents(undefined).issues === 0);
}

console.log('\nengine: exactCounts');
{
  const c = exactCounts({
    totalCommitContributions: 55,
    totalPullRequestContributions: 1,
    totalIssueContributions: 0,
    totalPullRequestReviewContributions: 0,
    totalDiscussionContributions: 2,
    totalDiscussionAnswerContributions: 1,
    totalRepositoryContributions: 19,
  });
  t('commits mapped', c.commits === 55);
  t('prs mapped', c.pullRequests === 1);
  t('discussions summed with answers', c.discussions === 3);
  t('missing fields default to 0', exactCounts({}).repos === 0);
}

console.log('\nengine: the 98% story');
{
  const counts = { commits: 55, pullRequests: 1, issues: 0, reviews: 0, discussions: 0, repos: 19 };
  const share = activityShare(counts);
  t('total activity = 56', share.total === 56);
  t('commits share ≈ 98.2%', Math.abs(share.commitsPct - 98.214) < 0.01);
  const div = diversity(counts);
  t('present = commits, prs, repos', div.present.join(',') === 'commits,pullRequests,repos');
  t('missing = issues, reviews, discussions', div.missing.join(',') === 'issues,reviews,discussions');
  t('ratio = 3/6', div.ratio === 0.5);
}

console.log('\nengine: ranks');
{
  t('0 types → Civilian', rankFor(emptyCounts()).title === 'Civilian');
  t('1 type → Academy Student', rankFor({ ...emptyCounts(), commits: 5 }).title === 'Academy Student');
  t('2 types → Genin', rankFor({ ...emptyCounts(), commits: 5, issues: 1 }).title === 'Genin');
  t('3 types → Chūnin', rankFor({ ...emptyCounts(), commits: 5, issues: 1, pullRequests: 1 }).title === 'Chūnin');
  t('4 types → Jōnin', rankFor({ ...emptyCounts(), commits: 5, issues: 1, pullRequests: 1, reviews: 1 }).title === 'Jōnin');
  t('5 types → ANBU', rankFor({ ...emptyCounts(), commits: 5, issues: 1, pullRequests: 1, reviews: 1, discussions: 1 }).title === 'ANBU');
  const all = { ...emptyCounts(), commits: 5, issues: 1, pullRequests: 1, reviews: 1, discussions: 1, repos: 2 };
  t('6 types → Six Paths Sage', rankFor(all).title === 'Six Paths Sage');
  t('rank carries present/total', rankFor(all).present === 6 && rankFor(all).total === 6);
}

console.log('\nengine: languages');
{
  const repos = [
    { language: 'TypeScript', fork: false },
    { language: 'TypeScript', fork: false },
    { language: 'HTML', fork: false },
    { language: null, fork: false },
    { language: 'TypeScript', fork: true }, // forks excluded
  ];
  const { total, langs } = languagesFromRepos(repos);
  t('forks excluded, total = 3', total === 3);
  t('sorted by count', langs[0].name === 'TypeScript' && langs[0].repos === 2);
  t('percentages sum ≈ 100', Math.abs(langs.reduce((s, l) => s + l.pct, 0) - 100) < 0.001);
  t('empty repos → empty result', languagesFromRepos([]).langs.length === 0);
}

console.log('\nengine: heatmap');
{
  const events = [
    { type: 'PushEvent', payload: { size: 2 }, created_at: new Date().toISOString() },
    { type: 'PushEvent', payload: { size: 1 }, created_at: new Date().toISOString() },
    { type: 'WatchEvent', payload: {}, created_at: new Date().toISOString() },
  ];
  const cells = heatmapFromEvents(events, 28);
  t('last cell is today and counted', cells[cells.length - 1].count === 2);
  t('first cell is a Sunday', new Date(cells[0].date + 'T00:00:00Z').getUTCDay() === 0);
  t('counts never negative', cells.every((c) => c.count >= 0));
  t('cells ordered ascending', cells[0].date <= cells[cells.length - 1].date);
}

console.log('\nengine: heatLevel');
{
  t('0 → 0', heatLevel(0) === 0);
  t('1 → 1', heatLevel(1) === 1);
  t('2 → 2', heatLevel(2) === 2);
  t('4 → 3', heatLevel(4) === 3);
  t('9 → 4', heatLevel(9) === 4);
}

console.log('\nengine: buildShareText');
{
  const counts = { commits: 55, pullRequests: 1, issues: 0, reviews: 0, discussions: 0, repos: 19 };
  const text = buildShareText({ login: 'uchiha-madara-anuj', counts, mode: 'live' });
  t('contains login', text.includes('@uchiha-madara-anuj'));
  t('contains 98%', text.includes('98%'));
  t('lists missing types', text.includes('issues, reviews, discussions'));
  t('contains rank', text.includes('Chūnin'));
}

console.log('\ncharts: donutSVG');
{
  const empty = donutSVG([]);
  t('empty input renders placeholder ring', empty.includes('#1c2133'));
  const one = donutSVG([{ value: 0, color: '#fff' }]);
  t('zero-total renders placeholder ring', one.includes('#1c2133'));
  const svg = donutSVG([
    { value: 55, color: '#ff4655' },
    { value: 1, color: '#38bdf8' },
  ]);
  t('renders two arcs', (svg.match(/<circle/g) || []).length === 2);
  t('is svg', svg.startsWith('<svg'));
}

console.log('\nquests: buildQuests');
{
  const counts = { commits: 55, pullRequests: 1, issues: 0, reviews: 0, discussions: 0, repos: 19 };
  const quests = buildQuests(counts, { issues: 'https://example.com/i' });
  t('one quest per type', quests.length === TYPES.length);
  t('commits quest done', quests.find((q) => q.key === 'commits').done === true);
  t('issues quest not done', quests.find((q) => q.key === 'issues').done === false);
  t('action link passed through', quests.find((q) => q.key === 'issues').action === 'https://example.com/i');
  t('every quest has help text', quests.every((q) => q.help && q.help.length > 10));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

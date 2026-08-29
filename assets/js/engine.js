/**
 * engine.js — pure logic, zero DOM. Runs in browser AND node (for tests).
 *
 * Everything about "how do we read a GitHub profile as a set of
 * contribution types" lives here.
 */

export const TYPES = [
  { key: 'commits',      label: 'Commits',     icon: '⬢', color: '#ff4655' },
  { key: 'pullRequests', label: 'Pull Requests', icon: '⑂', color: '#38bdf8' },
  { key: 'issues',       label: 'Issues',      icon: '◎', color: '#fbbf24' },
  { key: 'reviews',      label: 'Reviews',     icon: '✓', color: '#a78bfa' },
  { key: 'discussions',  label: 'Discussions', icon: '❖', color: '#f472b6' },
  { key: 'repos',        label: 'New Repos',   icon: '◆', color: '#34d399' },
];

/** The four "activity" types — the mix the classic '98% commits' chart shows. */
export const ACTIVITY_KEYS = ['commits', 'pullRequests', 'issues', 'reviews'];

export function emptyCounts() {
  return { commits: 0, pullRequests: 0, issues: 0, reviews: 0, discussions: 0, repos: 0 };
}

/**
 * Estimate contribution counts from public GitHub events
 * (GET /users/{u}/events/public — roughly the last 300 events).
 */
export function classifyEvents(events = []) {
  const counts = emptyCounts();
  for (const ev of events) {
    if (!ev || !ev.type) continue;
    const payload = ev.payload || {};
    switch (ev.type) {
      case 'PushEvent': {
        const n = typeof payload.size === 'number'
          ? payload.size
          : Array.isArray(payload.commits) ? payload.commits.length : 1;
        counts.commits += Math.max(n, 1);
        break;
      }
      case 'PullRequestEvent':
        if (payload.action === 'opened') counts.pullRequests += 1;
        break;
      case 'IssuesEvent':
        if (payload.action === 'opened') counts.issues += 1;
        break;
      case 'PullRequestReviewEvent':
        counts.reviews += 1;
        break;
      case 'DiscussionEvent':
      case 'DiscussionCommentEvent':
        counts.discussions += 1;
        break;
      case 'CreateEvent':
        if (payload.ref_type === 'repository') counts.repos += 1;
        break;
      default:
        break;
    }
  }
  return counts;
}

/**
 * Normalize a GraphQL contributionsCollection into our counts shape.
 * These are the *exact* yearly numbers GitHub uses for the profile page.
 */
export function exactCounts(collection = {}) {
  return {
    commits: collection.totalCommitContributions || 0,
    pullRequests: collection.totalPullRequestContributions || 0,
    issues: collection.totalIssueContributions || 0,
    reviews: collection.totalPullRequestReviewContributions || 0,
    discussions:
      (collection.totalDiscussionContributions || 0) +
      (collection.totalDiscussionAnswerContributions || 0),
    repos: collection.totalRepositoryContributions || 0,
  };
}

/** Which of the six types are present / missing? */
export function diversity(counts = emptyCounts()) {
  const present = [];
  const missing = [];
  for (const t of TYPES) {
    ((counts[t.key] || 0) > 0 ? present : missing).push(t.key);
  }
  return { present, missing, ratio: present.length / TYPES.length };
}

/** Share of commits among the four activity types (the infamous "98%"). */
export function activityShare(counts = emptyCounts()) {
  const total = ACTIVITY_KEYS.reduce((s, k) => s + (counts[k] || 0), 0);
  if (total === 0) return { total: 0, commitsPct: null, parts: ACTIVITY_KEYS.map((k) => ({ key: k, value: 0, pct: 0 })) };
  const parts = ACTIVITY_KEYS.map((k) => {
    const value = counts[k] || 0;
    return { key: k, value, pct: (value / total) * 100 };
  });
  return { total, commitsPct: ((counts.commits || 0) / total) * 100, parts };
}

export const RANKS = [
  { at: 0, title: 'Civilian',    desc: 'No contributions detected yet. The journey of a thousand commits starts with git init.' },
  { at: 1, title: 'Academy Student', desc: 'One jutsu only. Strong basics, narrow range.' },
  { at: 2, title: 'Genin',       desc: 'Two paths open. Time to leave the village and try new ones.' },
  { at: 3, title: 'Chūnin',      desc: 'Balanced shinobi. Leadership-level versatility.' },
  { at: 4, title: 'Jōnin',       desc: 'Elite. Comfortable across the whole workflow.' },
  { at: 5, title: 'ANBU',        desc: 'Shadow operative. Every field covered but one.' },
  { at: 6, title: 'Six Paths Sage', desc: 'All types awakened. Rinnegan-grade GitHub presence.' },
];

/** Ninja rank for a counts object, based on how many types are non-zero. */
export function rankFor(counts = emptyCounts()) {
  const { present } = diversity(counts);
  let rank = RANKS[0];
  for (const r of RANKS) if (present.length >= r.at) rank = r;
  return { ...rank, present: present.length, total: TYPES.length };
}

/** Aggregate primary languages across a list of repo objects (from REST /repos). */
export function languagesFromRepos(repos = []) {
  const tally = new Map();
  for (const repo of repos) {
    if (repo && repo.fork) continue;
    const lang = repo.language;
    if (!lang) continue;
    tally.set(lang, (tally.get(lang) || 0) + 1);
  }
  const total = [...tally.values()].reduce((s, n) => s + n, 0);
  if (total === 0) return { total: 0, langs: [] };
  const palette = ['#3178c6', '#e34c26', '#f1e05a', '#563d7c', '#dea584', '#89e051', '#ff4655', '#38bdf8', '#a78bfa', '#f472b6'];
  const langs = [...tally.entries()]
    .map(([name, repos], i) => ({ name, repos, pct: (repos / total) * 100, color: palette[i % palette.length] }))
    .sort((a, b) => b.repos - a.repos || a.name.localeCompare(b.name));
  return { total, langs };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toISODate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Build a contribution-grid style window (default 13 weeks) from events.
 * Returns cells ordered oldest → newest, aligned so the first cell is a Sunday.
 */
export function heatmapFromEvents(events = [], days = 91) {
  const perDay = new Map();
  for (const ev of events) {
    if (!ev || ev.type !== 'PushEvent' || !ev.created_at) continue;
    const day = toISODate(new Date(ev.created_at));
    perDay.set(day, (perDay.get(day) || 0) + 1);
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const cells = [];
  const start = new Date(today.getTime() - (days - 1) * DAY_MS);
  // pad back to Sunday so weeks align in columns
  while (start.getUTCDay() !== 0) start.setUTCDate(start.getUTCDate() - 1);

  for (let d = new Date(start); d.getTime() <= today.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = toISODate(d);
    cells.push({ date: iso, count: perDay.get(iso) || 0 });
  }
  return cells;
}

export function heatLevel(count) {
  if (count <= 0) return 0;
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

/** Markdown share card. */
export function buildShareText({ login, counts, mode = 'live', scannedBy = 'CommitQuest' }) {
  const share = activityShare(counts);
  const div = diversity(counts);
  const rank = rankFor(counts);
  const pct = share.commitsPct === null ? 0 : share.commitsPct;
  const pctStr = pct >= 99.5 ? '100' : pct.toFixed(0);
  const missing = div.missing.length
    ? div.missing.join(', ')
    : 'none — all six unlocked';
  return [
    `🥷 CommitQuest — @${login}`,
    ``,
    `Rank: ${rank.title} (${rank.present}/${rank.total} contribution types)`,
    `Commits ${counts.commits} (${pctStr}% of activity) · PRs ${counts.pullRequests} · Issues ${counts.issues} · Reviews ${counts.reviews} · Discussions ${counts.discussions} · Repos ${counts.repos}`,
    `Missing: ${missing}`,
    ``,
    `— scanned by ${scannedBy} (${mode} mode)`,
  ].join('\n');
}

export function fmtNum(n) {
  return new Intl.NumberFormat('en-US').format(n || 0);
}

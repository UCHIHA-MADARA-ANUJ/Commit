/**
 * app.js — CommitQuest UI glue.
 * Edit OWNER / REPO / LINKS if you fork this — everything else is generic.
 */

import { GhError, fetchProfile, fetchExact } from './api.js';
import {
  TYPES,
  fmtNum,
  classifyEvents,
  exactCounts,
  diversity,
  rankFor,
  activityShare,
  languagesFromRepos,
  heatmapFromEvents,
  heatLevel,
  buildShareText,
} from './engine.js';
import { buildQuests } from './quests.js';
import { donutSVG } from './charts.js';

/* ------------------------------------------------------------------ */
/* config — edit me if you fork                                        */
/* ------------------------------------------------------------------ */

const OWNER = 'UCHIHA-MADARA-ANUJ';
const REPO = 'Commit';
const PR_LINK = 'https://github.com/UCHIHA-MADARA-ANUJ/Commit/pull/2';

const issueBody = [
  '### Quest: unlock the Issues badge 🥷',
  '',
  "This issue exists so a commit-only shinobi can earn their first **Issues** contribution.",
  '',
  '- [ ] Say hi (one line is enough)',
  '- [ ] Post your current rank from the CommitQuest dashboard',
  '',
  '_Opened via the CommitQuest quest board._',
].join('\n');

const prBody = [
  '### Quest: unlock the Pull Requests badge 🥷',
  '',
  'Adds my name to the Hall of Fame — my first authored pull request.',
  '',
  '- [x] Added my name to `docs/HALL_OF_FAME.md`',
  '',
  '_Opened via the CommitQuest quest board (branch `good-first-pr`)._',
].join('\n');

const LINKS = {
  commits: PR_LINK,
  pullRequests: `https://github.com/${OWNER}/${REPO}/compare/main...good-first-pr?quick_pull=1&title=${encodeURIComponent('Quest: add me to the Hall of Fame')}&body=${encodeURIComponent(prBody)}`,
  issues: `https://github.com/${OWNER}/${REPO}/issues/new?title=${encodeURIComponent('Quest: unlock my Issues badge')}&body=${encodeURIComponent(issueBody)}`,
  reviews: PR_LINK,
  discussions: `https://github.com/${OWNER}/${REPO}/discussions/new`,
  repos: `https://github.com/new?name=${encodeURIComponent(OWNER)}&description=${encodeURIComponent('⚡ my GitHub profile — powered by the CommitQuest profile kit')}&visibility=public`,
};

/* ------------------------------------------------------------------ */
/* baked-in datasets                                                   */
/* ------------------------------------------------------------------ */

const LANG_PALETTE = { TypeScript: '#3178c6', HTML: '#e34c26', JavaScript: '#f1e05a', CSS: '#563d7c', GLSL: '#5686a5', PLpgSQL: '#dad8d8', Shell: '#89e051' };

// Cached snapshot of @UCHIHA-MADARA-ANUJ — captured 2026-08-29 via GraphQL.
// Public data; used as offline fallback + rate-limit escape hatch.
const SNAPSHOT = {
  login: OWNER,
  name: 'UCHIHA MADARA ANUJ',
  avatar: 'https://github.com/UCHIHA-MADARA-ANUJ.png',
  bio: 'The very picture of the 98% problem — and the reason CommitQuest exists.',
  mode: 'cached snapshot · 2026-08-29 (post-merge)',
  counts: { commits: 65, pullRequests: 1, issues: 0, reviews: 0, discussions: 0, repos: 19 },
  langs: [
    { name: 'TypeScript', pct: 82.4 },
    { name: 'HTML', pct: 8.1 },
    { name: 'JavaScript', pct: 5.7 },
    { name: 'CSS', pct: 2.6 },
    { name: 'GLSL', pct: 0.6 },
    { name: 'PLpgSQL', pct: 0.4 },
    { name: 'Shell', pct: 0.2 },
  ],
  heat: null,
};

// A balanced hypothetical shinobi — what "all five" looks like.
const SAMPLE = {
  login: 'six-paths-shinobi',
  name: 'Sample Shinobi (demo data)',
  avatar: '',
  bio: 'Not a real user — a demo of what a fully awakened, all-five profile looks like.',
  mode: 'sample data',
  counts: { commits: 412, pullRequests: 26, issues: 18, reviews: 11, discussions: 4, repos: 12 },
  langs: [
    { name: 'TypeScript', pct: 44 },
    { name: 'Python', pct: 21 },
    { name: 'Rust', pct: 13 },
    { name: 'Go', pct: 9 },
    { name: 'Shell', pct: 7 },
    { name: 'Lua', pct: 6 },
  ],
  heat: (() => {
    const cells = [];
    const today = new Date();
    for (let i = 90; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      const seed = (d.getUTCDate() * 7 + d.getUTCDay() * 3 + d.getUTCMonth()) % 5;
      cells.push({ date: iso, count: seed === 0 ? 0 : seed });
    }
    return cells;
  })(),
};

/* ------------------------------------------------------------------ */
/* tiny helpers                                                        */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function getToken() {
  try { return localStorage.getItem('cq_token') || ''; } catch { return ''; }
}

/* ------------------------------------------------------------------ */
/* rendering                                                           */
/* ------------------------------------------------------------------ */

let lastRender = null;

function showLoader(on) {
  $('results').hidden = true;
  $('status').innerHTML = on
    ? `<div class="loader"><span class="brand-eye" aria-hidden="true"><i></i><i></i><i></i></span> Scanning the village…</div>`
    : '';
}

function showError(err, username) {
  const results = $('results');
  results.hidden = true;
  let msg = escapeHtml(err.message || 'Something went wrong');
  let extra = '';

  if (err.kind === 'rate-limit') {
    extra = `<br /><span class="muted">Try again in a bit, use exact mode with a token, or view the cached snapshot.</span>`;
    msg = `GitHub's public API rate limit was hit (60 requests/hour per IP).`;
  } else if (err.kind === 'not-found') {
    msg = `No GitHub user found for <code>@${escapeHtml(username)}</code>. Check the spelling?`;
  } else if (err.kind === 'network') {
    extra = `<br /><span class="muted">If you are offline, the cached snapshot still works.</span>`;
  }

  $('status').innerHTML = `
    <div class="error-box">
      <div>${msg}${extra}</div>
      <div>
        <button class="btn ghost" id="retry-btn" type="button">Retry</button>
        <button class="btn ghost" id="snapshot-btn" type="button">View cached snapshot</button>
      </div>
    </div>`;
  $('retry-btn').addEventListener('click', () => analyze(username));
  $('snapshot-btn').addEventListener('click', renderSnapshot);
}

function typeCard(t, count) {
  const done = count > 0;
  return `
    <div class="type-card ${done ? 'done' : 'zero'}" style="--tcolor:${t.color}">
      <div class="t-icon" style="color:${t.color}">${t.icon}</div>
      <div class="t-label">${t.label}</div>
      <div class="t-value">${fmtNum(count)}</div>
      <div class="t-state">${done ? '✓ unlocked' : '✗ locked'}</div>
    </div>`;
}

function questRow(q) {
  return `
    <div class="quest ${q.done ? 'done' : ''}">
      <div class="q-icon" style="color:${q.color}">${q.icon}</div>
      <div class="q-body">
        <div class="q-title">${q.label} ${q.done ? `<span class="tag-done">✓ unlocked · ${fmtNum(q.count)}</span>` : ''}
        </div>
        <div class="q-help">${q.help}</div>
      </div>
      ${q.done ? '' : q.action ? `<a class="btn primary" href="${q.action}" target="_blank" rel="noopener">${q.actionLabel} ↗</a>` : ''}
    </div>`;
}

function langRow(l) {
  const color = l.color || LANG_PALETTE[l.name] || '#ff4655';
  const pctStr = l.pct >= 99.5 ? '100' : l.pct.toFixed(1);
  return `
    <div class="lang-row">
      <div class="lang-top"><span>${escapeHtml(l.name)}</span><span class="pct">${pctStr}%</span></div>
      <div class="lang-bar"><i style="width:${Math.max(l.pct, 1.2).toFixed(1)}%; --lcolor:${color}"></i></div>
    </div>`;
}

function heatGrid(cells) {
  if (!cells) return '';
  return cells
    .map((c) => {
      const d = new Date(c.date + 'T00:00:00Z');
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      return `<span class="cell c${heatLevel(c.count)}" title="${c.count} push${c.count === 1 ? '' : 'es'} · ${label}"></span>`;
    })
    .join('');
}

function render(data) {
  lastRender = data;

  $('status').innerHTML = `
    <div class="mode-chip"><span class="dot"></span>${escapeHtml(data.mode)}${data.note ? ` · ${escapeHtml(data.note)}` : ''}</div>`;

  $('p-avatar').src = data.avatar || `https://github.com/${encodeURIComponent(data.login)}.png`;
  $('p-name').textContent = data.name || data.login;
  $('p-login').textContent = `@${data.login}`;
  $('p-bio').textContent = data.bio || '';
  $('p-meta').textContent = data.meta || '';

  // donut: the four activity types (the classic "98% commits" chart)
  const share = activityShare(data.counts);
  const segments = share.parts
    .filter((p) => p.value > 0)
    .map((p) => ({ value: p.value, color: TYPES.find((t) => t.key === p.key).color }));
  $('donut').innerHTML = donutSVG(segments);
  $('donut-center').innerHTML = share.commitsPct === null
    ? `<div class="big">—</div><div class="lbl">no activity</div>`
    : `<div class="big">${share.commitsPct >= 99.5 ? '100' : share.commitsPct.toFixed(0)}<span style="font-size:1rem">%</span></div><div class="lbl">commits share<br />of activity</div>`;

  const rank = rankFor(data.counts);
  $('rank-badge').innerHTML = `
    <div class="title">${rank.title}</div>
    <div class="desc">${rank.desc}</div>
    <div class="sub">${rank.present}/${rank.total} types unlocked${share.commitsPct !== null && share.commitsPct >= 90 && rank.present >= 2 ? ' · still ~' + share.commitsPct.toFixed(0) + '% commits — diversify 🥷' : ''}</div>`;

  const div = diversity(data.counts);
  $('type-count').textContent = `${div.present.length}/6 unlocked`;
  $('type-grid').innerHTML = TYPES.map((t) => typeCard(t, data.counts[t.key] || 0)).join('');

  $('quest-list').innerHTML = buildQuests(data.counts, LINKS).map(questRow).join('');

  $('languages').innerHTML = (data.langs || []).slice(0, 8).map(langRow).join('') || '<p class="muted">No public repos with languages.</p>';

  const heatEl = $('heatmap');
  heatEl.innerHTML = heatGrid(data.heat) || '<p class="muted">Heatmap needs live event data.</p>';
  $('heatmap-note').textContent = data.heat
    ? 'Green squares are a lie of the past — this grid is crimson, as all heatmaps should be.'
    : 'Snapshot mode has no event stream — analyze live to populate it.';

  $('results').hidden = false;
  $('share-note').textContent = 'Copies a markdown card — perfect for a PR, issue or README.';
}

/* ------------------------------------------------------------------ */
/* data sources                                                        */
/* ------------------------------------------------------------------ */

function renderSnapshot() {
  showLoader(false);
  render({ ...SNAPSHOT, meta: '19 public repos · snapshot taken before the quest began' });
}

function renderSample() {
  showLoader(false);
  render(SAMPLE);
}

function buildMeta(user) {
  const bits = [];
  if (typeof user.public_repos === 'number') bits.push(`${fmtNum(user.public_repos)} public repos`);
  if (typeof user.followers === 'number') bits.push(`${fmtNum(user.followers)} followers`);
  if (user.created_at) bits.push(`since ${new Date(user.created_at).getUTCFullYear()}`);
  return bits.join(' · ');
}

async function analyze(username) {
  username = (username || '').trim().replace(/^@/, '');
  if (!username) { toast('Type a username first 🥷'); return; }

  history.replaceState(null, '', `?u=${encodeURIComponent(username)}`);
  showLoader(true);
  $('analyze-btn').disabled = true;

  try {
    const token = getToken();
    const { user, events, repos } = await fetchProfile(username, { token });

    let counts = classifyEvents(events);
    let mode = 'live estimate · last ~300 events';
    let note = '';

    if (token) {
      try {
        const collection = await fetchExact(username, token);
        counts = exactCounts(collection);
        mode = 'exact · GraphQL yearly totals';
      } catch (err) {
        note = `exact mode failed (${err.message}) — using estimate`;
      }
    }

    render({
      login: user.login,
      name: user.name || user.login,
      avatar: user.avatar_url,
      bio: user.bio || '',
      meta: buildMeta(user),
      counts,
      mode,
      note,
      langs: languagesFromRepos(repos).langs,
      heat: heatmapFromEvents(events),
    });
  } catch (err) {
    showError(err, username);
  } finally {
    $('analyze-btn').disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

$('analyze-form').addEventListener('submit', (e) => {
  e.preventDefault();
  analyze($('username-input').value);
});

$('demo-btn').addEventListener('click', () => {
  $('username-input').value = SAMPLE.login;
  renderSample();
});

$('share-btn').addEventListener('click', async () => {
  if (!lastRender) return;
  const text = buildShareText({ login: lastRender.login, counts: lastRender.counts, mode: lastRender.mode.split('·')[0].trim() });
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied — paste it anywhere 📋');
  } catch {
    $('share-note').textContent = 'Clipboard blocked — select and copy from the console.';
    console.log(text);
  }
});

$('token-save').addEventListener('click', () => {
  const v = $('token-input').value.trim();
  if (!v) { toast('Paste a token first'); return; }
  try { localStorage.setItem('cq_token', v); } catch { /* private mode */ }
  toast('Token saved — re-analyzing with exact numbers');
  analyze(lastRender?.login || $('username-input').value || OWNER);
});

$('token-clear').addEventListener('click', () => {
  try { localStorage.removeItem('cq_token'); } catch { /* private mode */ }
  $('token-input').value = '';
  toast('Token cleared');
});

/* boot: ?u= wins, otherwise scan the repo owner (snapshot as fallback) */
(function boot() {
  const params = new URLSearchParams(location.search);
  const u = params.get('u');
  if (u) {
    $('username-input').value = u;
    analyze(u);
  } else {
    $('username-input').value = OWNER;
    analyze(OWNER).catch(() => renderSnapshot());
  }
})();

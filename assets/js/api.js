/**
 * api.js — GitHub API access.
 *
 * Two modes:
 *   1. estimate  — public REST only (no token): user + last ~300 public
 *                  events + repos. Subject to 60 req/hr per IP.
 *   2. exact     — optional PAT + GraphQL contributionsCollection for the
 *                  real yearly numbers GitHub shows on the profile page.
 */

const API = 'https://api.github.com';
const GRAPHQL = 'https://api.github.com/graphql';

export class GhError extends Error {
  constructor(message, status = 0, kind = 'generic') {
    super(message);
    this.name = 'GhError';
    this.status = status;
    this.kind = kind; // 'not-found' | 'rate-limit' | 'auth' | 'network' | 'generic'
  }
}

async function ghFetch(path, token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(API + path, { headers });
  } catch (err) {
    throw new GhError('Network error — could not reach api.github.com', 0, 'network');
  }

  if (res.status === 404) throw new GhError('User or endpoint not found', 404, 'not-found');
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      throw new GhError('GitHub public API rate limit reached (60/hr per IP)', 403, 'rate-limit');
    }
    throw new GhError('Forbidden — is that token valid?', 403, 'auth');
  }
  if (!res.ok) throw new GhError(`GitHub API error (HTTP ${res.status})`, res.status);

  return res.json();
}

async function fetchEvents(username, token, pages = 2) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const batch = await ghFetch(
      `/users/${encodeURIComponent(username)}/events/public?per_page=100&page=${page}`,
      token
    );
    out.push(...batch);
    if (!Array.isArray(batch) || batch.length < 100) break;
  }
  return out;
}

/** Public profile: user object + public events + repos (non-exact mode). */
export async function fetchProfile(username, { token, eventPages = 2 } = {}) {
  const [user, events, repos] = await Promise.all([
    ghFetch(`/users/${encodeURIComponent(username)}`, token),
    fetchEvents(username, token, eventPages),
    ghFetch(`/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`, token),
  ]);
  return { user, events, repos };
}

const CONTRIB_QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      totalDiscussionContributions
      totalDiscussionAnswerContributions
      totalRepositoryContributions
    }
  }
}`;

/** Exact yearly totals. Requires a token (classic or fine-grained, no scopes for public users). */
export async function fetchExact(username, token) {
  if (!token) throw new GhError('Exact mode needs a token', 401, 'auth');

  let res;
  try {
    res = await fetch(GRAPHQL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: CONTRIB_QUERY, variables: { login: username } }),
    });
  } catch (err) {
    throw new GhError('Network error — could not reach api.github.com', 0, 'network');
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new GhError('GitHub GraphQL returned an unreadable response', res.status);
  }

  if (data.errors && data.errors.length) {
    const msg = data.errors[0] && data.errors[0].message;
    if (/bad credentials/i.test(String(msg))) throw new GhError('Bad credentials — check the token', 401, 'auth');
    throw new GhError(`GraphQL error: ${msg || 'unknown'}`, 400);
  }
  if (!data.data || !data.data.user) {
    throw new GhError('User not found (or token cannot see it)', 404, 'not-found');
  }
  return data.data.user.contributionsCollection;
}

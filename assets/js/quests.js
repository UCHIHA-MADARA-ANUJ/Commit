/**
 * quests.js — turns missing contribution types into one-click quests.
 * Pure data + logic; app.js supplies the repo-specific links.
 */

import { TYPES } from './engine.js';

export const QUEST_HELP = {
  commits:
    'Push a commit or merge an open pull request — the classic. You almost certainly have this one already.',
  pullRequests:
    'Open a pull request. A ready-made branch (good-first-pr) is waiting in this repo — one click.',
  issues:
    'Open an issue. A pre-filled one exists — 30 seconds, title and body already written.',
  reviews:
    'Review someone\'s pull request. There is an open PR in this repo right now — an "Approve" with one comment counts.',
  discussions:
    'Start a discussion on a repo with Discussions enabled (this repo qualifies once the owner flips it on — see the guide).',
  repos:
    'Create any new repository. Bonus: the special username/username repo powers your profile README.',
};

/**
 * Build the quest board.
 * counts: engine counts object. links: map of type key → URL (may be partial).
 */
export function buildQuests(counts, links = {}) {
  return TYPES.map((t) => ({
    key: t.key,
    label: t.label,
    icon: t.icon,
    color: t.color,
    done: (counts[t.key] || 0) > 0,
    count: counts[t.key] || 0,
    help: QUEST_HELP[t.key],
    action: links[t.key] || null,
    actionLabel: ACTION_LABELS[t.key] || 'Go',
  }));
}

export const ACTION_LABELS = {
  commits: 'Open the PR to merge',
  pullRequests: 'Open your PR (1 click)',
  issues: 'Open prefilled issue',
  reviews: 'Review the open PR',
  discussions: 'Start a discussion',
  repos: 'Create the profile repo',
};

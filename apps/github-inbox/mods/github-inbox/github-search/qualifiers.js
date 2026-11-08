// Users are left out: suggesting them means fetching every collaborator.
const SHARED = [
  "is:open",
  "is:closed",
  "label:",
  "no:label",
  "no:assignee",
  "assignee:@me",
  "author:@me",
  "involves:@me",
  "mentions:@me",
];
const SORTS = ["sort:updated-desc", "sort:created-desc", "sort:comments-desc"];
const PULL_ONLY = [
  "is:merged",
  "is:draft",
  "review-requested:@me",
  "review:required",
  "review:approved",
  "review:changes_requested",
];

// One repo's issue list.
export const ISSUE_QUALIFIERS = [...SHARED, ...SORTS];
// One repo's pull request list.
export const PULL_QUALIFIERS = [
  ...SHARED.slice(0, 2),
  ...PULL_ONLY.slice(0, 2),
  ...SHARED.slice(2),
  ...PULL_ONLY.slice(2),
  ...SORTS,
];
// Issues and pull requests across repos, as on github.com/issues. No sort: the caller sorts.
export const ACROSS_REPOS_QUALIFIERS = [
  "is:issue",
  "is:pr",
  ...SHARED.slice(0, 2),
  ...PULL_ONLY.slice(0, 2),
  "repo:",
  "org:",
  ...SHARED.slice(2),
  ...PULL_ONLY.slice(2),
];

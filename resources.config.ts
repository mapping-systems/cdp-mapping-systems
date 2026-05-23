/*
  Course resources configuration.

  Edit this file to control what gets pulled from external sources by
  `npm run build:resources`. Generated output lands in:
    - src/content/resources/<slug>.md      (one per channel/list, drives the index)
    - src/data/arena/<slug>.json           (per arena channel — feeds the grid)
    - src/data/github/<slug>.json          (per GitHub list — feeds the grid)
    - src/data/zotero.json                 (Zotero collection)

  These are committed manually so Cloudflare can serve them without needing
  any API tokens at build time. See README "Maintaining course resources".

  Auth (only if your sources are private — both arena and Zotero work
  unauthenticated for public libraries; GitHub Lists require a token):
    ARENA_TOKEN   — generate at dev.are.na (Personal Access Token)
    ZOTERO_KEY    — generate at zotero.org/settings/keys (read-only)
    GITHUB_TOKEN  — any classic or fine-grained token with `read:user` /
                    `public_repo`; simplest is `gh auth token` if you have
                    the gh CLI installed.

  Store all three in `.env` (gitignored). See `.env.example`.
*/

export interface ArenaChannelConfig {
  /** URL slug from are.na/<user>/<slug> — used to fetch from the API. */
  slug: string;
  /** Optional override for the published URL: /resources/<urlSlug>.
      Defaults to `slug`. Use when the are.na slug is auto-generated
      garbage (`maps-yszif0goa1g`) and you want a clean URL. */
  urlSlug?: string;
  /** Optional override for how this channel is labeled on the site. */
  title?: string;
  /** Optional one-liner shown on the resources index. */
  description?: string;
  /** Manual tags shown on the channel card (and used for filtering once
      multiple channels exist). Are.na doesn't tag channels itself, so
      this is curator-supplied. */
  tags?: string[];
}

export interface GithubListConfig {
  /** GitHub username that owns the list. */
  username: string;
  /** The list slug from github.com/stars/<user>/lists/<slug>. */
  slug: string;
  /** Optional override for the published URL: /resources/<urlSlug>. Defaults to `slug`. */
  urlSlug?: string;
  /** Optional override for how this list is labeled on the site. */
  title?: string;
  /** Optional one-liner shown on the resources index. */
  description?: string;
  /** Manual tags shown on the card. */
  tags?: string[];
}

export interface ZoteroConfig {
  /** Numeric user ID from zotero.org/settings/keys. */
  userId: string;
  /** Library type: 'users' for personal, 'groups' for group library. */
  libraryType: 'users' | 'groups';
  /** Collection key (the alphanumeric ID in zotero.org/<...>/collections/XXXX). */
  collectionId: string;
  /** Citation Style Language slug (https://github.com/citation-style-language/styles). */
  style: string;
  /** Sort order returned by the API. */
  sort: 'date' | 'title' | 'creator' | 'dateAdded';
  /** 'asc' or 'desc'. */
  direction: 'asc' | 'desc';
}

/* ============================================================================
   Are.na channels
   ============================================================================
   Add channels here. Each becomes a /resources/<urlSlug ?? slug> page.
*/
export const ARENA_CHANNELS: ArenaChannelConfig[] = [
  {
    slug: 'maps-yszif0goa1g',
    urlSlug: 'precedents',
    title: 'Precedents',
    description: 'Cartographic references, projects, and visual inspiration.',
    tags: ['cartography', 'inspiration'],
  },
];

/* ============================================================================
   GitHub Lists (https://github.com/stars/<user>/lists)
   ============================================================================
   Add lists here. Each becomes a /resources/<urlSlug ?? slug> page rendering
   the repositories in the list as a card grid.
*/
export const GITHUB_LISTS: GithubListConfig[] = [
  {
    username: 'mariogiampieri',
    slug: 'mapping-systems',
    urlSlug: 'tools',
    title: 'Tools',
    description: 'Open-source mapping libraries, frameworks, and utilities relevant to the course.',
    tags: ['software', 'open source'],
  },
];

/* ============================================================================
   Zotero
   ============================================================================
   Set userId and collectionId to your Zotero collection. The page at
   /bibliography renders the items in the chosen style.
*/
export const ZOTERO: ZoteroConfig = {
  userId: '902075',
  libraryType: 'users',
  collectionId: '847AR7X4',
  style: 'chicago-author-date',
  sort: 'creator',
  direction: 'asc',
};

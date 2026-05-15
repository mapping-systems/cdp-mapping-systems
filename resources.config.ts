/*
  Course resources configuration.

  Edit this file to control what gets pulled from external sources by
  `npm run build:resources`. Generated output lands in:
    - src/content/resources/<slug>.md   (one per are.na channel)
    - src/data/zotero.json              (Zotero collection)

  Both are gitignored — commit the regenerated content as part of your
  refresh workflow.

  Auth (only if your sources are private; both can be omitted otherwise):
    ARENA_TOKEN  — generate at dev.are.na (Personal Access Token)
    ZOTERO_KEY   — generate at zotero.org/settings/keys (read-only)

  Store both in `.env` (gitignored). See `.env.example`.
*/

export interface ArenaChannelConfig {
  /** URL slug from are.na/<user>/<slug>. */
  slug: string;
  /** Optional override for how this channel is labeled on the site. */
  title?: string;
  /** Optional one-liner shown on the resources index. */
  description?: string;
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
   Add channels here. Each becomes a /resources/<slug> page on the site.
*/
export const ARENA_CHANNELS: ArenaChannelConfig[] = [
  {
    slug: 'maps-yszif0goa1g',
    title: 'Maps',
    description: 'Course-related cartographic references and inspiration.',
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

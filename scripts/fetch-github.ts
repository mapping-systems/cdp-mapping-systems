#!/usr/bin/env npx tsx
/**
 * Fetch GitHub Star Lists configured in resources.config.ts and convert
 * each into a card grid on the site, similar to how arena channels work.
 *
 * GitHub Lists aren't exposed via the REST API at all — we use the GraphQL
 * `user.lists` field, which requires authentication. The script reads
 * GITHUB_TOKEN from the environment (any classic or fine-grained token with
 * `read:user` and `public_repo`; `gh auth token` produces a working value).
 *
 * Usage:
 *   GITHUB_TOKEN=$(gh auth token) npm run build:github
 *
 * Output:
 *   src/content/resources/<urlSlug>.md   (drives the resources index card)
 *   src/data/github/<urlSlug>.json       (consumed by /resources/<urlSlug>)
 */

import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { GITHUB_LISTS, type GithubListConfig } from '../resources.config.js';

const OUTPUT_DIR = 'src/content/resources';
const JSON_OUTPUT_DIR = 'src/data/github';
const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const PAGE_SIZE = 100; // GitHub caps at 100 per page

// ---------------------------------------------------------------------------
// GraphQL types — only the fields we render
// ---------------------------------------------------------------------------

interface RepoNode {
  __typename: 'Repository';
  nameWithOwner: string;
  name: string;
  url: string;
  description: string | null;
  homepageUrl: string | null;
  stargazerCount: number;
  forkCount: number;
  isArchived: boolean;
  primaryLanguage: { name: string; color: string | null } | null;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  owner: { login: string; avatarUrl: string };
  updatedAt: string;
}

interface ListNode {
  name: string;
  slug: string;
  description: string | null;
  items: {
    totalCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: (RepoNode | Record<string, never>)[];
  };
}

interface UserListsResponse {
  data: {
    user: {
      lists: {
        nodes: ListNode[];
      };
    } | null;
  };
  errors?: { message: string }[];
}

// ---------------------------------------------------------------------------
// Compact card representation written to JSON
// ---------------------------------------------------------------------------

interface RepoCard {
  nameWithOwner: string;
  name: string;
  owner: string;
  ownerAvatarUrl: string;
  url: string;
  description: string | null;
  homepageUrl: string | null;
  stars: number;
  forks: number;
  isArchived: boolean;
  language: string | null;
  languageColor: string | null;
  topics: string[];
  updatedAt: string;
}

interface ListOutput {
  slug: string;
  username: string;
  title: string;
  description: string;
  url: string;
  itemCount: number;
  tags: string[];
  fetchedAt: string;
  repos: RepoCard[];
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN env var required. Easiest: GITHUB_TOKEN=$(gh auth token) npm run build:github',
    );
  }

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'cdp-mapping-systems-build',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GitHub GraphQL HTTP ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { errors?: { message: string }[] } & T;
  if (body.errors && body.errors.length > 0) {
    throw new Error(`GitHub GraphQL error: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  return body;
}

const LIST_QUERY = `
  query ($login: String!, $cursor: String) {
    user(login: $login) {
      lists(first: 50) {
        nodes {
          name
          slug
          description
          items(first: 100, after: $cursor) {
            totalCount
            pageInfo { hasNextPage endCursor }
            nodes {
              __typename
              ... on Repository {
                nameWithOwner
                name
                url
                description
                homepageUrl
                stargazerCount
                forkCount
                isArchived
                primaryLanguage { name color }
                repositoryTopics(first: 20) { nodes { topic { name } } }
                owner { login avatarUrl }
                updatedAt
              }
            }
          }
        }
      }
    }
  }
`;

/** Fetch one list's items, paginating until exhausted. */
async function fetchList(config: GithubListConfig): Promise<ListNode | null> {
  let cursor: string | null = null;
  let merged: ListNode | null = null;

  while (true) {
    const data = await graphql<UserListsResponse>(LIST_QUERY, {
      login: config.username,
      cursor,
    });

    const user = data.data?.user;
    if (!user) {
      throw new Error(`GitHub user not found: ${config.username}`);
    }

    const list = user.lists.nodes.find((l) => l.slug === config.slug);
    if (!list) {
      throw new Error(
        `List "${config.slug}" not found for user "${config.username}". ` +
          `Available: ${user.lists.nodes.map((l) => l.slug).join(', ') || '(none)'}`,
      );
    }

    if (merged === null) {
      merged = { ...list, items: { ...list.items, nodes: [...list.items.nodes] } };
    } else {
      merged.items.nodes.push(...list.items.nodes);
    }

    if (!list.items.pageInfo.hasNextPage) break;
    cursor = list.items.pageInfo.endCursor;
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

function isRepo(node: RepoNode | Record<string, never>): node is RepoNode {
  return (node as RepoNode).__typename === 'Repository';
}

function repoToCard(repo: RepoNode): RepoCard {
  return {
    nameWithOwner: repo.nameWithOwner,
    name: repo.name,
    owner: repo.owner.login,
    ownerAvatarUrl: repo.owner.avatarUrl,
    url: repo.url,
    description: repo.description,
    homepageUrl: repo.homepageUrl,
    stars: repo.stargazerCount,
    forks: repo.forkCount,
    isArchived: repo.isArchived,
    language: repo.primaryLanguage?.name ?? null,
    languageColor: repo.primaryLanguage?.color ?? null,
    topics: repo.repositoryTopics.nodes.map((n) => n.topic.name),
    updatedAt: repo.updatedAt,
  };
}

function escapeYaml(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function listToMarkdown(list: ListOutput, heroAvatar: string | null): string {
  const frontmatter: string[] = [
    `title: ${escapeYaml(list.title)}`,
    `slug: ${escapeYaml(list.slug)}`,
    `source: github`,
    `blockCount: ${list.itemCount}`,
    `lastFetched: ${escapeYaml(list.fetchedAt)}`,
  ];
  if (list.description) frontmatter.push(`description: ${escapeYaml(list.description)}`);
  if (heroAvatar) frontmatter.push(`heroImage: ${escapeYaml(heroAvatar)}`);
  if (list.tags.length > 0) {
    frontmatter.push(`tags:\n${list.tags.map((t) => `  - ${escapeYaml(t)}`).join('\n')}`);
  }

  // Body is a flat list of repo links — provides an SEO-friendly fallback
  // and gives Astro's content collection something to load even if the
  // grid renderer isn't invoked.
  const body = list.repos
    .map((r) => {
      const lines = [`- **[${r.nameWithOwner}](${r.url})**`];
      if (r.description) lines.push(`  ${r.description.replace(/\n/g, ' ')}`);
      return lines.join('\n');
    })
    .join('\n');

  return `---\n${frontmatter.join('\n')}\n---\n\n${body}\n`;
}

function listToJson(list: ListNode, config: GithubListConfig): ListOutput {
  const repos = list.items.nodes.filter(isRepo).map(repoToCard);
  const urlSlug = config.urlSlug ?? config.slug;
  return {
    slug: urlSlug,
    username: config.username,
    title: config.title ?? list.name,
    description: config.description ?? list.description ?? '',
    url: `https://github.com/stars/${config.username}/lists/${config.slug}`,
    itemCount: repos.length,
    tags: config.tags ?? [],
    fetchedAt: new Date().toISOString(),
    repos,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('━━━ GitHub Lists ━━━');

  if (GITHUB_LISTS.length === 0) {
    console.log('No lists configured. Edit GITHUB_LISTS in resources.config.ts');
    return;
  }

  // Fresh JSON dir; do NOT wipe OUTPUT_DIR since arena writes to the same dir.
  if (existsSync(JSON_OUTPUT_DIR)) rmSync(JSON_OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(JSON_OUTPUT_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let ok = 0;
  let failed = 0;
  for (const config of GITHUB_LISTS) {
    try {
      const list = await fetchList(config);
      if (!list) {
        console.error(`  ✗ ${config.username}/${config.slug}: list not found`);
        failed++;
        continue;
      }

      const json = listToJson(list, config);
      const urlSlug = json.slug;

      // Hero avatar: owner of the first repo in the list.
      const heroAvatar = json.repos[0]?.ownerAvatarUrl ?? null;

      const jsonPath = join(JSON_OUTPUT_DIR, `${urlSlug}.json`);
      writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf-8');

      const mdPath = join(OUTPUT_DIR, `${urlSlug}.md`);
      writeFileSync(mdPath, listToMarkdown(json, heroAvatar), 'utf-8');

      console.log(`  ✓ ${urlSlug} (${json.repos.length} repos) → ${mdPath}, ${jsonPath}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${config.username}/${config.slug}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }
  console.log(`Done: ${ok} succeeded, ${failed} failed.`);

  if (failed > 0) process.exit(1);
}

main();

// What GitHub says about a repository, read while the site is built so that
// visitors' browsers never call GitHub.

export interface RepoStats {
  stars: number | null;
  /** The repository's description as its owner wrote it. */
  description: string | null;
}

const UNKNOWN: RepoStats = { stars: null, description: null };
const pending = new Map<string, Promise<RepoStats>>();

async function fetchStats(repo: string): Promise<RepoStats> {
  try {
    const token = process.env.GITHUB_TOKEN;
    const response = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return UNKNOWN;
    const body = (await response.json()) as { stargazers_count?: unknown; description?: unknown };
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    return {
      stars: typeof body.stargazers_count === 'number' ? body.stargazers_count : null,
      description: description || null,
    };
  } catch {
    return UNKNOWN;
  }
}

/**
 * The star count and description of a repository (owner/name), asked for once
 * per build. Either is null when it cannot be read; pages then leave it out.
 */
export function getRepoStats(repo: string): Promise<RepoStats> {
  const key = repo.toLowerCase();
  let stats = pending.get(key);
  if (!stats) {
    stats = fetchStats(repo);
    pending.set(key, stats);
  }
  return stats;
}

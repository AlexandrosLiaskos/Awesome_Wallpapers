const API = 'https://api.github.com/repos/AlexandrosLiaskos/Awesome_Wallpapers';

let pending: Promise<number | null> | undefined;

async function fetchStars(): Promise<number | null> {
  try {
    const token = process.env.GITHUB_TOKEN;
    const response = await fetch(API, {
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { stargazers_count?: unknown };
    return typeof body.stargazers_count === 'number' ? body.stargazers_count : null;
  } catch {
    return null;
  }
}

/**
 * The repository's star count, read once while the site is built so that
 * visitors' browsers never call GitHub. Null when it cannot be read; the
 * site then shows the link without a number.
 */
export function getStars(): Promise<number | null> {
  pending ??= fetchStars();
  return pending;
}

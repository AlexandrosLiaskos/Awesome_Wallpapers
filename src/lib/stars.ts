import { getRepoStats } from './repo-stats.ts';
import { SITE } from './site.ts';

/**
 * The gallery repository's star count, read while the site is built. Null when
 * it cannot be read; the site then shows the link without a number.
 */
export async function getStars(): Promise<number | null> {
  return (await getRepoStats(new URL(SITE.repo).pathname.slice(1))).stars;
}

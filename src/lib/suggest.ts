import type { Tag } from './types.ts';

/** Machine tags must be about as trustworthy as hand tags: at least this share of what they assign must be right. */
export const MIN_PRECISION = 0.8;

/** A wallpaper carries at most five tags, so no more subject tags than that are suggested. */
export const MAX_SUGGESTED = 5;

/**
 * The threshold to give a tag, from the similarity scores of wallpapers and whether each is
 * hand-tagged with it. Among the scores that, used as a threshold (score >= threshold), assign
 * the tag with at least minPrecision precision, it returns the one with the best F1, the lowest
 * on a tie. null when no threshold reaches the precision: the tag is then never suggested.
 *
 * The threshold is always one of the scores, the lowest one it accepts, which is the strictest
 * value that still gives the same assignments.
 */
export function chooseThreshold(scores: number[], truth: boolean[], minPrecision = MIN_PRECISION): number | null {
  if (scores.length !== truth.length) throw new Error(`${scores.length} scores but ${truth.length} truth values`);
  const positives = truth.filter(Boolean).length;
  if (positives === 0) return null;

  const ranked = scores.map((score, index) => ({ score, tagged: truth[index] })).sort((a, b) => b.score - a.score);
  let assigned = 0;
  let truePositives = 0;
  let best: { threshold: number; f1: number } | null = null;
  for (let i = 0; i < ranked.length; i += 1) {
    assigned += 1;
    if (ranked[i].tagged) truePositives += 1;
    // Equal scores pass or fail a threshold together.
    if (i + 1 < ranked.length && ranked[i + 1].score === ranked[i].score) continue;
    if (truePositives === 0 || truePositives / assigned < minPrecision) continue;
    // 2TP / (2TP + FP + FN), where TP + FP is what was assigned and TP + FN the hand-tagged ones.
    const f1 = (2 * truePositives) / (assigned + positives);
    // Walking down the scores, ">=" lets a tie go to the lower threshold.
    if (!best || f1 >= best.f1) best = { threshold: ranked[i].score, f1 };
  }
  return best ? best.threshold : null;
}

/**
 * The tags whose similarity reaches their threshold, the clearest first (similarity minus
 * threshold), at most max. A tag with a null threshold is never suggested.
 */
export function suggestTags(similarity: Record<string, number>, thresholds: Record<string, number | null>, max = MAX_SUGGESTED): string[] {
  const passing: { slug: string; margin: number }[] = [];
  for (const [slug, threshold] of Object.entries(thresholds)) {
    const score = similarity[slug];
    if (threshold === null || score === undefined || score < threshold) continue;
    passing.push({ slug, margin: score - threshold });
  }
  passing.sort((a, b) => b.margin - a.margin || a.slug.localeCompare(b.slug));
  return passing.slice(0, max).map((item) => item.slug);
}

/**
 * The CLIP prompt for each subject tag: "a <label> wallpaper", or its override from
 * data/tagger.json. Palette tags are left out: they are measured from the colours instead.
 */
export function subjectPrompts(tags: Tag[], overrides: Record<string, string> = {}): Record<string, string> {
  const subjects = tags.filter((tag) => tag.kind === 'subject');
  const known = new Set(subjects.map((tag) => tag.slug));
  for (const slug of Object.keys(overrides)) {
    if (!known.has(slug)) throw new Error(`there is a prompt for "${slug}", which is not a subject tag in data/tags.yml`);
  }
  return Object.fromEntries(subjects.map((tag) => [tag.slug, overrides[tag.slug] ?? `a ${tag.label} wallpaper`]));
}

function norm(vector: Float32Array): number {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

/** Cosine similarity of an image embedding with each tag's text embedding. */
export function similarities(image: Float32Array, texts: Record<string, Float32Array>): Record<string, number> {
  const imageNorm = norm(image);
  const result: Record<string, number> = {};
  for (const [slug, text] of Object.entries(texts)) {
    if (text.length !== image.length) throw new Error(`the embedding for "${slug}" has ${text.length} values, the image ${image.length}`);
    let dot = 0;
    for (let i = 0; i < image.length; i += 1) dot += image[i] * text[i];
    result[slug] = dot / (imageNorm * norm(text));
  }
  return result;
}

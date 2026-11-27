import { describe, expect, it } from 'vitest';
import { probeScore, trainProbe } from '../../src/lib/probe.ts';

const v = (...values: number[]): Float32Array => Float32Array.from(values);

// Tagged when the first value is high; the second value is noise.
const features = [v(0.9, 0.1), v(0.8, -0.3), v(0.7, 0.4), v(0.6, -0.1), v(0.2, 0.3), v(0.1, -0.4), v(0.0, 0.2), v(-0.1, -0.2)];
const labels = [true, true, true, true, false, false, false, false];

describe('trainProbe', () => {
  it('separates a separable set', () => {
    const probe = trainProbe(features, labels);
    const scores = features.map((feature) => probeScore(probe, feature));
    const lowestTagged = Math.min(...scores.slice(0, 4));
    const highestUntagged = Math.max(...scores.slice(4));
    expect(lowestTagged).toBeGreaterThan(highestUntagged);
    // Log-odds: positive for tagged, negative for untagged.
    expect(lowestTagged).toBeGreaterThan(0);
    expect(highestUntagged).toBeLessThan(0);
  });

  it('learns the bias when the boundary is far from zero', () => {
    const shifted = features.map((feature) => v(feature[0] + 5, feature[1]));
    const probe = trainProbe(shifted, labels);
    expect(probeScore(probe, v(5.85, 0))).toBeGreaterThan(0);
    expect(probeScore(probe, v(5.05, 0))).toBeLessThan(0);
  });

  it('weights the rare class so that a single tagged example still scores above the rest', () => {
    const rare = [v(1, 0), v(0.2, 0.1), v(0.1, -0.1), v(0.0, 0.2), v(-0.1, 0.0), v(0.15, -0.2), v(0.05, 0.3), v(-0.2, -0.1)];
    const probe = trainProbe(rare, [true, false, false, false, false, false, false, false]);
    expect(probeScore(probe, rare[0])).toBeGreaterThan(0);
    for (const feature of rare.slice(1)) expect(probeScore(probe, feature)).toBeLessThan(0);
  });

  it('is deterministic', () => {
    expect(trainProbe(features, labels)).toEqual(trainProbe(features, labels));
  });

  it('keeps the weights smaller under a stronger penalty', () => {
    const size = (lambda: number) => Math.hypot(...trainProbe(features, labels, { lambda }).weights);
    expect(size(1)).toBeLessThan(size(0.001));
  });

  it('needs both tagged and untagged examples of matching shape', () => {
    expect(() => trainProbe(features, labels.map(() => true))).toThrow();
    expect(() => trainProbe(features, labels.slice(1))).toThrow();
    expect(() => trainProbe([v(1, 2), v(1)], [true, false])).toThrow();
  });
});

describe('probeScore', () => {
  it('is the weighted sum plus the bias', () => {
    expect(probeScore({ weights: [2, -1], bias: 0.5 }, v(1, 3))).toBeCloseTo(-0.5);
  });

  it('rejects an embedding of the wrong length', () => {
    expect(() => probeScore({ weights: [2, -1], bias: 0 }, v(1))).toThrow();
  });
});

/**
 * A linear probe: a logistic regression per subject tag on CLIP image embeddings, trained on the
 * hand tags. Its score is the log-odds that the tag applies, weights · embedding + bias.
 */
export interface Probe {
  weights: number[];
  bias: number;
}

/** Strength of the L2 penalty, on the weights of the standardised values (the bias is not penalised). */
export const DEFAULT_LAMBDA = 0.01;

/** Gradient descent steps. Fixed, so that training is deterministic and takes the same time every run. */
export const DEFAULT_STEPS = 400;

// Rounds of power iteration for the curvature bound that sets the step size.
const POWER_ROUNDS = 30;

function sigmoid(z: number): number {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

/**
 * Trains a probe with plain full-batch gradient descent on the class-weighted logistic loss plus
 * lambda / 2 times the squared weights. Features and labels must line up, and both tagged and
 * untagged examples are needed.
 */
export function trainProbe(features: ArrayLike<number>[], labels: boolean[], { lambda = DEFAULT_LAMBDA, steps = DEFAULT_STEPS } = {}): Probe {
  const n = features.length;
  if (n !== labels.length) throw new Error(`${n} feature vectors but ${labels.length} labels`);
  const d = n === 0 ? 0 : features[0].length;
  if (features.some((feature) => feature.length !== d)) throw new Error('feature vectors differ in length');
  const positives = labels.filter(Boolean).length;
  if (positives === 0 || positives === n) throw new Error('a probe needs both tagged and untagged examples');

  // Each value is standardised so that one step size suits every direction. The scaling is folded
  // back into the weights at the end, so the probe works on the embedding as it is.
  const mean = new Float64Array(d);
  const scale = new Float64Array(d);
  for (const feature of features) for (let j = 0; j < d; j += 1) mean[j] += feature[j] / n;
  for (const feature of features) for (let j = 0; j < d; j += 1) scale[j] += (feature[j] - mean[j]) ** 2 / n;
  for (let j = 0; j < d; j += 1) scale[j] = Math.sqrt(scale[j]) || 1;
  const x = new Float64Array(n * d);
  features.forEach((feature, i) => {
    for (let j = 0; j < d; j += 1) x[i * d + j] = (feature[j] - mean[j]) / scale[j];
  });

  // Each class carries half of the loss, so a tag on a few wallpapers is not drowned out.
  const weightOf = labels.map((label) => (label ? n / (2 * positives) : n / (2 * (n - positives))) / n);
  const y = labels.map((label) => (label ? 1 : 0));

  // The loss curves at most a quarter as much as the weighted second moment of [x, 1]; its largest
  // eigenvalue (power iteration from a fixed start) gives a step size that cannot diverge.
  let vector = new Float64Array(d + 1).fill(1 / Math.sqrt(d + 1));
  let largest = 0;
  for (let round = 0; round < POWER_ROUNDS; round += 1) {
    const next = new Float64Array(d + 1);
    for (let i = 0; i < n; i += 1) {
      let dot = vector[d];
      for (let j = 0; j < d; j += 1) dot += x[i * d + j] * vector[j];
      const weighted = weightOf[i] * dot;
      for (let j = 0; j < d; j += 1) next[j] += weighted * x[i * d + j];
      next[d] += weighted;
    }
    largest = Math.hypot(...next);
    vector = next.map((value) => value / largest);
  }
  const rate = 1 / (largest / 4 + lambda);

  const w = new Float64Array(d);
  let b = 0;
  const gradient = new Float64Array(d);
  for (let step = 0; step < steps; step += 1) {
    gradient.fill(0);
    let gradientB = 0;
    for (let i = 0; i < n; i += 1) {
      let z = b;
      for (let j = 0; j < d; j += 1) z += w[j] * x[i * d + j];
      const g = weightOf[i] * (sigmoid(z) - y[i]);
      for (let j = 0; j < d; j += 1) gradient[j] += g * x[i * d + j];
      gradientB += g;
    }
    for (let j = 0; j < d; j += 1) w[j] -= rate * (gradient[j] + lambda * w[j]);
    b -= rate * gradientB;
  }

  const weights = Array.from(w, (value, j) => value / scale[j]);
  const bias = weights.reduce((sum, weight, j) => sum - weight * mean[j], b);
  return { weights, bias };
}

/** The probe's score for an embedding: the log-odds that the tag applies. */
export function probeScore(probe: Probe, embedding: ArrayLike<number>): number {
  if (embedding.length !== probe.weights.length) throw new Error(`the embedding has ${embedding.length} values, the probe ${probe.weights.length}`);
  let score = probe.bias;
  for (let j = 0; j < embedding.length; j += 1) score += probe.weights[j] * embedding[j];
  return score;
}

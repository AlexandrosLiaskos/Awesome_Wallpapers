// The summary page of a GitHub Actions job, where the owner sees what a run did without reading its log.

import { appendFile } from 'node:fs/promises';

/** Adds Markdown to the job summary (the file named by GITHUB_STEP_SUMMARY); outside Actions it does nothing. */
export async function writeJobSummary(markdown: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const file = env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  await appendFile(file, `${markdown.trimEnd()}\n\n`);
}

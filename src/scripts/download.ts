interface Dependencies {
  fetch?: typeof fetch;
  /** What to do when the file cannot be fetched. Defaults to going to the file itself. */
  open?: (url: string) => void;
}

/**
 * Saves a file under a chosen name. The originals live on another origin,
 * where the `download` attribute of a link is ignored, so the file is fetched
 * and handed to the browser as a local blob. If that fails for any reason the
 * original is opened instead, so the button never does nothing.
 */
export async function saveAs(fileUrl: string, filename: string, deps: Dependencies = {}): Promise<'saved' | 'opened'> {
  const request = deps.fetch ?? fetch;
  const open = deps.open ?? ((url: string) => location.assign(url));

  try {
    const response = await request(fileUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const objectUrl = URL.createObjectURL(await response.blob());

    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return 'saved';
  } catch {
    open(fileUrl);
    return 'opened';
  }
}

// The catalog in the least bytes the gallery needs, so the browser can add the
// cards the server left out. Items follow the catalog order.

import type { APIRoute } from 'astro';
import { toCardData, type CompactIndex } from '../../lib/card.ts';
import { tagLabels, wallpapers } from '../../lib/data.ts';

export const GET: APIRoute = () => {
  const body: CompactIndex = {
    labels: tagLabels,
    items: wallpapers.map(toCardData),
  };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};

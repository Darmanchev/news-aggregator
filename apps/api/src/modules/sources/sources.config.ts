export interface Source {
  id: string;
  name: string;
  feedUrl: string;
  imageHosts?: string[];
  previewPolicy?: {
    maxExcerptLength?: number;
    requireAttribution?: boolean;
    feedOnly?: boolean;
    imageLabel?: string;
  };
}

// RSS permissions and attribution requirements are recorded in README.md.
export const sources: Source[] = [
  { id: 'mediapool', name: 'Mediapool', feedUrl: 'https://www.mediapool.bg/feed/', imageHosts: ['www.mediapool.bg', 'mediapool.bg'] },
  {
    id: 'telegraph', name: 'Вестник Телеграф', feedUrl: 'https://telegraph.bg/rss',
    imageHosts: ['m.netinfo.bg'], previewPolicy: { imageLabel: 'Телеграф' },
  },
  { id: 'offnews', name: 'OFFNews', feedUrl: 'https://feed.offnews.bg/rss/all', imageHosts: ['i2.offnews.bg'] },
  { id: 'dnevnik', name: 'Дневник', feedUrl: 'https://www.dnevnik.bg/rss/', imageHosts: ['img.dnevnik.bg'] },
  {
    id: 'actualno', name: 'Actualno.com', feedUrl: 'https://www.actualno.com/rss/novini-new',
    imageHosts: ['cdn.actualno.eu'],
    previewPolicy: { maxExcerptLength: 200, requireAttribution: true, feedOnly: true },
  },
  { id: 'dariknews', name: 'DarikNews.bg · Нет Инфо', feedUrl: 'https://dariknews.bg/rss.php' },
  { id: 'kaldata', name: 'Kaldata.com · Калдейта Ком', feedUrl: 'https://www.kaldata.com/feed' },
];

export function isSourceImageUrl(value: string, sourceId: string): boolean {
  try {
    const url = new URL(value);
    return value.length <= 2048 && url.href.length <= 2048 && url.protocol === 'https:'
      && !url.username && !url.password && !url.port
      && !!sources.find(({ id }) => id === sourceId)?.imageHosts?.includes(url.hostname);
  } catch { return false; }
}

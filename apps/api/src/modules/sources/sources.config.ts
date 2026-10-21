export interface Source {
  id: string;
  name: string;
  feedUrl: string;
  imageHosts?: string[];
}

// RSS permissions and attribution requirements are recorded in README.md.
export const sources: Source[] = [
  { id: 'mediapool', name: 'Mediapool', feedUrl: 'https://www.mediapool.bg/feed/' },
  { id: 'telegraph', name: 'Вестник Телеграф', feedUrl: 'https://telegraph.bg/rss' },
  { id: 'offnews', name: 'OFFNews', feedUrl: 'https://feed.offnews.bg/rss/all', imageHosts: ['i2.offnews.bg'] },
];

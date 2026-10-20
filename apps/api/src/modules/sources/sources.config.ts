export interface Source {
  id: string;
  name: string;
  feedUrl: string;
}

// RSS aggregation is permitted by https://www.mediapool.bg/terms/.
export const sources: Source[] = [
  { id: 'mediapool', name: 'Mediapool', feedUrl: 'https://www.mediapool.bg/feed/' },
];

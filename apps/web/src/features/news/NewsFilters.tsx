import type { Filters, Option } from './news.api';

interface Props {
  filters: Filters;
  sources: Option[];
  tags: Option[];
  onChange: (filters: Filters) => void;
}

export function NewsFilters({ filters, sources, tags, onChange }: Props) {
  return <div className="filters">
    <label htmlFor="source">Source<select id="source" value={filters.source} onChange={(event) => onChange({ ...filters, source: event.target.value })}>
      <option value="">All sources</option>{sources.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    <label htmlFor="topic">Topic<select id="topic" value={filters.tag} onChange={(event) => onChange({ ...filters, tag: event.target.value })}>
      <option value="">All topics</option>{tags.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    {(filters.source || filters.tag) && <button className="text-button clear-filters" onClick={() => onChange({ source: '', tag: '' })}>Clear filters ×</button>}
  </div>;
}

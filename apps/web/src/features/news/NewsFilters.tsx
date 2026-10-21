import { useEffect, useState } from 'react';
import type { Filters, Option } from './news.api';

interface Props {
  filters: Filters;
  sources: Option[];
  tags: Option[];
  onChange: (filters: Filters) => void;
}

export function NewsFilters({ filters, sources, tags, onChange }: Props) {
  const [search, setSearch] = useState(filters.q);
  useEffect(() => { setSearch(filters.q); }, [filters.q]);
  return <div className="filters">
    <form className="headline-search" role="search" onSubmit={(event) => {
      event.preventDefault();
      onChange({ ...filters, q: search.trim() });
    }}>
      <label htmlFor="headline-search">Search headlines<input id="headline-search" type="search" value={search} maxLength={100} placeholder="Search Bulgarian headlines" onChange={(event) => setSearch(event.target.value)} /></label>
      <button className="search-button" type="submit">Search</button>
    </form>
    <label htmlFor="source">Source<select id="source" value={filters.source} onChange={(event) => onChange({ ...filters, source: event.target.value })}>
      <option value="">All sources</option>{sources.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    <label htmlFor="topic">Topic<select id="topic" value={filters.tag} onChange={(event) => onChange({ ...filters, tag: event.target.value })}>
      <option value="">All topics</option>{tags.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    {(filters.source || filters.tag || filters.q) && <button className="text-button clear-filters" onClick={() => onChange({ source: '', tag: '', q: '' })}>Clear filters ×</button>}
  </div>;
}

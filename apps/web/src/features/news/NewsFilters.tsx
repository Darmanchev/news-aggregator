import { useEffect, useState } from 'react';
import type { Filters, Option } from './news.api';

interface Props {
  filters: Filters;
  sources: Option[];
  onChange: (filters: Filters) => void;
}

export function NewsFilters({ filters, sources, onChange }: Props) {
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
    <label htmlFor="period">Published<select id="period" value={filters.period ?? 'year'} onChange={(event) => onChange({ ...filters, period: event.target.value as Filters['period'] })}>
      <option value="day">Last 24 hours</option>
      <option value="week">Last 7 days</option>
      <option value="month">Last 30 days</option>
      <option value="year">Last year</option>
    </select></label>
    <label htmlFor="sort">Sort by<select id="sort" value={filters.sort ?? 'newest'} onChange={(event) => onChange({ ...filters, sort: event.target.value as Filters['sort'] })}>
      <option value="newest">Newest first</option>
      <option value="oldest">Oldest first</option>
      <option value="popular">Most opened in 7 days</option>
    </select></label>
    {(filters.source || filters.tag || filters.q || filters.period && filters.period !== 'year' || filters.sort && filters.sort !== 'newest') &&
      <button className="text-button clear-filters" onClick={() => onChange({ source: '', tag: '', q: '' })}>Clear filters ×</button>}
  </div>;
}

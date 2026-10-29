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
  const roots = tags.filter((tag) => !tag.parentId && tag.id.startsWith('medtop:'));
  function descendants(id: string, depth = 0): { tag: Option; depth: number }[] {
    return tags.filter((tag) => tag.parentId === id).flatMap((tag) => [{ tag, depth }, ...descendants(tag.id, depth + 1)]);
  }
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
      <option value="">All topics</option>
      {roots.map((root) => <optgroup key={root.id} label={root.name}>
        <option value={root.id}>{root.name} — всички</option>
        {descendants(root.id).map(({ tag, depth }) => <option key={tag.id} value={tag.id}>{'— '.repeat(depth)}{tag.name}</option>)}
      </optgroup>)}
      {tags.some((tag) => !tag.id.startsWith('medtop:')) && <optgroup label="География">
        {tags.filter((tag) => !tag.id.startsWith('medtop:')).map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </optgroup>}
    </select></label>
    {(filters.source || filters.tag || filters.q) && <button className="text-button clear-filters" onClick={() => onChange({ source: '', tag: '', q: '' })}>Clear filters ×</button>}
  </div>;
}

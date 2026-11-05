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
  let selected = tags.find((tag) => tag.id === filters.tag);
  while (selected?.parentId) selected = tags.find((tag) => tag.id === selected!.parentId);
  const sectionId = selected?.id ?? '';
  function descendants(id: string, path = ''): { tag: Option; label: string }[] {
    return tags.filter((tag) => tag.parentId === id).flatMap((tag) => {
      const label = path ? `${path} / ${tag.name}` : tag.name;
      return [{ tag, label }, ...descendants(tag.id, label)];
    });
  }
  const subtopics = descendants(sectionId);
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
    <label className="topic-filter" htmlFor="topic">Topic<select id="topic" value={sectionId} aria-describedby="topic-help" onChange={(event) => onChange({ ...filters, tag: event.target.value })}>
      <option value="">All topics</option>
      {roots.map((root) => <option key={root.id} value={root.id}>{root.name}</option>)}
      {tags.some((tag) => !tag.id.startsWith('medtop:')) && <optgroup label="География">
        {tags.filter((tag) => !tag.id.startsWith('medtop:')).map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </optgroup>}
    </select></label>
    {subtopics.length > 0 && <label className="topic-filter" htmlFor="subtopic">Subtopic<select id="subtopic" value={filters.tag} aria-describedby="topic-help" onChange={(event) => onChange({ ...filters, tag: event.target.value })}>
      <option value={sectionId}>All in {selected?.name}</option>
      {subtopics.map(({ tag, label }) => <option key={tag.id} value={tag.id}>{label}</option>)}
    </select></label>}
    {(filters.source || filters.tag || filters.q) && <button className="text-button clear-filters" onClick={() => onChange({ source: '', tag: '', q: '' })}>Clear filters ×</button>}
    <p id="topic-help" className="topic-help">Choose a broad topic, then optionally narrow it to a subtopic. Each selection includes its subtopics.</p>
  </div>;
}

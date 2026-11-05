import { useState } from 'react';
import type { Option } from './news.api';

const favoritesKey = 'news.favorite-topics';
const shortNames: Record<string, string> = {
  'medtop:01000000': 'Култура и медии',
  'medtop:02000000': 'Право и престъпност',
  'medtop:03000000': 'Бедствия',
  'medtop:04000000': 'Икономика',
  'medtop:08000000': 'Любопитно',
  'medtop:10000000': 'Начин на живот',
  'medtop:11000000': 'Политика',
  'medtop:16000000': 'Конфликти',
  'medtop:17000000': 'Време',
};

function readFavorites(): string[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(favoritesKey) ?? '[]');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

export function TopicPanel({ tags, selected, onSelect }: {
  tags: Option[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [favorites, setFavorites] = useState(readFavorites);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const subjects = tags.filter(({ id }) => id.startsWith('medtop:'));
  const geography = tags.filter(({ id }) => !id.startsWith('medtop:'));
  const selectedTag = tags.find(({ id }) => id === selected);
  const byId = new Map(subjects.map((tag) => [tag.id, tag]));
  const name = (tag: Option) => shortNames[tag.id] ?? tag.name;

  function root(tag: Option): Option {
    let current = tag;
    while (current.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current;
  }

  const section = selectedTag && byId.has(selected) ? root(selectedTag) : undefined;
  const term = search.trim().toLocaleLowerCase('bg');
  const matches = term ? subjects.filter((tag) =>
    [name(tag), tag.name].some((label) => label.toLocaleLowerCase('bg').includes(term))) : [];
  const subtopics = section ? subjects.filter((tag) => tag.parentId && root(tag).id === section.id) : [];

  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
    setFavorites(next);
    try { window.localStorage.setItem(favoritesKey, JSON.stringify(next)); } catch { /* Keep favorites for this page. */ }
  }

  function chip(tag: Option, canFavorite = true) {
    const favorite = favorites.includes(tag.id);
    return <span className="topic-chip" key={tag.id}>
      <button type="button" className="tag" lang="bg" title={tag.name} aria-pressed={selected === tag.id} onClick={() => onSelect(tag.id)}>
        {name(tag)}
      </button>
      {canFavorite && <button type="button" className="topic-star" aria-label={`Favorite ${name(tag)}`} aria-pressed={favorite} onClick={() => toggleFavorite(tag.id)}>
        <span aria-hidden="true">{favorite ? '★' : '☆'}</span>
      </button>}
    </span>;
  }

  return <aside className="topic-panel" aria-label="Topics" data-open={open}>
    <h2 className="topic-panel-title">Topics</h2>
    <button type="button" className="topic-panel-toggle search-button" aria-expanded={open} aria-controls="topic-panel-body" onClick={() => setOpen(!open)}>
      {selectedTag ? `Topics · ${name(selectedTag)}` : 'Topics'}
    </button>
    <div id="topic-panel-body" className="topic-panel-body">
      <h3 id="favorite-topics">Favorite topics</h3>
      <div className="topic-chips" role="group" aria-labelledby="favorite-topics">
        {subjects.filter(({ id }) => favorites.includes(id)).map((tag) => chip(tag))}
        {!subjects.some(({ id }) => favorites.includes(id)) && <p className="muted">Use the star to pin a topic here.</p>}
      </div>
      <label className="topic-search">Find a topic<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="topic-chips">
        <button type="button" className="tag" aria-pressed={!selected} onClick={() => { onSelect(''); setSearch(''); }}>All topics</button>
        {term ? matches.map((tag) => chip(tag)) : subjects.filter((tag) => !tag.parentId).map((tag) => chip(tag))}
      </div>
      {term && matches.length === 0 && <p className="muted">No topics match your search.</p>}
      {!term && section && subtopics.length > 0 && <>
        <h3 lang="bg">{name(section)}</h3>
        <div className="topic-chips">{subtopics.map((tag) => chip(tag))}</div>
      </>}
      {geography.length > 0 && <>
        <h3 id="topic-geography">Geography</h3>
        <div className="topic-chips" role="group" aria-labelledby="topic-geography">
          {geography.map((tag) => chip(tag, false))}
        </div>
        <p className="muted">Based on place names mentioned in the news.</p>
      </>}
    </div>
  </aside>;
}

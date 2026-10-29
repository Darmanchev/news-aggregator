import { useEffect, useState } from 'react';
import { NewsCard } from './NewsCard';
import { NewsFilters } from './NewsFilters';
import { NewStoriesNotice } from './NewStoriesNotice';
import { fetchOptions, type Filters, type Option } from './news.api';
import { useNewsFeed } from './useNewsFeed';

export function NewsPage() {
  const [filters, setFilters] = useState<Filters>({ source: '', tag: '', q: '' });
  const [options, setOptions] = useState<{ sources: Option[]; tags: Option[] }>({ sources: [], tags: [] });
  const [optionsError, setOptionsError] = useState(false);
  const [optionsRetryKey, setOptionsRetryKey] = useState(0);
  const [newsRefreshKey, setNewsRefreshKey] = useState(0);
  const { articles, nextCursor, loading, loadingMore, error, loadMore } = useNewsFeed(filters, newsRefreshKey);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsError(false);
    void fetchOptions(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setOptions(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setOptionsError(true);
      });
    return () => controller.abort();
  }, [optionsRetryKey]);

  const refresh = () => setNewsRefreshKey((value) => value + 1);
  const retryOptions = () => setOptionsRetryKey((value) => value + 1);

  return (
    <>
      <a className="skip-link" href="#stories">Skip to news</a>
      <div className="page-shell">
        <header className="masthead">
          <a className="brand" href="/" aria-label="The Bulgarian Brief home">
            <span className="brand-mark" aria-hidden="true">Б.</span>
            <span>THE BULGARIAN<br />BRIEF</span>
          </a>
          <div className="edition">
            <span className="edition-dot" aria-hidden="true" />
            Independent sources. One reading list.
            <span className="edition-small">BULGARIA / RSS EDITION</span>
          </div>
        </header>
        <main>
          <section className="introduction" aria-labelledby="page-title">
            <p className="eyebrow">A LITTLE LESS NOISE.</p>
            <h1 id="page-title">Your window<br />into <em>Bulgaria.</em></h1>
            <p className="intro-copy">
              The latest headlines from Bulgarian publishers,
              <br className="desktop-break" /> gathered in one place. Go straight to the source.
            </p>
          </section>
          <div className="content-layout">
            <section className="feed" id="stories" aria-labelledby="feed-title" tabIndex={-1}>
              <div className="section-heading">
                <h2 id="feed-title">The latest</h2>
                <button className="text-button refresh" onClick={refresh} disabled={loading}>
                  Refresh news <span aria-hidden="true">↻</span>
                </button>
              </div>
              <NewsFilters
                filters={filters}
                sources={options.sources}
                tags={options.tags}
                onChange={setFilters}
              />
              {!loading && !error && (
                <NewStoriesNotice filters={filters} firstArticle={articles[0]} onRefresh={refresh} />
              )}
              {optionsError && (
                <div role="alert" className="notice">
                  Could not load the filters.{' '}
                  <button onClick={retryOptions} className="text-button">Retry filters</button>
                </div>
              )}
              <div aria-busy={loading || loadingMore}>
                {loading && <p role="status" className="feed-status">Gathering the headlines…</p>}
                <div className="news-grid">
                  {articles.map((article) => (
                    <NewsCard
                      key={article.id}
                      article={article}
                      tags={options.tags}
                      onTag={(tag) => setFilters({ ...filters, tag })}
                    />
                  ))}
                </div>
                {error && (
                  <div role="alert" className="notice">
                    Could not load the news. Please try again.{' '}
                    <button
                      className="retry-button"
                      onClick={articles.length ? () => void loadMore() : refresh}
                    >
                      Try again
                    </button>
                  </div>
                )}
                {!loading && !error && articles.length === 0 && (
                  <div className="feed-status">
                    <span className="empty-mark" aria-hidden="true">—</span>
                    <p>No stories match these filters.</p>
                    <p className="muted">
                      Try another topic or source. New stories appear after the next collection.
                    </p>
                  </div>
                )}
              </div>
              {nextCursor && !error && (
                <div className="pagination">
                  <button className="load-more" disabled={loadingMore} onClick={() => void loadMore()}>
                    {loadingMore ? 'Loading…' : 'Load more stories'} <span aria-hidden="true">↓</span>
                  </button>
                </div>
              )}
              {!loading && !error && articles.length > 0 && !nextCursor && (
                <p className="end-note">You’re up to date with the collected headlines.</p>
              )}
            </section>
            <aside className="reading-notes" aria-label="About this feed">
              <p className="eyebrow">THE READING ROOM</p>
              <h2>More perspective.<br />Less scrolling.</h2>
              <p>Follow a topic. Find a headline. Read the full story with the people who reported it.</p>
              <div className="aside-divider" />
              <h3>On the desk</h3>
              {options.sources.map(({ id, name }) => (
                <div className="source-row" key={id}>
                  <span>{name}</span>
                  <span className="source-badge">RSS</span>
                </div>
              ))}
              <p className="aside-small">
                We show publisher headlines and link to the original reporting.
                More sources will be added as their feeds and terms are verified.
              </p>
              <div className="aside-divider" />
              <h3>A note on topics</h3>
              <p className="aside-small">
                Topics are assigned automatically from publisher categories and text.
                Some stories may have no topic or an imperfect match.
              </p>
            </aside>
          </div>
        </main>
        <footer className="footer">
          <span>THE BULGARIAN BRIEF</span>
          <span>
            Headlines belong to their publishers. Read at the source. <span aria-hidden="true">↗</span>
            {' '}Topics adapted from <a href="https://iptc.org/standards/media-topics/" target="_blank" rel="noopener noreferrer">IPTC Media Topics</a> under{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>.
          </span>
        </footer>
      </div>
    </>
  );
}

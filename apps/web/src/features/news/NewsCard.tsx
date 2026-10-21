import { useState } from 'react';
import type { Article, Option } from './news.api';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia',
});

export function NewsCard({ article, tags, onTag }: { article: Article; tags: Option[]; onTag: (tag: string) => void }) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const { preview } = article;
  return <article className="news-card">
    <div className="article-media">
      {article.sourceId === 'telegraph'
        ? <div className="article-publisher-name" lang="bg">Телеграф</div>
        : preview && failedImageUrl !== preview.imageUrl
        ? <img className="article-photo" key={preview.imageUrl} src={preview.imageUrl}
          alt="" width="800" height="450" loading="lazy" decoding="async" referrerPolicy="no-referrer"
          onError={() => setFailedImageUrl(preview.imageUrl)} />
        : <div className="article-photo-placeholder" aria-hidden="true"><span>No preview photo</span></div>}
    </div>
    <div className="article-meta"><span className="publisher">{article.sourceName}</span></div>
    <h3 lang="bg"><a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a></h3>
    {preview && <div className="article-preview">
      {preview.author && <p className="article-author" lang="bg">Автор: {preview.author}</p>}
      {preview.excerpt && <p className="article-excerpt" lang="bg">{preview.excerpt.slice(0, 500)}</p>}
    </div>}
    <div className="tags">{article.tags.map((tag) => <button className="tag" key={tag} onClick={() => onTag(tag)} lang="bg">
      #{tags.find(({ id }) => id === tag)?.name ?? tag}
    </button>)}</div>
    <div className="card-bottom">
      <time dateTime={article.publishedAt}>{dateFormat.format(new Date(article.publishedAt))}</time>
      <a className="original-link" href={article.url} target="_blank" rel="noopener noreferrer" aria-label={`Read original: ${article.title}`}>Read original <span aria-hidden="true">↗</span></a>
    </div>
  </article>;
}

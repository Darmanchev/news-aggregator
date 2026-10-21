import { readConfig } from '../config.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database.js';
import { Article } from '../modules/articles/articles.model.js';
import { fetchArticlePreview } from '../modules/ingestion/article-metadata.client.js';
import { collectSources } from '../modules/ingestion/ingestion.service.js';
import { sources } from '../modules/sources/sources.config.js';

try {
  await connectDatabase(readConfig().mongoUri);
  const collection = await collectSources(sources);
  console.log(JSON.stringify({ collection }));
  if (collection.failed.length) process.exitCode = 1;
  const report = { checked: 0, added: 0, unavailable: 0, failed: 0 };
  const cursor = Article.find({ sourceId: { $in: sources.map(({ id }) => id) }, preview: null }).lean().cursor();
  try {
    for await (const article of cursor) {
      report.checked++;
      try {
        const preview = await fetchArticlePreview(article, {});
        if (!preview) { report.unavailable++; continue; }
        const result = await Article.updateOne({ _id: article._id, preview: null }, { $set: { preview } }, { runValidators: true });
        report.added += result.modifiedCount;
      } catch (error) {
        report.failed++;
        console.error(JSON.stringify({ sourceId: article.sourceId, articleId: article._id.toString(), error: error instanceof Error ? error.message : 'Photo lookup failed' }));
      }
      if (report.checked % 25 === 0) console.log(JSON.stringify({ photos: report }));
    }
  } finally { await cursor.close(); }
  console.log(JSON.stringify({ photos: report }));
  if (report.failed) process.exitCode = 1;
} catch (error) {
  console.error('Photo refresh failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
} finally { await disconnectDatabase(); }

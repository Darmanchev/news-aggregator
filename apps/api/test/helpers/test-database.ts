import mongoose from 'mongoose';

export async function connectTestDatabase(database = 'bulgarian_news_test') {
  const uri = process.env.TEST_MONGODB_URI ?? `mongodb://127.0.0.1:27018/${database}`;
  const dbName = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/(bulgarian_news_test|bulgarian_news_alerts_test)(?:\?.*)?$/)?.[1];
  if (!dbName) throw new Error('Use a dedicated test database: bulgarian_news_test or bulgarian_news_alerts_test.');
  return mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
}

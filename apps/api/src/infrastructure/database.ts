import mongoose from 'mongoose';
import { Article } from '../modules/articles/articles.model.js';

export async function connectDatabase(uri: string) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await Article.init();
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

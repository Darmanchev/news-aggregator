import { Schema, model } from 'mongoose';

export interface ArticleInput {
  sourceId: string;
  externalId: string;
  title: string;
  url: string;
  publishedAt: Date;
  tags: string[];
  preview?: { imageUrl: string; author: string; excerpt: string } | null;
}

const articleSchema = new Schema<ArticleInput & { firstSeenAt: Date }>({
  sourceId: { type: String, required: true },
  externalId: { type: String, required: true, maxlength: 2048 },
  title: { type: String, required: true, maxlength: 500 },
  url: { type: String, required: true, maxlength: 2048 },
  publishedAt: { type: Date, required: true },
  firstSeenAt: { type: Date, required: true },
  tags: [{ type: String }],
  preview: { type: new Schema({
    imageUrl: { type: String, required: true, maxlength: 2048 },
    author: { type: String, required: true, maxlength: 200 },
    excerpt: { type: String, required: true, maxlength: 500 },
  }, { _id: false }), default: null },
}, { versionKey: false, bufferCommands: false });

articleSchema.index({ sourceId: 1, externalId: 1 }, { unique: true });
articleSchema.index({ publishedAt: -1, _id: -1 });

export const Article = model('Article', articleSchema);

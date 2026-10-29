import { Schema, model } from 'mongoose';

export interface TagClassification { version: string; inputHash: string; tags: string[] }

export interface ArticleInput {
  sourceId: string;
  externalId: string;
  title: string;
  url: string;
  publishedAt: Date;
  tags: string[];
  classification?: TagClassification;
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
  classification: { type: new Schema({
    version: { type: String, required: true, maxlength: 128 },
    inputHash: { type: String, required: true, maxlength: 64 },
    tags: [{ type: String }],
  }, { _id: false }), default: undefined },
  preview: { type: new Schema({
    imageUrl: { type: String, required: true, maxlength: 2048 },
    author: { type: String, default: '', maxlength: 200 },
    excerpt: { type: String, default: '', maxlength: 500 },
  }, { _id: false }), default: null },
}, { versionKey: false, bufferCommands: false });

articleSchema.index({ sourceId: 1, externalId: 1 }, { unique: true });
articleSchema.index({ publishedAt: -1, _id: -1 });

export const Article = model('Article', articleSchema);

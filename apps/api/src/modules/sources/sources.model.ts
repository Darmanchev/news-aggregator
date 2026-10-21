import { Schema, model } from 'mongoose';

const sourceStatusSchema = new Schema({
  _id: { type: String, required: true },
  lastAttemptAt: { type: Date, required: true },
  lastSuccessAt: { type: Date, default: null },
  firstFailureAt: { type: Date, default: null },
  lastAlertAt: { type: Date, default: null },
}, { versionKey: false, bufferCommands: false });

export const SourceStatus = model('SourceStatus', sourceStatusSchema);

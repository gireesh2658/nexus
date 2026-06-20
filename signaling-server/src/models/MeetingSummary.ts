import mongoose, { Schema, Document } from 'mongoose';

export interface IMeetingSummary extends Document {
  meetingId: mongoose.Types.ObjectId;
  summary: string;
  actionItems: Array<{ task: string; owner: string; deadline: string }>;
  decisions: string[];
  followUpEmail: string;
  generatedAt: Date;
}

const meetingSummarySchema = new Schema({
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true, unique: true },
  summary: { type: String, required: true },
  actionItems: [{
    task: String,
    owner: String,
    deadline: String
  }],
  decisions: [String],
  followUpEmail: String,
  generatedAt: { type: Date, default: Date.now }
});

export default mongoose.model<IMeetingSummary>('MeetingSummary', meetingSummarySchema);

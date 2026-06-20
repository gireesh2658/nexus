import mongoose, { Schema, Document } from 'mongoose';

export interface ITranscriptSegment extends Document {
  meetingId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userName: string;
  text: string;
  isInterim: boolean;
  startTime: Date;
  endTime?: Date;
}

const transcriptSegmentSchema = new Schema({
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  text: { type: String, required: true },
  isInterim: { type: Boolean, default: false },
  startTime: { type: Date, required: true, default: Date.now },
  endTime: { type: Date }
});

// Index for fast retrieval by meeting
transcriptSegmentSchema.index({ meetingId: 1, startTime: 1 });

export default mongoose.model<ITranscriptSegment>('TranscriptSegment', transcriptSegmentSchema);

import mongoose, { Schema, Document } from 'mongoose';

export interface IParticipant extends Document {
  meetingId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  status: 'pending' | 'accepted' | 'declined' | 'removed' | 'no_show';
  consentGiven: boolean;
  consentTimestamp: Date | null;
  invitedAt: Date;
  joinedAt: Date | null;
  leftAt: Date | null;
  avgFocusScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const ParticipantSchema = new Schema<IParticipant>({
  meetingId:        { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
  userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status:           { type: String, enum: ['pending', 'accepted', 'declined', 'removed', 'no_show'], default: 'pending' },
  consentGiven:     { type: Boolean, default: false },
  consentTimestamp:  { type: Date, default: null },
  invitedAt:        { type: Date, default: Date.now },
  joinedAt:         { type: Date, default: null },
  leftAt:           { type: Date, default: null },
  avgFocusScore:    { type: Number, default: null },
}, { timestamps: true });

ParticipantSchema.index({ meetingId: 1, userId: 1 }, { unique: true });
ParticipantSchema.index({ userId: 1 });
ParticipantSchema.index({ meetingId: 1, status: 1 });

export default mongoose.model<IParticipant>('Participant', ParticipantSchema);

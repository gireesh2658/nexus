import mongoose, { Schema, Document } from 'mongoose';

export interface IMeeting extends Document {
  title: string;
  description: string;
  hostId: mongoose.Types.ObjectId;
  participantUsernames: string[];
  scheduledAt: Date;
  status: 'scheduled' | 'active' | 'ended' | 'cancelled';
  scheduledDurationMins: number;
  actualDurationSecs: number | null;
  analyticsEnabled: boolean;
  moderationEnabled: boolean;
  roomCode: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

const MeetingSchema = new Schema<IMeeting>({
  title:                 { type: String, required: true },
  description:           { type: String, default: '' },
  hostId:                { type: Schema.Types.ObjectId, ref: 'User', required: true },
  participantUsernames:  [{ type: String }],
  scheduledAt:           { type: Date, required: true },
  status:                { type: String, enum: ['scheduled', 'active', 'ended', 'cancelled'], default: 'scheduled' },
  scheduledDurationMins: { type: Number, required: true },
  actualDurationSecs:    { type: Number, default: null },
  analyticsEnabled:      { type: Boolean, default: true },
  moderationEnabled:     { type: Boolean, default: true },
  roomCode:              { type: String, unique: true },
  startedAt:             { type: Date },
  endedAt:               { type: Date },
}, { timestamps: true });

MeetingSchema.index({ hostId: 1 });
MeetingSchema.index({ status: 1 });
MeetingSchema.index({ scheduledAt: 1 });


export default mongoose.model<IMeeting>('Meeting', MeetingSchema);

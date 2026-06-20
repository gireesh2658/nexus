import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  username: string;
  email: string;
  password: string;
  role: 'host' | 'participant' | 'admin';
  avatarColor: string;
  isActive: boolean;
  warnings: number;
  lastSeen?: Date;
  aiPreferences: {
    focusDetection: boolean;
    transcription: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  name:        { type: String, required: true, trim: true },
  username:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true },
  password:    { type: String, required: true },   // bcrypt hash cost 12
  role:        { type: String, enum: ['host', 'participant', 'admin'], default: 'participant' },
  avatarColor: { type: String, default: '#6C5CE7' },
  isActive:    { type: Boolean, default: true },
  warnings:    { type: Number, default: 0 },
  lastSeen:    { type: Date },
  aiPreferences: {
    focusDetection: { type: Boolean, default: true },
    transcription: { type: Boolean, default: true }
  }
}, { timestamps: true });



export default mongoose.model<IUser>('User', UserSchema);

export interface User {
  _id: string;
  name: string;
  username: string;
  email: string;
  role: 'host' | 'participant' | 'admin';
  avatarColor: string;
  aiPreferences?: {
    focusDetection: boolean;
    transcription: boolean;
  };
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface Meeting {
  _id: string;
  title: string;
  description: string;
  hostId: User;
  participantUsernames: string[];
  scheduledAt: string;
  status: 'scheduled' | 'active' | 'ended' | 'cancelled';
  scheduledDurationMins: number;
  analyticsEnabled: boolean;
  moderationEnabled: boolean;
  roomCode: string;
  createdAt: string;
}

export interface Participant {
  _id: string;
  meetingId: string;
  userId: User;
  status: 'pending' | 'accepted' | 'declined' | 'removed' | 'no_show';
  consentGiven: boolean;
  joinedAt: string | null;
}

export interface User {
  id: string;
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
  id: string;
  title: string;
  description?: string;
  hostId: string;
  host?: {
    name: string;
    username: string;
    avatarColor?: string;
  };
  participantUsernames?: string[];
  scheduledAt: string;
  status: 'waiting' | 'scheduled' | 'active' | 'ended' | 'cancelled' | 'expired';
  scheduledDurationMins?: number;
  actualStartTime?: string;
  actualEndTime?: string;
  actualDurationSecs?: number;
  analyticsEnabled: boolean;
  moderationEnabled: boolean;
  roomCode: string;
  createdAt: string;
}

export interface MeetingsResponse {
  hosted: Meeting[];
  invited: Meeting[];
  upcoming: Meeting[];
  history: Meeting[];
  active: Meeting[];
  total: {
    hosted: number;
    invited: number;
    upcoming: number;
    history: number;
    active: number;
  };
}

export interface Participant {
  id: string;
  meetingId: string;
  userId: string;
  user?: {
    name: string;
    username: string;
    avatarColor?: string;
    role: string;
  };
  status: 'pending' | 'accepted' | 'declined' | 'removed' | 'no_show';
  consentGiven: boolean;
  joinTime?: string;
  joinedAt?: string | null;
  leaveTime?: string | null;
}

export interface MeetingSummary {
  id: string;
  meetingId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RETRYABLE';
  summaryText?: string | null;
  decisions: string[];
  actionItems: { task: string; owner: string; deadline: string }[];
  followUpEmail?: string | null;
  modelUsed?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  createdAt: string;
}

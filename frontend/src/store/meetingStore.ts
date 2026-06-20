import { create } from 'zustand';
import type { Meeting } from '../types';

interface PeerParticipant {
  userId: string;
  username: string;
  name: string;
  avatarColor: string;
  stream?: MediaStream;
  focusScore?: number;
}

interface MeetingState {
  currentMeeting: Meeting | null;
  activeParticipants: Record<string, PeerParticipant>;
  roomScores: Record<string, number>;
  isMicMuted: boolean;
  isCameraOff: boolean;
  liveSubtitles: Record<string, string>;
  activePanel: 'chat' | 'whiteboard' | 'participants' | 'transcript' | 'intelligence' | 'none';
  
  setCurrentMeeting: (meeting: Meeting | null) => void;
  addParticipant: (p: PeerParticipant) => void;
  removeParticipant: (userId: string) => void;
  setParticipantStream: (userId: string, stream: MediaStream) => void;
  updateScores: (scores: Record<string, number>) => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  setLiveSubtitle: (userId: string, text: string) => void;
  clearLiveSubtitle: (userId: string) => void;
  setActivePanel: (panel: 'chat' | 'whiteboard' | 'participants' | 'transcript' | 'intelligence' | 'none') => void;
  clearMeeting: () => void;
}

export const useMeetingStore = create<MeetingState>((set) => ({
  currentMeeting: null,
  activeParticipants: {},
  roomScores: {},
  isMicMuted: false,
  isCameraOff: false,
  liveSubtitles: {},
  activePanel: 'none',

  setActivePanel: (panel) => set((state) => ({ activePanel: state.activePanel === panel ? 'none' : panel })),
  setCurrentMeeting: (meeting) => set({ currentMeeting: meeting }),
  
  addParticipant: (p) => set((state) => ({
    activeParticipants: { ...state.activeParticipants, [p.userId]: { ...state.activeParticipants[p.userId], ...p } }
  })),
  
  removeParticipant: (userId) => set((state) => {
    const updated = { ...state.activeParticipants };
    delete updated[userId];
    return { activeParticipants: updated };
  }),

  setParticipantStream: (userId, stream) => set((state) => ({
    activeParticipants: { 
      ...state.activeParticipants, 
      [userId]: { ...state.activeParticipants[userId], stream } 
    }
  })),

  updateScores: (scores) => set((state) => {
    const updatedParticipants = { ...state.activeParticipants };
    Object.entries(scores).forEach(([userId, score]) => {
      if (updatedParticipants[userId]) {
        updatedParticipants[userId].focusScore = score;
      }
    });
    return { roomScores: scores, activeParticipants: updatedParticipants };
  }),

  toggleMic: () => set((state) => ({ isMicMuted: !state.isMicMuted })),
  toggleCamera: () => set((state) => ({ isCameraOff: !state.isCameraOff })),

  setLiveSubtitle: (userId, text) => set((state) => ({
    liveSubtitles: { ...state.liveSubtitles, [userId]: text }
  })),

  clearLiveSubtitle: (userId) => set((state) => {
    const updated = { ...state.liveSubtitles };
    delete updated[userId];
    return { liveSubtitles: updated };
  }),

  clearMeeting: () => set({ currentMeeting: null, activeParticipants: {}, roomScores: {}, liveSubtitles: {}, isMicMuted: false, isCameraOff: false })
}));

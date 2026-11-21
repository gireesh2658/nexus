import api from './api';
import type { Meeting, Participant, MeetingsResponse } from '../types';

export const meetingService = {
  createMeeting: async (data: { title: string, participantUsernames: string[], scheduledAt: string, scheduledDurationMins: number, description?: string }): Promise<{ meeting: Meeting }> => {
    const res = await api.post('/meetings', data);
    return res.data;
  },

  getMyMeetings: async (filter?: 'upcoming' | 'active' | 'history' | 'all'): Promise<MeetingsResponse> => {
    const params = filter ? { filter } : {};
    const res = await api.get('/meetings', { params });
    return res.data;
  },

  getMeetingById: async (id: string): Promise<{ meeting: Meeting, participants: Participant[] }> => {
    const res = await api.get(`/meetings/${id}`);
    return res.data;
  },

  getMeetingByRoomCode: async (roomCode: string): Promise<{ meeting: Meeting, participants: Participant[] }> => {
    const res = await api.get(`/meetings/room/${roomCode}`);
    return res.data;
  },

  updateStatus: async (id: string, status: string): Promise<{ meeting: Meeting }> => {
    const res = await api.patch(`/meetings/${id}/status`, { status });
    return res.data;
  },

  cancelMeeting: async (id: string): Promise<{ message: string, meeting: Meeting }> => {
    const res = await api.post(`/meetings/${id}/cancel`);
    return res.data;
  },

  endMeeting: async (id: string): Promise<{ message: string, summaryId?: string, meetingId: string }> => {
    const res = await api.post(`/meetings/${id}/end`);
    return res.data;
  },

  getMeetingSummary: async (id: string): Promise<any> => {
    const res = await api.get(`/meetings/${id}/summary`);
    return res.data;
  },

  respondToInvite: async (id: string, response: 'accepted' | 'declined'): Promise<{ participant: Participant }> => {
    const res = await api.post(`/meetings/${id}/respond`, { response });
    return res.data;
  },

  giveConsent: async (id: string): Promise<{ participant: Participant }> => {
    const res = await api.post(`/meetings/${id}/consent`);
    return res.data;
  }
};

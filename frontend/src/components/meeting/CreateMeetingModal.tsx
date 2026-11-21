import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Clock, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

interface CreateMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    participantUsernames: string[];
    scheduledAt: string;
    scheduledDurationMins: number;
    description?: string;
  }) => Promise<void>;
}

export const CreateMeetingModal: React.FC<CreateMeetingModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [meetingType, setMeetingType] = useState<'instant' | 'scheduled'>('instant');
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState('');
  const [durationMins, setDurationMins] = useState(60);

  // Default scheduled time: next nearest 15-minute slot in local timezone
  const getInitialScheduledTime = () => {
    const now = new Date();
    now.setMinutes(Math.ceil((now.getMinutes() + 5) / 15) * 15, 0, 0);
    // Format to YYYY-MM-DDTHH:mm for datetime-local input
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const [scheduledDateTime, setScheduledDateTime] = useState(getInitialScheduledTime());
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; participants?: string; scheduledDateTime?: string }>({});

  // Minimum allowed datetime for picker: current time in local format
  const getMinDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleClose = () => {
    if (isLoading) return;
    setTitle('');
    setParticipants('');
    setErrors({});
    setMeetingType('instant');
    setScheduledDateTime(getInitialScheduledTime());
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: typeof errors = {};
    if (!title.trim()) newErrors.title = 'Meeting title is required';
    if (!participants.trim()) newErrors.participants = 'At least one participant username is required';

    let scheduledIso: string;
    if (meetingType === 'instant') {
      scheduledIso = new Date().toISOString();
    } else {
      if (!scheduledDateTime) {
        newErrors.scheduledDateTime = 'Scheduled date and time are required';
      } else {
        const scheduledTime = new Date(scheduledDateTime).getTime();
        if (isNaN(scheduledTime)) {
          newErrors.scheduledDateTime = 'Invalid date and time format';
        } else if (scheduledTime < Date.now() - 60000) {
          // Reject if scheduled in the past by more than 1 minute
          newErrors.scheduledDateTime = 'Cannot schedule a meeting in the past';
        }
      }
      scheduledIso = new Date(scheduledDateTime).toISOString();
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const usernames = participants.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    
    try {
      setIsLoading(true);
      setErrors({});
      await onSubmit({
        title: title.trim(),
        participantUsernames: usernames,
        scheduledAt: scheduledIso,
        scheduledDurationMins: durationMins,
      });
      handleClose();
    } catch (err: any) {
      const apiError = err.response?.data?.error || err.message || 'Failed to create meeting';
      toast.error(apiError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Meeting">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Meeting Type Selector */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-xl border border-nexus-border">
          <button
            type="button"
            onClick={() => setMeetingType('instant')}
            className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              meetingType === 'instant'
                ? 'bg-nexus-primary text-white shadow-sm'
                : 'text-nexus-muted hover:text-white hover:bg-white/5'
            }`}
          >
            Start Instant
          </button>
          <button
            type="button"
            onClick={() => setMeetingType('scheduled')}
            className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              meetingType === 'scheduled'
                ? 'bg-nexus-primary text-white shadow-sm'
                : 'text-nexus-muted hover:text-white hover:bg-white/5'
            }`}
          >
            Schedule for Later
          </button>
        </div>

        <Input 
          label="Meeting Title" 
          placeholder="e.g. Q3 Roadmap Planning" 
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          autoFocus
          disabled={isLoading}
        />
        
        <Input 
          label="Invite Participants" 
          placeholder="Enter usernames separated by commas (e.g. alice, bob)"
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          error={errors.participants}
          disabled={isLoading}
        />

        {meetingType === 'scheduled' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-nexus-text flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-nexus-primary" /> Date & Time
            </label>
            <input
              type="datetime-local"
              value={scheduledDateTime}
              min={getMinDateTime()}
              onChange={(e) => setScheduledDateTime(e.target.value)}
              disabled={isLoading}
              className="w-full bg-black/40 border border-nexus-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-nexus-primary focus:ring-1 focus:ring-nexus-primary transition-all [color-scheme:dark]"
            />
            {errors.scheduledDateTime && (
              <span className="text-xs text-nexus-danger mt-0.5">{errors.scheduledDateTime}</span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-nexus-text flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-nexus-muted" /> Duration
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[15, 30, 45, 60].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setDurationMins(mins)}
                disabled={isLoading}
                className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                  durationMins === mins
                    ? 'bg-nexus-primary/20 text-nexus-primary border-nexus-primary/40 font-semibold'
                    : 'bg-white/5 text-nexus-muted border-white/5 hover:bg-white/10 hover:text-white'
                }`}
              >
                {mins}m
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-4">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={isLoading}>
            {meetingType === 'instant' ? 'Start Meeting' : 'Schedule Meeting'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

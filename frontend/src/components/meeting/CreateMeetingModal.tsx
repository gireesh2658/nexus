import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import toast from 'react-hot-toast';

interface CreateMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, participantUsernames: string[]) => Promise<void>;
}

export const CreateMeetingModal: React.FC<CreateMeetingModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{title?: string, participants?: string}>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: typeof errors = {};
    if (!title.trim()) newErrors.title = 'Meeting title is required';
    if (!participants.trim()) newErrors.participants = 'At least one participant is required';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const usernames = participants.split(',').map(s => s.trim()).filter(Boolean);
    
    try {
      setIsLoading(true);
      setErrors({});
      await onSubmit(title.trim(), usernames);
      setTitle('');
      setParticipants('');
      onClose();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to create meeting');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Meeting">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input 
          label="Meeting Title" 
          placeholder="e.g. Q3 Roadmap Planning" 
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          autoFocus
        />
        
        <Input 
          label="Invite Participants" 
          placeholder="Enter usernames separated by commas" 
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          error={errors.participants}
        />

        <div className="flex gap-3 justify-end mt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Create Meeting
          </Button>
        </div>
      </form>
    </Modal>
  );
};

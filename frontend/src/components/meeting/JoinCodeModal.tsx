import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { meetingService } from '../../services/meetingService';
import toast from 'react-hot-toast';

interface JoinCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JoinCodeModal: React.FC<JoinCodeModalProps> = ({ isOpen, onClose }) => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const navigate = useNavigate();

  const handleClose = () => {
    setCode('');
    setError(undefined);
    setIsLoading(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setError('Please enter a room code');
      return;
    }

    if (trimmedCode.length < 4) {
      setError('Room code must be at least 4 characters');
      return;
    }

    setError(undefined);
    setIsLoading(true);

    try {
      const res = await meetingService.getMeetingByRoomCode(trimmedCode);
      const meeting = res.meeting;

      if (!meeting) {
        setError('Meeting not found. Please verify the code.');
        return;
      }

      if (meeting.status === 'expired') {
        setError('This meeting has expired and can no longer be joined.');
        return;
      }

      if (meeting.status === 'cancelled') {
        setError('This meeting has been cancelled.');
        return;
      }

      if (meeting.status === 'ended') {
        toast('This meeting has ended. Viewing meeting summary.');
        handleClose();
        navigate(`/meeting/${meeting.id}/summary`);
        return;
      }

      // Meeting is valid, active, waiting, or scheduled
      toast.success('Entering meeting lobby...');
      handleClose();
      navigate(`/lobby/${meeting.roomCode}`);
    } catch (err: any) {
      const status = err.response?.status;
      const apiError = err.response?.data?.error;

      if (status === 404) {
        setError('Meeting not found. Please check the code.');
      } else if (status === 403) {
        setError('You are not authorized or invited to join this meeting.');
      } else if (status === 410) {
        setError('This meeting has expired or ended.');
      } else {
        setError(apiError || 'Failed to join meeting. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Join with Code">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-nexus-muted">
          Enter the room code provided by the meeting host to access the lobby.
        </p>

        <Input 
          label="Room Code" 
          placeholder="e.g. sobRvY-oLsaN" 
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError(undefined);
          }}
          error={error}
          autoFocus
          disabled={isLoading}
        />

        <div className="flex gap-3 justify-end mt-4">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={isLoading || !code.trim()}>
            Join Meeting
          </Button>
        </div>
      </form>
    </Modal>
  );
};

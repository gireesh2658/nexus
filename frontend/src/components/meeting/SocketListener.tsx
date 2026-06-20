import { useEffect } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { socketService } from '../../services/socket';
import toast from 'react-hot-toast';

const SocketListener = () => {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleForceMute = () => {
      localParticipant.setMicrophoneEnabled(false);
      toast.error('The host has muted your microphone.', { id: 'force-mute' });
    };

    const handleMeetingLocked = () => {
      toast('The host has locked the meeting.', { icon: '🔒', id: 'lock' });
    };

    socket.on('force-mute', handleForceMute);
    socket.on('meeting-locked', handleMeetingLocked);

    return () => {
      socket.off('force-mute', handleForceMute);
      socket.off('meeting-locked', handleMeetingLocked);
    };
  }, [localParticipant]);

  return null; // This is a logic-only component
};

export default SocketListener;

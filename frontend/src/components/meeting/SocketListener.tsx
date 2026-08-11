import { useEffect } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { socketService } from '../../services/socket';
import toast from 'react-hot-toast';
import { useMeetingStore } from '../../store/meetingStore';
import { useNavigate } from 'react-router-dom';

const SocketListener = () => {
  const { localParticipant } = useLocalParticipant();
  const { addParticipant, removeParticipant } = useMeetingStore();
  const navigate = useNavigate();

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleForceMute = (data: { preventUnmute?: boolean }) => {
      localParticipant.setMicrophoneEnabled(false);
      if (data.preventUnmute) {
        toast.error('The host has muted your microphone and prevented unmuting.', { id: 'force-mute-prevent' });
      } else {
        toast.error('The host has muted your microphone.', { id: 'force-mute' });
      }
    };

    const handleMeetingLocked = () => {
      toast('The host has locked the meeting.', { icon: '🔒', id: 'lock' });
    };

    const handleUserJoined = (data: { participants?: Array<{userId: string, username: string, name: string, avatarColor: string, joinedAt: string}>, userId: string, name?: string }) => {
       // Sync participants list to store
       if (data.participants) {
         data.participants.forEach((p) => {
           addParticipant({
             userId: p.userId,
             username: p.username,
             name: p.name,
             avatarColor: p.avatarColor,
             joinedAt: new Date(p.joinedAt)
           });
         });
       }
       if (data.userId !== localParticipant.identity) {
         toast.success(`${data.name || 'A user'} joined the meeting.`);
       }
    };

    const handleUserLeft = (data: { userId: string, username?: string }) => {
       removeParticipant(data.userId);
       toast(`${data.username || 'A user'} left the meeting.`, { icon: '👋' });
    };

    const handleForceRemove = () => {
       toast.error('You have been removed from the meeting by the host.');
       navigate('/dashboard');
    };

    const handleParticipantWaiting = (data: { name: string }) => {
       toast(`${data.name} is waiting to join.`, { icon: '👀', duration: 5000 });
       // Could dispatch an event to the store to show waiting room badge
    };

    socket.on('force-mute', handleForceMute);
    socket.on('meeting-locked-state', handleMeetingLocked);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('force-remove', handleForceRemove);
    socket.on('participant-waiting', handleParticipantWaiting);

    return () => {
      socket.off('force-mute', handleForceMute);
      socket.off('meeting-locked-state', handleMeetingLocked);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('force-remove', handleForceRemove);
      socket.off('participant-waiting', handleParticipantWaiting);
    };
  }, [localParticipant, addParticipant, removeParticipant, navigate]);

  return null;
};

export default SocketListener;

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Video, Calendar, Clock, Users, Keyboard } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { meetingService } from '../services/meetingService';
import type { Meeting } from '../types';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/Button';
import { CreateMeetingModal } from '../components/meeting/CreateMeetingModal';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const Dashboard = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [hostedMeetings, setHostedMeetings] = useState<Meeting[]>([]);
  const [invitedMeetings, setInvitedMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchMeetings = async () => {
    try {
      const data = await meetingService.getMyMeetings();
      setHostedMeetings(data.hosted);
      setInvitedMeetings(data.invited);
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to load meetings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMeetings();
  }, []);

  const handleCreateMeeting = async (title: string, usernames: string[]) => {
    const data = {
      title,
      participantUsernames: usernames,
      scheduledAt: new Date().toISOString(),
      scheduledDurationMins: 60,
    };
    await meetingService.createMeeting(data);
    toast.success('Meeting created successfully');
    fetchMeetings();
  };

  const handleJoin = (roomId: string) => {
    navigate(`/lobby/${roomId}`);
  };

  const allMeetings = [...hostedMeetings, ...invitedMeetings].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 30 } }
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <motion.div 
      className="w-full relative"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Header — Calm greeting */}
      <motion.div variants={itemVariants} className="mb-10">
        <h1 className="text-2xl font-semibold font-display tracking-tight mb-1">
          {getGreeting()}, {user?.name}
        </h1>
        <p className="text-nexus-muted text-body">{today}</p>
      </motion.div>

      {/* Action Row */}
      <motion.div variants={itemVariants} className="flex items-center gap-3 mb-10">
        <Button 
          onClick={() => setIsModalOpen(true)}
        >
          <Plus className="w-4 h-4" />
          New meeting
        </Button>
        <Button 
          variant="secondary"
          onClick={() => {}}
        >
          <Keyboard className="w-4 h-4" />
          Join with code
        </Button>
      </motion.div>

      {/* Schedule Section */}
      <motion.div variants={itemVariants}>
        <h2 className="text-label-sm text-nexus-muted uppercase tracking-wider mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Today's schedule
        </h2>
        
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-36 bg-nexus-surface rounded-card animate-pulse" />)}
          </div>
        ) : allMeetings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {allMeetings.map((meeting, idx) => (
              <MeetingCard 
                key={meeting._id} 
                meeting={meeting} 
                onJoin={() => handleJoin(meeting.roomCode)} 
                isHost={(meeting.hostId as unknown as { _id: string })?._id === user?._id || (meeting.hostId as unknown as string) === user?._id}
                delay={idx * 0.05}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Video className="w-10 h-10 text-nexus-muted mb-4 opacity-30" />
            <p className="text-nexus-muted text-body mb-1">Nothing on the calendar yet.</p>
            <p className="text-nexus-muted/60 text-sm mb-6">Schedule a meeting to get your team together.</p>
            <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Meeting
            </Button>
          </div>
        )}
      </motion.div>

      <CreateMeetingModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateMeeting}
      />
    </motion.div>
  );
};

const MeetingCard = ({ meeting, onJoin, isHost, delay }: { meeting: Meeting, onJoin: () => void, isHost: boolean, delay: number }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const date = new Date(meeting.scheduledAt);
  const isNow = Math.abs(date.getTime() - now) < 15 * 60 * 1000 || meeting.status === 'active';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 400, damping: 30 }}
      className={`bg-nexus-surface rounded-card p-5 border border-transparent hover:border-nexus-borderHover transition-all duration-200 cursor-pointer group ${isNow ? 'border-nexus-primary/30' : ''}`}
      onClick={onJoin}
    >
      {/* Time */}
      <p className="text-label text-nexus-text font-display mb-1">
        {date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
      </p>
      
      {/* Title */}
      <h3 className="text-body font-medium text-nexus-text mb-3">
        {meeting.title}
        {isNow && (
          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-nexus-danger/15 text-nexus-danger border border-nexus-danger/20">
            <span className="w-1.5 h-1.5 rounded-full bg-nexus-danger animate-pulse-soft" />
            LIVE
          </span>
        )}
      </h3>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-nexus-muted">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {meeting.scheduledDurationMins}m</span>
        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {isHost ? meeting.participantUsernames.length : 'Invited'}</span>
      </div>

      {/* Stacked Avatars placeholder */}
      <div className="flex -space-x-2 mt-3">
        {(meeting.participantUsernames || []).slice(0, 3).map((_, i) => (
          <div key={i} className="w-7 h-7 rounded-full bg-nexus-bg border-2 border-nexus-surface flex items-center justify-center text-[10px] font-medium text-nexus-muted">
            {String.fromCharCode(65 + i)}
          </div>
        ))}
        {(meeting.participantUsernames?.length || 0) > 3 && (
          <div className="w-7 h-7 rounded-full bg-nexus-bg border-2 border-nexus-surface flex items-center justify-center text-[10px] font-medium text-nexus-muted">
            +{meeting.participantUsernames.length - 3}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default Dashboard;

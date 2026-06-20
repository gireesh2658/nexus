import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Video, Calendar, Clock, Users } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { meetingService } from '../services/meetingService';
import type { Meeting } from '../types';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/Button';
import { CreateMeetingModal } from '../components/meeting/CreateMeetingModal';

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
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      className="w-full relative"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2 tracking-tight">
            Welcome back, <span className="text-gradient-primary">{user?.name}</span>
          </h1>
          <p className="text-nexus-muted text-lg">Here's what's happening in your workspace today.</p>
        </div>
        
        <Button 
          onClick={() => setIsModalOpen(true)}
          className="shadow-glow-primary hover:scale-105 transition-transform"
        >
          <Plus className="w-5 h-5" />
          Create Meeting
        </Button>
      </motion.div>

      {/* Main Feed: Upcoming Meetings */}
      <motion.div variants={itemVariants}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-nexus-primary" /> Your Meetings
          </h2>
        </div>
        
        <div className="space-y-4">
          {isLoading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white/5 rounded-2xl" />)}
            </div>
          ) : allMeetings.length > 0 ? (
            allMeetings.map((meeting, idx) => (
              <MeetingCard 
                key={meeting._id} 
                meeting={meeting} 
                onJoin={() => handleJoin(meeting.roomCode)} 
                isHost={(meeting.hostId as unknown as { _id: string })?._id === user?._id || (meeting.hostId as unknown as string) === user?._id}
                delay={idx * 0.1}
              />
            ))
          ) : (
            <div className="glass-panel p-10 rounded-2xl flex flex-col items-center justify-center text-center border-dashed border-2 border-nexus-border">
              <Video className="w-12 h-12 text-nexus-muted mb-4 opacity-50" />
              <h3 className="text-xl font-bold mb-2">No Scheduled Meetings</h3>
              <p className="text-nexus-muted mb-6">You have a clear schedule. Take a break or schedule a new meeting.</p>
              <Button variant="secondary" onClick={() => setIsModalOpen(true)}>Create Meeting</Button>
            </div>
          )}
        </div>
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
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 24 }}
      className={`glass-panel p-6 rounded-2xl transition-all border ${isNow ? 'border-nexus-primary/50 shadow-glow-primary' : ''}`}
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center border ${isNow ? 'bg-nexus-primary/20 border-nexus-primary/50 text-nexus-purple' : 'bg-white/5 border-white/10 text-nexus-muted'}`}>
            <span className="text-sm font-bold">{date.toLocaleDateString('en-US', { month: 'short' })}</span>
            <span className="text-lg font-bold leading-none">{date.getDate()}</span>
          </div>
          
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-xl font-bold">{meeting.title}</h3>
              {isNow && <span className="px-2 py-0.5 rounded text-xs font-bold bg-nexus-danger/20 text-nexus-danger border border-nexus-danger/30 animate-pulse-glow">LIVE NOW</span>}
            </div>
            <p className="text-sm text-nexus-muted flex items-center gap-4">
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ({meeting.scheduledDurationMins}m)</span>
              <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {isHost ? `${meeting.participantUsernames.length} invited` : `Host: ${meeting.hostId?.name || 'Unknown'}`}</span>
            </p>
          </div>
        </div>

        <div className="w-full sm:w-auto">
          <Button 
            onClick={onJoin}
            variant={isNow ? 'primary' : 'secondary'}
            className={`w-full sm:w-auto ${isNow ? 'bg-nexus-success text-black hover:bg-green-500 shadow-[0_0_15px_rgba(0,230,118,0.4)] focus:ring-nexus-success' : ''}`}
          >
            {isNow ? 'Join Now' : 'Enter Lobby'}
          </Button>
        </div>
        
      </div>
    </motion.div>
  );
};

export default Dashboard;

import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shield, CheckCircle, Video, Mic, MicOff, VideoOff, ArrowRight, Brain } from 'lucide-react';
import { meetingService } from '../services/meetingService';
import type { Meeting } from '../types';
import toast from 'react-hot-toast';
import { useMeetingStore } from '../store/meetingStore';

const MeetingLobby = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasConsent, setHasConsent] = useState(false);
  const [isConsentGiven, setIsConsentGiven] = useState(false); // Track if API call was made
  
  const { isMicMuted, isCameraOff, toggleMic, toggleCamera } = useMeetingStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const initPreview = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error(err);
      toast.error('Camera/Microphone access denied');
    }
  };

  const fetchMeeting = async () => {
    try {
      if (!roomId) return;
      const data = await meetingService.getMeetingByRoomCode(roomId);
      setMeeting(data.meeting);
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to fetch meeting');
      navigate('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMeeting();
    initPreview();
    return () => {
      localStream?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !isMicMuted);
      localStream.getVideoTracks().forEach(track => track.enabled = !isCameraOff);
    }
  }, [isMicMuted, isCameraOff, localStream]);

  const handleJoin = async () => {
    if (!meeting) return;
    
    if (meeting.analyticsEnabled && !isConsentGiven) {
      try {
        await meetingService.giveConsent(meeting._id);
        setIsConsentGiven(true);
      } catch (err) {
        console.error(err);
        return toast.error('Failed to record consent');
      }
    }

    // Stop local preview stream to free device for actual meeting room
    localStream?.getTracks().forEach(t => t.stop());
    navigate(`/room/${roomId}`);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-nexus-bg flex items-center justify-center">Loading...</div>;
  }

  if (!meeting) return null;

  return (
    <div className="min-h-screen bg-nexus-bg text-nexus-text flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] rounded-full bg-nexus-primary opacity-10 blur-[120px] pointer-events-none" />

      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 z-10">
        
        {/* Left Side: Preview */}
        <div className="flex flex-col gap-4">
          <div className="aspect-video bg-black/60 rounded-3xl overflow-hidden border border-white/10 relative shadow-2xl">
            {isCameraOff ? (
              <div className="absolute inset-0 flex items-center justify-center text-nexus-muted">
                <VideoOff className="w-16 h-16 opacity-50" />
              </div>
            ) : (
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover scale-x-[-1]"
              />
            )}
            
            {/* Controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 p-2 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10">
              <button 
                onClick={toggleMic}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isMicMuted ? 'bg-red-500/80 text-white' : 'bg-white/10 hover:bg-white/20'}`}
              >
                {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button 
                onClick={toggleCamera}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isCameraOff ? 'bg-red-500/80 text-white' : 'bg-white/10 hover:bg-white/20'}`}
              >
                {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Details & Consent */}
        <div className="flex flex-col justify-center">
          <h2 className="text-3xl font-bold mb-2">{meeting.title}</h2>
          <p className="text-nexus-muted mb-8">Host: {(meeting.hostId as { name?: string })?.name}</p>

          {/* Zero Trust & Intelligence Badges */}
          <div className="flex flex-col gap-4 mb-8">
            <div className="glass-panel p-4 rounded-xl flex items-start gap-4 border-nexus-success/30">
              <Shield className="w-6 h-6 text-nexus-success shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-nexus-success">Zero-Trust Secured</h4>
                <p className="text-sm text-nexus-muted mt-1">Your identity is verified. No public links are used.</p>
              </div>
            </div>
            
            {meeting.analyticsEnabled && (
              <div className="glass-panel p-4 rounded-xl flex items-start gap-4 border-nexus-primary/30">
                <Brain className="w-6 h-6 text-nexus-primary shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-nexus-primary">AI Analytics Active</h4>
                  <p className="text-sm text-nexus-muted mt-1">Visual and audio signals will be processed locally or securely to compute focus metrics.</p>
                </div>
              </div>
            )}
          </div>

          {/* Consent Checkbox */}
          {meeting.analyticsEnabled && (
            <label className="flex items-start gap-3 cursor-pointer group mb-8 p-4 rounded-xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors">
              <div className="relative flex items-center justify-center mt-1">
                <input 
                  type="checkbox" 
                  className="peer sr-only"
                  checked={hasConsent}
                  onChange={(e) => setHasConsent(e.target.checked)}
                />
                <div className="w-5 h-5 border-2 border-nexus-muted rounded peer-checked:bg-nexus-primary peer-checked:border-nexus-primary transition-colors flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 scale-50 peer-checked:scale-100 transition-all" />
                </div>
              </div>
              <span className="text-sm text-nexus-muted group-hover:text-nexus-text transition-colors">
                I consent to the collection of anonymized behavioral and visual data for focus and moderation analysis during this session.
              </span>
            </label>
          )}

          <button 
            onClick={handleJoin}
            disabled={meeting.analyticsEnabled && !hasConsent}
            className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-nexus-primary to-purple-600 hover:shadow-[0_0_20px_rgba(108,92,231,0.5)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            Join Meeting
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MeetingLobby;

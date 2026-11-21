import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shield, CheckCircle, Video, Mic, MicOff, VideoOff, ArrowRight, Brain, Layers } from 'lucide-react';
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
  const [isConsentGiven, setIsConsentGiven] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  
  const { isMicMuted, isCameraOff, toggleMic, toggleCamera } = useMeetingStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const initPreview = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn('Camera/Microphone preview access not granted:', err);
    }
  }, []);

  const fetchMeeting = useCallback(async () => {
    try {
      if (!roomId) return;
      const data = await meetingService.getMeetingByRoomCode(roomId);
      const m = data.meeting;

      if (!m) {
        toast.error('Meeting not found');
        navigate('/meetings');
        return;
      }

      // Check terminal state before offering Join or initializing camera preview
      if (m.status === 'ended') {
        toast('This meeting has already ended. Redirecting to summary debrief...');
        navigate(`/meeting/${m.id}/summary`);
        return;
      }

      if (m.status === 'expired') {
        toast.error('This meeting has expired and cannot be joined.');
        navigate('/meetings');
        return;
      }

      if (m.status === 'cancelled') {
        toast.error('This meeting was cancelled.');
        navigate('/meetings');
        return;
      }

      setMeeting(m);
      // Valid non-terminal meeting: initialize camera preview
      initPreview();
    } catch (err: any) {
      console.error(err);
      const errorMsg = err.response?.data?.error || 'Failed to fetch meeting';
      toast.error(errorMsg);
      navigate('/meetings');
    } finally {
      setIsLoading(false);
    }
  }, [roomId, navigate, initPreview]);

  useEffect(() => {
    fetchMeeting();
    return () => {
      localStream?.getTracks().forEach(t => t.stop());
    };
  }, [fetchMeeting]);

  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !isMicMuted);
      localStream.getVideoTracks().forEach(track => track.enabled = !isCameraOff);
    }
  }, [isMicMuted, isCameraOff, localStream]);

  const handleJoin = async () => {
    if (!meeting || isJoining) return;
    
    // Guard against joining if status transitioned to terminal
    if (meeting.status === 'ended') {
      toast.error('This meeting has ended.');
      navigate(`/meeting/${meeting.id}/summary`);
      return;
    }
    if (meeting.status === 'expired' || meeting.status === 'cancelled') {
      toast.error(`Cannot join: meeting is ${meeting.status}.`);
      navigate('/meetings');
      return;
    }

    setIsJoining(true);

    if (meeting.analyticsEnabled && !isConsentGiven) {
      try {
        await meetingService.giveConsent(meeting.id);
        setIsConsentGiven(true);
        useMeetingStore.getState().setConsentGiven(true);
      } catch (err) {
        console.error(err);
        setIsJoining(false);
        return toast.error('Failed to record consent');
      }
    } else if (hasConsent) {
      useMeetingStore.getState().setConsentGiven(true);
    }

    // Stop local preview stream to free device for actual meeting room
    localStream?.getTracks().forEach(t => t.stop());
    navigate(`/room/${roomId}`);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-nexus-bg flex items-center justify-center text-nexus-muted">Verifying meeting security...</div>;
  }

  if (!meeting) return null;

  return (
    <div className="min-h-screen bg-nexus-bg text-nexus-text flex items-center justify-center p-6 relative overflow-hidden">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-10 z-10">
        
        {/* Left Side: Camera Preview */}
        <div className="flex flex-col gap-4">
          {/* Device check strip */}
          <div className="flex items-center gap-4 text-xs text-nexus-muted">
            <span className="flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5" /> Default Microphone ▾
            </span>
            <span className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5" /> Default Camera ▾
            </span>
          </div>

          {/* Video preview with vignette */}
          <div className="aspect-video bg-black rounded-panel overflow-hidden border border-nexus-border relative">
            {isCameraOff ? (
              <div className="absolute inset-0 flex items-center justify-center text-nexus-muted">
                <VideoOff className="w-14 h-14 opacity-30" />
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
            {/* Soft vignette overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 50%, rgba(10,11,14,0.4) 100%)' }} />
            
            {/* Name label */}
            <div className="absolute bottom-4 left-4 video-label text-sm font-medium">
              {meeting.host?.name || 'You'}
            </div>

            {/* Floating matte control pill */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-pill matte-overlay">
              <button 
                onClick={toggleMic}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isMicMuted ? 'bg-nexus-danger/20 text-nexus-danger' : 'hover:bg-white/10'}`}
              >
                {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button 
                onClick={toggleCamera}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isCameraOff ? 'bg-nexus-danger/20 text-nexus-danger' : 'hover:bg-white/10'}`}
              >
                {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
              <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
                <Layers className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Details & Consent */}
        <div className="flex flex-col justify-center">
          <h2 className="text-2xl font-semibold font-display mb-1">{meeting.title}</h2>
          <p className="text-nexus-muted text-sm mb-8">Host: {(meeting.host as { name?: string })?.name || 'Meeting Host'}</p>

          {/* Badges */}
          <div className="flex flex-col gap-3 mb-8">
            <div className="bg-nexus-surface p-4 rounded-card flex items-start gap-3 border border-nexus-border">
              <Shield className="w-5 h-5 text-nexus-success shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-sm text-nexus-success">Zero-Trust Secured</h4>
                <p className="text-xs text-nexus-muted mt-0.5">Your identity is verified. No public links are used.</p>
              </div>
            </div>
            
            {meeting.analyticsEnabled && (
              <div className="bg-nexus-surface p-4 rounded-card flex items-start gap-3 border border-nexus-border">
                <Brain className="w-5 h-5 text-nexus-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm text-nexus-primary">AI Analytics Active</h4>
                  <p className="text-xs text-nexus-muted mt-0.5">Visual and audio signals will be processed locally or securely to compute focus metrics.</p>
                </div>
              </div>
            )}
          </div>

          {/* Consent Checkbox */}
          {meeting.analyticsEnabled && (
            <label className="flex items-start gap-3 cursor-pointer group mb-8 p-4 rounded-card bg-nexus-surface border border-nexus-border hover:border-nexus-borderHover transition-colors">
              <div className="relative flex items-center justify-center mt-0.5">
                <input 
                  type="checkbox" 
                  data-testid="consent-checkbox"
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

          {/* Join Button */}
          <button 
            data-testid="join-now-btn"
            onClick={handleJoin}
            disabled={(meeting.analyticsEnabled && !hasConsent) || isJoining}
            className="w-full py-4 rounded-pill font-semibold text-lg btn-signal flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isJoining ? 'Connecting...' : 'Join now'}
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MeetingLobby;

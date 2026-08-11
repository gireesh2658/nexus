import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Brain, CheckCircle, Navigation, Users, FileText, ChevronLeft, Send, Clock, PieChart, Play, CalendarPlus, Share2 } from 'lucide-react';
import { Button } from '../components/ui/Button';

interface SummaryData {
  summary: {
    _id: string;
    summary: string;
    decisions: string[];
    actionItems: { task: string; owner: string; deadline: string }[];
    followUpEmail: string;
    generatedAt: string;
  };
  transcript: {
    userName: string;
    text: string;
    formattedTime: string;
  }[];
  actualDurationSecs?: number;
  actualStartTime?: string;
  speakingPercentages?: { name: string; percentage: number }[];
}

const MeetingSummaryPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await api.get(`/meetings/${id}/summary`);
        setData(res.data);
      } catch (err) {
        console.error('Failed to load summary', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-nexus-bg flex flex-col items-center justify-center">
        <Brain className="w-12 h-12 text-nexus-primary animate-pulse-soft mb-6" />
        <h2 className="text-xl font-semibold font-display">Generating AI Debrief...</h2>
        <p className="text-nexus-muted text-sm mt-2">Processing transcripts and extracting intelligence</p>
      </div>
    );
  }

  if (!data || !data.summary) {
    return (
      <div className="min-h-screen bg-nexus-bg flex flex-col items-center justify-center">
        <div className="p-8 bg-nexus-surface rounded-panel border border-nexus-border text-center max-w-md">
          <FileText className="w-10 h-10 text-nexus-muted mx-auto mb-4 opacity-50" />
          <h2 className="text-lg font-semibold font-display mb-2">No Debrief Found</h2>
          <p className="text-nexus-muted text-sm mb-6">The meeting has not ended yet, or no spoken audio was detected.</p>
          <Button onClick={() => navigate('/dashboard')}>Return to Dashboard</Button>
        </div>
      </div>
    );
  }

  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="min-h-screen bg-nexus-bg text-nexus-text pb-20">
      <div className="max-w-6xl mx-auto px-6 pt-12 relative z-10">
        <button 
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-nexus-muted hover:text-white transition-colors text-sm mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-card btn-signal flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold font-display tracking-tight mb-0.5">Meeting Intelligence</h1>
              <p className="text-nexus-muted text-sm flex items-center gap-2">
                Generated via Nexus Heuristic Engine
                <span className="text-[10px] bg-nexus-surface px-2 py-0.5 rounded-pill border border-nexus-border">Auto-Debrief</span>
              </p>
            </div>
          </div>
          
          {data.actualDurationSecs !== undefined && (
             <div className="bg-nexus-surface px-5 py-3 rounded-card flex items-center gap-3 border border-nexus-border">
               <Clock className="w-4 h-4 text-nexus-primary" />
               <div>
                  <div className="text-[10px] text-nexus-muted uppercase tracking-wider font-medium">Duration</div>
                  <div className="font-mono font-semibold text-base">{formatDuration(data.actualDurationSecs)}</div>
               </div>
             </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Executive Summary */}
            <div className="bg-nexus-surface border border-nexus-border rounded-panel p-6">
              {/* Gradient accent line */}
              <div className="h-0.5 w-full bg-nexus-signal rounded-full mb-5" />
              <h2 className="text-lg font-semibold font-display mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-nexus-primary" />
                Executive Summary
              </h2>
              <p className="text-nexus-text/85 leading-relaxed text-body">
                {data.summary.summary}
              </p>
            </div>

            {/* Key Decisions */}
            <div className="bg-nexus-surface border border-nexus-border rounded-panel p-6">
              <h2 className="text-lg font-semibold font-display mb-4 flex items-center gap-2">
                <Navigation className="w-4 h-4 text-nexus-success" />
                Key Decisions
              </h2>
              <ul className="space-y-3">
                {data.summary.decisions.map((decision, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-nexus-success shrink-0 mt-0.5" />
                    <span className="text-nexus-text/85 text-sm">{decision}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Items */}
            <div className="bg-nexus-surface border border-nexus-border rounded-panel p-6">
              <h2 className="text-lg font-semibold font-display mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-nexus-cyan" />
                Action Items
              </h2>
              {data.summary.actionItems.length === 0 ? (
                <p className="text-nexus-muted text-sm italic">No action items detected.</p>
              ) : (
                <div className="space-y-3">
                  {data.summary.actionItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-nexus-bg rounded-card border border-nexus-border">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-nexus-primary/15 text-nexus-primary flex items-center justify-center font-medium text-xs">
                          {item.owner.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm text-nexus-text/90">{item.task}</p>
                          <p className="text-xs text-nexus-muted">Assigned to: {item.owner}</p>
                        </div>
                      </div>
                      <div className="px-2.5 py-1 bg-nexus-surface rounded-pill text-xs text-nexus-muted border border-nexus-border">
                        {item.deadline}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 text-sm font-medium text-gradient-primary hover:opacity-80 transition-opacity">
                <Play className="w-4 h-4 text-nexus-primary" /> View recording
              </button>
              <button className="flex items-center gap-2 text-sm font-medium text-gradient-primary hover:opacity-80 transition-opacity">
                <FileText className="w-4 h-4 text-nexus-primary" /> Read transcript
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-3">
              <Button onClick={() => {}}>
                <CalendarPlus className="w-4 h-4" />
                Schedule follow-up
              </Button>
              <Button variant="secondary" onClick={() => {}}>
                <Share2 className="w-4 h-4" />
                Share notes
              </Button>
            </div>
            
            {/* Speaking Ratio Breakdown */}
            {data.speakingPercentages && data.speakingPercentages.length > 0 && (
               <div className="bg-nexus-surface border border-nexus-border rounded-panel p-6">
                 <h2 className="text-lg font-semibold font-display mb-4 flex items-center gap-2">
                   <PieChart className="w-4 h-4 text-nexus-warning" />
                   Speaking Participation
                 </h2>
                 <div className="space-y-3">
                    {data.speakingPercentages.sort((a,b) => b.percentage - a.percentage).map((stat, i) => (
                       <div key={i}>
                          <div className="flex justify-between text-xs mb-1">
                             <span className="font-medium">{stat.name}</span>
                             <span className="font-mono text-nexus-muted">{stat.percentage}%</span>
                          </div>
                          <div className="w-full bg-nexus-bg rounded-full h-1.5">
                             <div className="bg-nexus-signal h-1.5 rounded-full transition-all" style={{ width: `${stat.percentage}%` }} />
                          </div>
                       </div>
                    ))}
                 </div>
               </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Follow-up Email Draft */}
            <div className="bg-nexus-surface border border-nexus-border rounded-panel p-5">
              <h2 className="text-sm font-semibold font-display mb-3 flex items-center gap-2">
                <Send className="w-4 h-4 text-nexus-cyan" />
                Draft Follow-up Email
              </h2>
              <div className="bg-nexus-bg rounded-card p-3 font-mono text-xs text-nexus-text/75 whitespace-pre-wrap leading-relaxed border border-nexus-border max-h-64 overflow-y-auto">
                {data.summary.followUpEmail}
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(data.summary.followUpEmail);
                  alert('Copied to clipboard!');
                }}
                className="w-full mt-3 py-2 bg-white/5 hover:bg-white/10 transition-colors rounded-card font-medium text-xs border border-nexus-border"
              >
                Copy Draft
              </button>
            </div>

            {/* Raw Transcript Segment */}
            <div className="bg-nexus-surface border border-nexus-border rounded-panel p-5 h-[500px] flex flex-col">
              <h2 className="text-sm font-semibold font-display mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-nexus-muted" />
                Raw Transcript
              </h2>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {data.transcript.map((line, i) => (
                  <div key={i} className="bg-nexus-bg p-2.5 rounded-card border border-nexus-border">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[10px] text-nexus-primary font-medium">{line.userName}</p>
                      <p className="text-[10px] text-nexus-muted font-mono">{line.formattedTime}</p>
                    </div>
                    <p className="text-xs text-nexus-text/80">{line.text}</p>
                  </div>
                ))}
                {data.transcript.length === 0 && (
                  <p className="text-nexus-muted text-xs italic">No transcript recorded.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingSummaryPage;

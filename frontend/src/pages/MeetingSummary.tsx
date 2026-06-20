import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Brain, CheckCircle, Navigation, Users, FileText, ChevronLeft, Send } from 'lucide-react';

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
    startTime: string;
  }[];
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
      <div className="min-h-screen bg-nexus-bg flex flex-col items-center justify-center text-white">
        <Brain className="w-16 h-16 text-nexus-primary animate-pulse mb-6" />
        <h2 className="text-2xl font-bold">Generating AI Debrief...</h2>
        <p className="text-nexus-muted mt-2">Processing transcripts and extracting intelligence</p>
      </div>
    );
  }

  if (!data || !data.summary) {
    return (
      <div className="min-h-screen bg-nexus-bg flex flex-col items-center justify-center text-white">
        <div className="p-8 bg-white/5 rounded-2xl border border-white/10 text-center max-w-md">
          <FileText className="w-12 h-12 text-nexus-muted mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">No Debrief Found</h2>
          <p className="text-nexus-muted mb-6">The meeting has not ended yet, or no spoken audio was detected.</p>
          <button 
            onClick={() => navigate('/dashboard')}
            className="px-6 py-2 bg-nexus-primary hover:bg-nexus-accent text-white font-semibold rounded-lg transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-nexus-bg text-white pb-20">
      <div className="fixed top-0 inset-x-0 h-64 bg-gradient-to-b from-nexus-primary/20 to-transparent pointer-events-none" />
      
      <div className="max-w-6xl mx-auto px-6 pt-12 relative z-10">
        <button 
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-nexus-muted hover:text-white transition-colors mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-4 mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nexus-primary to-nexus-accent flex items-center justify-center shadow-glow-primary">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">Meeting Intelligence</h1>
            <p className="text-nexus-muted flex items-center gap-2">
              Generated via Nexus Heuristic Engine
              <span className="text-xs bg-white/10 px-2 py-0.5 rounded border border-white/5">Auto-Debrief</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-8">
            {/* Executive Summary */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-3 border-b border-white/5 pb-4">
                <FileText className="w-5 h-5 text-nexus-primary" />
                Executive Summary
              </h2>
              <p className="text-white/80 leading-relaxed text-lg">
                {data.summary.summary}
              </p>
            </div>

            {/* Key Decisions */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-3 border-b border-white/5 pb-4">
                <Navigation className="w-5 h-5 text-nexus-success" />
                Key Decisions
              </h2>
              <ul className="space-y-3">
                {data.summary.decisions.map((decision, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-nexus-success shrink-0 mt-0.5" />
                    <span className="text-white/90">{decision}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Items */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-3 border-b border-white/5 pb-4">
                <Users className="w-5 h-5 text-nexus-accent" />
                Action Items
              </h2>
              {data.summary.actionItems.length === 0 ? (
                <p className="text-nexus-muted italic">No action items detected.</p>
              ) : (
                <div className="grid gap-4">
                  {data.summary.actionItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-black/40 rounded-xl border border-white/5">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-nexus-primary/20 text-nexus-primary flex items-center justify-center font-bold text-sm">
                          {item.owner.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-white/90">{item.task}</p>
                          <p className="text-sm text-nexus-muted">Assigned to: {item.owner}</p>
                        </div>
                      </div>
                      <div className="px-3 py-1 bg-white/5 rounded-lg text-sm text-nexus-muted border border-white/5">
                        {item.deadline}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Follow-up Email Draft */}
            <div className="bg-gradient-to-br from-[#1A1A1A] to-[#222] border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Send className="w-5 h-5 text-[#4A90E2]" />
                Draft Follow-up Email
              </h2>
              <div className="bg-black/60 rounded-xl p-4 font-mono text-sm text-white/80 whitespace-pre-wrap leading-relaxed border border-white/5">
                {data.summary.followUpEmail}
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(data.summary.followUpEmail);
                  alert('Copied to clipboard!');
                }}
                className="w-full mt-4 py-2 bg-white/10 hover:bg-white/20 transition-colors rounded-lg font-medium text-sm"
              >
                Copy Draft
              </button>
            </div>

            {/* Raw Transcript Segment */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-[400px] flex flex-col">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2 border-b border-white/5 pb-4">
                <FileText className="w-5 h-5 text-nexus-muted" />
                Raw Transcript
              </h2>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-white/10">
                {data.transcript.map((line, i) => (
                  <div key={i} className="bg-black/40 p-3 rounded-lg border border-white/5">
                    <p className="text-xs text-nexus-primary mb-1 font-semibold">{line.userName}</p>
                    <p className="text-sm text-white/80">{line.text}</p>
                  </div>
                ))}
                {data.transcript.length === 0 && (
                  <p className="text-nexus-muted text-sm italic">No transcript recorded.</p>
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

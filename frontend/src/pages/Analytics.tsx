import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart2, TrendingUp, Users, Calendar, Activity, RefreshCw } from 'lucide-react';
import { meetingService } from '../services/meetingService';
import toast from 'react-hot-toast';

const Analytics = () => {
  const [metrics, setMetrics] = useState({
    total: 0,
    upcoming: 0,
    active: 0,
    history: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchMetrics = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const data = await meetingService.getMyMeetings('all');
      const total = (data.total?.hosted || 0) + (data.total?.invited || 0);
      setMetrics({
        total,
        upcoming: data.total?.upcoming || 0,
        active: data.total?.active || 0,
        history: data.total?.history || 0,
      });
      if (isManual) toast.success('Analytics refreshed');
    } catch {
      toast.error('Failed to load analytics metrics');
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const stats = [
    { label: 'Total Meetings', value: loading ? '--' : metrics.total.toString(), icon: <BarChart2 className="w-5 h-5" />, color: 'text-nexus-primary' },
    { label: 'Upcoming Scheduled', value: loading ? '--' : metrics.upcoming.toString(), icon: <Calendar className="w-5 h-5" />, color: 'text-nexus-cyan' },
    { label: 'Active Live', value: loading ? '--' : metrics.active.toString(), icon: <Activity className="w-5 h-5" />, color: 'text-nexus-success' },
    { label: 'Completed Debriefs', value: loading ? '--' : metrics.history.toString(), icon: <TrendingUp className="w-5 h-5" />, color: 'text-nexus-warning' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics & Intelligence</h1>
          <p className="text-nexus-muted mt-1">Real-time metrics and AI debrief insights across all meetings.</p>
        </div>
        <button
          onClick={() => fetchMetrics(true)}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-nexus-muted hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="glass-panel p-6 rounded-2xl border border-white/5"
          >
            <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3 ${stat.color}`}>
              {stat.icon}
            </div>
            <div className="text-3xl font-bold font-mono mb-1">{stat.value}</div>
            <div className="text-sm text-nexus-muted">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Focus Trends */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5">
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-nexus-primary" /> Focus Score Trends
          </h3>
          <div className="h-48 flex items-center justify-center border border-dashed border-white/10 rounded-xl p-6 text-center">
            <p className="text-nexus-muted text-sm">Real-time focus and gaze metrics stream live into TimescaleDB and populate during active AI meetings.</p>
          </div>
        </div>

        {/* Meeting Activity */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5">
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-nexus-cyan" /> Participation & AI Debriefs
          </h3>
          <div className="h-48 flex items-center justify-center border border-dashed border-white/10 rounded-xl p-6 text-center">
            <p className="text-nexus-muted text-sm">Transcripts, Gemini action items, and speaking percentages are archived under meeting debriefs.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Analytics;

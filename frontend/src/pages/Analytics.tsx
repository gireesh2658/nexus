import { motion } from 'framer-motion';
import { BarChart2, TrendingUp, Users, Clock, Activity } from 'lucide-react';

const Analytics = () => {
  const stats = [
    { label: 'Total Meetings', value: '--', icon: <BarChart2 className="w-5 h-5" />, color: 'text-nexus-primary' },
    { label: 'Avg. Duration', value: '--', icon: <Clock className="w-5 h-5" />, color: 'text-nexus-accent' },
    { label: 'Participants', value: '--', icon: <Users className="w-5 h-5" />, color: 'text-nexus-success' },
    { label: 'Engagement', value: '--', icon: <TrendingUp className="w-5 h-5" />, color: 'text-nexus-warning' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-nexus-muted mt-1">AI-powered insights from your meetings.</p>
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
          <div className="h-48 flex items-center justify-center border border-dashed border-white/10 rounded-xl">
            <p className="text-nexus-muted text-sm">Focus analytics will appear after meetings with AI analysis enabled.</p>
          </div>
        </div>

        {/* Meeting Activity */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5">
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
            <BarChart2 className="w-5 h-5 text-nexus-accent" /> Meeting Activity
          </h3>
          <div className="h-48 flex items-center justify-center border border-dashed border-white/10 rounded-xl">
            <p className="text-nexus-muted text-sm">Meeting frequency and duration charts will populate with data.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Analytics;

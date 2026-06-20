import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Video, Shield, Activity, ArrowRight, Brain } from 'lucide-react';

const Landing = () => {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-nexus-primary opacity-20 blur-[100px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-nexus-accent opacity-20 blur-[100px]" />

      {/* Navbar */}
      <nav className="w-full p-6 flex justify-between items-center z-10 glass-panel border-b border-nexus-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-nexus-primary flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-wider">NEXUS</span>
        </div>
        <div className="flex gap-4">
          <Link to="/login" className="px-6 py-2 rounded-full font-medium transition-colors hover:bg-white/5">
            Log In
          </Link>
          <Link to="/register" className="px-6 py-2 rounded-full font-medium bg-nexus-text text-nexus-bg hover:bg-white transition-colors">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10 mt-12 mb-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel mb-8 border-nexus-primary/30">
            <span className="w-2 h-2 rounded-full bg-nexus-success animate-pulse" />
            <span className="text-sm font-medium text-nexus-muted">Nexus AI Engine v1.0 Live</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Intelligent Meetings, <br />
            <span className="text-gradient-primary">Reimagined by AI.</span>
          </h1>

          <p className="text-xl text-nexus-muted mb-10 max-w-2xl mx-auto">
            Beyond video conferencing. Nexus brings real-time focus detection, zero-trust security, and automated abuse moderation to your crucial conversations.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="px-8 py-4 rounded-full font-semibold text-lg bg-nexus-primary bg-gradient-to-r from-nexus-primary to-purple-600 shadow-[0_0_20px_rgba(108,92,231,0.4)] hover:shadow-[0_0_30px_rgba(108,92,231,0.6)] transition-all flex items-center justify-center gap-2 group">
              Start for Free
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <button className="px-8 py-4 rounded-full font-semibold text-lg glass-panel hover:bg-white/5 transition-all">
              View Architecture
            </button>
          </div>
        </motion.div>

        {/* Features Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mt-24"
        >
          <FeatureCard 
            icon={<Activity className="w-8 h-8 text-nexus-accent" />}
            title="Focus Analytics"
            description="Multimodal AI tracks visual, behavioral, and audio signals to measure real-time participant engagement."
          />
          <FeatureCard 
            icon={<Shield className="w-8 h-8 text-nexus-primary" />}
            title="Zero-Trust Architecture"
            description="Identity-based invitations. No public links. Complete protection against unauthorized access."
          />
          <FeatureCard 
            icon={<Video className="w-8 h-8 text-pink-500" />}
            title="Automated Moderation"
            description="Whisper & DistilBERT detect toxicity in real-time. Warn-first 3-strike protocol keeps meetings safe."
          />
        </motion.div>
      </main>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="glass-panel p-8 rounded-2xl flex flex-col items-center text-center hover:-translate-y-2 transition-transform duration-300">
    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
      {icon}
    </div>
    <h3 className="text-xl font-bold mb-3">{title}</h3>
    <p className="text-nexus-muted leading-relaxed">{description}</p>
  </div>
);

export default Landing;

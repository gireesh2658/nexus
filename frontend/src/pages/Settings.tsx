import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, User, Shield, Bell, Palette, Brain } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import toast from 'react-hot-toast';
import api from '../services/api';

const Settings = () => {
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  const handleSaveProfile = async () => {
    if (!name.trim()) return toast.error('Name cannot be empty');
    try {
      setIsSaving(true);
      const { data } = await api.patch('/auth/profile', { name: name.trim() });
      updateUser(data.user);
      toast.success('Profile updated!');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="w-4 h-4" /> },
    { id: 'ai', label: 'AI Settings', icon: <Brain className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
  ];

  const avatarColors = ['#6C5CE7', '#A855F7', '#00D2FF', '#3A7BD5', '#00E676', '#FFD600', '#FF5252', '#EC4899'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-nexus-muted" /> Settings
        </h1>
        <p className="text-nexus-muted mt-1">Manage your account preferences.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
              activeTab === tab.id
                ? 'bg-nexus-primary/20 text-nexus-primary border-nexus-primary/30'
                : 'bg-white/5 text-nexus-muted border-white/5 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'profile' && (
        <div className="glass-panel p-8 rounded-2xl border border-white/5 max-w-2xl">
          <h3 className="text-xl font-bold mb-6">Profile Information</h3>
          
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg"
              style={{ backgroundColor: user?.avatarColor || '#6C5CE7' }}
            >
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h4 className="font-semibold">{user?.name}</h4>
              <p className="text-sm text-nexus-muted">@{user?.username} · {user?.role}</p>
            </div>
          </div>

          {/* Avatar Color Picker */}
          <div className="mb-6">
            <label className="text-sm font-medium text-nexus-muted block mb-2">Avatar Color</label>
            <div className="flex gap-2 flex-wrap">
              {avatarColors.map((color) => (
                <button
                  key={color}
                  onClick={async () => {
                    try {
                      const { data } = await api.patch('/auth/profile', { avatarColor: color });
                      updateUser(data.user);
                      toast.success('Avatar color updated!');
                    } catch {
                      toast.error('Failed to update');
                    }
                  }}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${user?.avatarColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-4">
            <Input
              label="Display Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name"
            />
            <div className="flex items-center gap-2">
              <Input label="Email" value={user?.email || ''} disabled className="opacity-60" />
            </div>
            <div className="flex items-center gap-2">
              <Input label="Username" value={`@${user?.username || ''}`} disabled className="opacity-60" />
            </div>
          </div>
          
          <div className="mt-6">
            <Button onClick={handleSaveProfile} isLoading={isSaving}>
              Save Changes
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="glass-panel p-8 rounded-2xl border border-white/5 max-w-2xl">
          <h3 className="text-xl font-bold mb-4">Security</h3>
          <p className="text-nexus-muted text-sm mb-6">Your account is secured with JWT + httpOnly cookies. No tokens are stored in the browser.</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
              <div>
                <h4 className="font-medium text-sm">Session Management</h4>
                <p className="text-xs text-nexus-muted mt-0.5">Managed via secure httpOnly cookies</p>
              </div>
              <span className="text-xs font-bold text-nexus-success bg-nexus-success/10 px-2.5 py-1 rounded-lg">Active</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="glass-panel p-8 rounded-2xl border border-white/5 max-w-2xl">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Brain className="w-6 h-6 text-nexus-primary" />
            AI Intelligence
          </h3>
          <p className="text-nexus-muted text-sm mb-6">Manage how Nexus AI interacts with your meetings.</p>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
              <div>
                <h4 className="font-medium text-sm text-white">Focus Detection</h4>
                <p className="text-xs text-nexus-muted mt-1">Allow local camera analysis to calculate focus scores.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={user?.aiPreferences?.focusDetection ?? true}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    try {
                      const { data } = await api.patch('/auth/profile', { aiPreferences: { ...user?.aiPreferences, focusDetection: val } });
                      updateUser(data.user);
                      toast.success(val ? 'Focus Detection Enabled' : 'Focus Detection Disabled');
                    } catch {
                      toast.error('Failed to update AI settings');
                    }
                  }}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexus-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
              <div>
                <h4 className="font-medium text-sm text-white">Live Transcription</h4>
                <p className="text-xs text-nexus-muted mt-1">Allow Nexus to transcribe your speech using local Web Speech API.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={user?.aiPreferences?.transcription ?? true}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    try {
                      const { data } = await api.patch('/auth/profile', { aiPreferences: { ...user?.aiPreferences, transcription: val } });
                      updateUser(data.user);
                      toast.success(val ? 'Transcription Enabled' : 'Transcription Disabled');
                    } catch {
                      toast.error('Failed to update AI settings');
                    }
                  }}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexus-primary"></div>
              </label>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="glass-panel p-8 rounded-2xl border border-white/5 max-w-2xl">
          <h3 className="text-xl font-bold mb-4">Notifications</h3>
          <p className="text-nexus-muted text-sm">Notification preferences will be available soon.</p>
        </div>
      )}

      {activeTab === 'appearance' && (
        <div className="glass-panel p-8 rounded-2xl border border-white/5 max-w-2xl">
          <h3 className="text-xl font-bold mb-4">Appearance</h3>
          <p className="text-nexus-muted text-sm">Nexus uses a dark theme by default. Customization options coming soon.</p>
        </div>
      )}
    </motion.div>
  );
};

export default Settings;

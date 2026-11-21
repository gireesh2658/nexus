import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, User, Shield, Bell, Palette, Brain, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import toast from 'react-hot-toast';
import api from '../services/api';

interface NotificationPrefs {
  chatSounds: boolean;
  focusAlerts: boolean;
  meetingReminders: boolean;
}

interface AppearancePrefs {
  compactDensity: boolean;
  gridFit: 'cover' | 'contain';
  vignetteEffect: boolean;
}

const Settings = () => {
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  // Local notifications settings persisted in localStorage
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(() => {
    try {
      const saved = localStorage.getItem('nexus_notification_prefs');
      return saved ? JSON.parse(saved) : { chatSounds: true, focusAlerts: true, meetingReminders: true };
    } catch {
      return { chatSounds: true, focusAlerts: true, meetingReminders: true };
    }
  });

  // Local appearance settings persisted in localStorage
  const [appPrefs, setAppPrefs] = useState<AppearancePrefs>(() => {
    try {
      const saved = localStorage.getItem('nexus_appearance_prefs');
      return saved ? JSON.parse(saved) : { compactDensity: false, gridFit: 'cover', vignetteEffect: true };
    } catch {
      return { compactDensity: false, gridFit: 'cover', vignetteEffect: true };
    }
  });

  useEffect(() => {
    localStorage.setItem('nexus_notification_prefs', JSON.stringify(notifPrefs));
  }, [notifPrefs]);

  useEffect(() => {
    localStorage.setItem('nexus_appearance_prefs', JSON.stringify(appPrefs));
  }, [appPrefs]);

  const handleSaveProfile = async () => {
    if (!name.trim()) return toast.error('Name cannot be empty');
    try {
      setIsSaving(true);
      const { data } = await api.put('/auth/profile', { name: name.trim() });
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
        <p className="text-nexus-muted mt-1">Manage your account preferences and application behavior.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
              activeTab === tab.id
                ? 'bg-nexus-primary/20 text-nexus-primary border-nexus-primary/30 font-semibold'
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
                      toast.error('Failed to update avatar color');
                    }
                  }}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center ${user?.avatarColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                >
                  {user?.avatarColor === color && <Check className="w-4 h-4 text-white" />}
                </button>
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
          <p className="text-nexus-muted text-sm mb-6">Your session authentication and credentials are encrypted and stored via secure cookies or authorization tokens.</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
              <div>
                <h4 className="font-medium text-sm">Session Management</h4>
                <p className="text-xs text-nexus-muted mt-0.5">Zero-trust token-based authentication</p>
              </div>
              <span className="text-xs font-bold text-nexus-success bg-nexus-success/10 px-2.5 py-1 rounded-lg">Active</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
              <div>
                <h4 className="font-medium text-sm">Role & Privileges</h4>
                <p className="text-xs text-nexus-muted mt-0.5">Assigned meeting permissions level</p>
              </div>
              <span className="text-xs font-bold text-nexus-primary bg-nexus-primary/10 px-2.5 py-1 rounded-lg uppercase">{user?.role}</span>
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
                <p className="text-xs text-nexus-muted mt-1">Allow Nexus to transcribe your speech using the local Faster-Whisper AI pipeline.</p>
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
          <h3 className="text-xl font-bold mb-2">Notification Preferences</h3>
          <p className="text-nexus-muted text-xs mb-6">Local client preferences (saved in browser)</p>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
              <div>
                <h4 className="font-medium text-sm text-white">Chat Notification Sounds</h4>
                <p className="text-xs text-nexus-muted mt-0.5">Play subtle audio chime when new chat message arrives.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={notifPrefs.chatSounds}
                  onChange={(e) => {
                    setNotifPrefs(prev => ({ ...prev, chatSounds: e.target.checked }));
                    toast.success(e.target.checked ? 'Chat sounds enabled' : 'Chat sounds muted');
                  }}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexus-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
              <div>
                <h4 className="font-medium text-sm text-white">Focus Lost Warning Toast</h4>
                <p className="text-xs text-nexus-muted mt-0.5">Display toast alert when camera detects sustained gaze away.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={notifPrefs.focusAlerts}
                  onChange={(e) => {
                    setNotifPrefs(prev => ({ ...prev, focusAlerts: e.target.checked }));
                    toast.success(e.target.checked ? 'Focus alerts enabled' : 'Focus alerts silenced');
                  }}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexus-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
              <div>
                <h4 className="font-medium text-sm text-white">Upcoming Meeting Reminder</h4>
                <p className="text-xs text-nexus-muted mt-0.5">Show in-app notification when meeting is starting soon.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={notifPrefs.meetingReminders}
                  onChange={(e) => {
                    setNotifPrefs(prev => ({ ...prev, meetingReminders: e.target.checked }));
                    toast.success(e.target.checked ? 'Meeting reminders enabled' : 'Meeting reminders disabled');
                  }}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexus-primary"></div>
              </label>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'appearance' && (
        <div className="glass-panel p-8 rounded-2xl border border-white/5 max-w-2xl">
          <h3 className="text-xl font-bold mb-2">Appearance & Display</h3>
          <p className="text-nexus-muted text-xs mb-6">Local interface customization (saved in browser)</p>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
              <div>
                <h4 className="font-medium text-sm text-white">Compact Interface Density</h4>
                <p className="text-xs text-nexus-muted mt-0.5">Reduce padding and card heights for dense monitor layouts.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={appPrefs.compactDensity}
                  onChange={(e) => {
                    setAppPrefs(prev => ({ ...prev, compactDensity: e.target.checked }));
                    toast.success(e.target.checked ? 'Compact density active' : 'Standard density restored');
                  }}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexus-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
              <div>
                <h4 className="font-medium text-sm text-white">Video Tile Aspect Ratio</h4>
                <p className="text-xs text-nexus-muted mt-0.5">Control how participant video tracks fill their tile grid.</p>
              </div>
              <div className="flex gap-2">
                {(['cover', 'contain'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setAppPrefs(prev => ({ ...prev, gridFit: mode }));
                      toast.success(`Video display set to ${mode}`);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      appPrefs.gridFit === mode
                        ? 'bg-nexus-primary/20 text-nexus-primary border-nexus-primary/40 font-semibold'
                        : 'bg-white/5 text-nexus-muted border-white/5 hover:bg-white/10'
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
              <div>
                <h4 className="font-medium text-sm text-white">Soft Matte Vignette</h4>
                <p className="text-xs text-nexus-muted mt-0.5">Subtle edge vignette on local preview video feeds.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={appPrefs.vignetteEffect}
                  onChange={(e) => {
                    setAppPrefs(prev => ({ ...prev, vignetteEffect: e.target.checked }));
                    toast.success(e.target.checked ? 'Vignette enabled' : 'Vignette disabled');
                  }}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexus-primary"></div>
              </label>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default Settings;

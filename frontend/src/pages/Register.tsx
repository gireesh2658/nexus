import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../services/authService';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'participant'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Strict Validation
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required';
    
    if (!formData.username.trim()) newErrors.username = 'Username is required';
    else if (!/^[a-z0-9_]{3,30}$/.test(formData.username)) newErrors.username = '3-30 chars, lowercase/numbers/underscores only';
    
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email format';
    
    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    
    try {
      setIsLoading(true);
      const res = await authService.register(formData);
      login(res.user, res.token);
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message || 'Registration failed');
      } else {
        toast.error('Registration failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden py-12">
      {/* Background Orbs */}
      <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] rounded-full bg-nexus-primary opacity-10 blur-[100px]" />
      
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md z-10"
      >
        <Link to="/" className="flex items-center gap-2 mb-8 justify-center group hover:scale-105 transition-transform">
          <div className="w-10 h-10 rounded-xl bg-nexus-primary flex items-center justify-center shadow-[0_0_15px_rgba(108,92,231,0.5)]">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-wider">NEXUS</span>
        </Link>

        <div className="glass-panel p-8 rounded-2xl">
          <h2 className="text-2xl font-bold mb-2">Create Account</h2>
          <p className="text-nexus-muted mb-6">Join Nexus for intelligent meeting experiences</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input 
              label="Full Name"
              name="name"
              type="text" 
              value={formData.name}
              onChange={(e) => { handleChange(e); setErrors(prev => ({...prev, name: ''})); }}
              placeholder="Arjun Sharma"
              error={errors.name}
              autoFocus
            />

            <div className="relative">
              <Input 
                label="Unique Username"
                name="username"
                type="text" 
                value={formData.username}
                onChange={(e) => { handleChange(e); setErrors(prev => ({...prev, username: ''})); }}
                placeholder="arjun_s"
                className="pl-9"
                error={errors.username}
              />
              <span className="absolute left-4 top-9 text-nexus-muted">@</span>
            </div>
            
            <Input 
              label="Email Address"
              name="email"
              type="email" 
              value={formData.email}
              onChange={(e) => { handleChange(e); setErrors(prev => ({...prev, email: ''})); }}
              placeholder="arjun@example.com"
              error={errors.email}
            />
            
            <Input 
              label="Password"
              name="password"
              type="password" 
              value={formData.password}
              onChange={(e) => { handleChange(e); setErrors(prev => ({...prev, password: ''})); }}
              placeholder="••••••••"
              error={errors.password}
            />

            <Input 
              label="Confirm Password"
              name="confirmPassword"
              type="password" 
              value={formData.confirmPassword}
              onChange={(e) => { handleChange(e); setErrors(prev => ({...prev, confirmPassword: ''})); }}
              placeholder="••••••••"
              error={errors.confirmPassword}
            />

            <div>
              <label className="block text-sm font-medium text-nexus-muted mb-1">Role</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full bg-black/40 border border-nexus-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-nexus-primary focus:ring-1 focus:ring-nexus-primary transition-all appearance-none"
              >
                <option value="participant">Participant</option>
                <option value="host">Host</option>
              </select>
            </div>

            <Button 
              type="submit" 
              isLoading={isLoading}
              className="mt-2 w-full"
            >
              Register
              <ArrowRight className="w-5 h-5" />
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-nexus-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-nexus-primary hover:text-purple-400 font-medium transition-colors">
              Log in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Register;

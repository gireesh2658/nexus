import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../services/authService';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{email?: string, password?: string}>({});
  
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: typeof errors = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Invalid email format';
    
    if (!password) newErrors.password = 'Password is required';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    
    try {
      setIsLoading(true);
      const res = await authService.login({ email, password });
      login(res.user, res.token);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message || 'Login failed');
      } else {
        toast.error('Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[10%] right-[10%] w-[30%] h-[30%] rounded-full bg-nexus-primary opacity-20 blur-[100px]" />
      <div className="absolute bottom-[10%] left-[10%] w-[30%] h-[30%] rounded-full bg-nexus-accent opacity-20 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Link to="/" className="flex items-center gap-2 mb-8 justify-center group hover:scale-105 transition-transform">
          <div className="w-10 h-10 rounded-xl bg-nexus-primary flex items-center justify-center shadow-[0_0_15px_rgba(108,92,231,0.5)]">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-wider">NEXUS</span>
        </Link>

        <div className="glass-panel p-8 rounded-2xl">
          <h2 className="text-2xl font-bold mb-2">Welcome Back</h2>
          <p className="text-nexus-muted mb-6">Enter your credentials to access your meetings</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input 
              label="Email Address"
              type="email" 
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors(prev => ({...prev, email: undefined})); }}
              placeholder="arjun@example.com"
              error={errors.email}
              autoFocus
            />
            
            <Input 
              label="Password"
              type="password" 
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors(prev => ({...prev, password: undefined})); }}
              placeholder="••••••••"
              error={errors.password}
            />

            <Button 
              type="submit" 
              isLoading={isLoading}
              className="mt-2 w-full"
            >
              Sign In
              <ArrowRight className="w-5 h-5" />
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-nexus-muted">
            Don't have an account?{' '}
            <Link to="/register" className="text-nexus-primary hover:text-purple-400 font-medium transition-colors">
              Create one
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;


import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '../../components/Shared';
import { ICONS } from '../../constants';
import { supabase } from "../../supabase/supabaseClient.js";
import { useUser } from '../../context/UserContext';

const API = import.meta.env.VITE_API_BASE;



export const LoginPerspective: React.FC = () => {
  const navigate = useNavigate();
  const { setUser } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError || !data.session) {
      setLoading(false);
      setError(loginError?.message || "Incorrect email or password.");
      return;
    }
    // Check role
    const roleRes = await fetch(`${API}/api/user/role-by-email?email=${encodeURIComponent(email)}`);
    if (!roleRes.ok) {
      setLoading(false);
      setError('Account not found or not authorized.');
      return;
    }
    const userData = await roleRes.json().catch(() => null);
    if (!userData || (userData.role !== 'ADMIN' && userData.role !== 'STAFF')) {
      setLoading(false);
      setError('Only admin and staff accounts can log in.');
      return;
    }
    setUser({ role: userData.role, email });
    const { access_token, refresh_token } = data.session;
    const response = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ access_token, refresh_token })
    });
    if (!response.ok) {
      setLoading(false);
      const result = await response.json().catch(() => ({}));
      setError(result.message || "Failed to store session");
      return;
    }
    localStorage.removeItem("sb-ddkkbtijqrgpitncxylx-auth-token");
    setLoading(false);
    if (userData.role === 'ADMIN') {
      navigate('/dashboard');
    } else if (userData.role === 'STAFF') {
      navigate('/events');
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center px-4">
      <div className="max-w-md w-full py-12">
        <Card className="p-10 border-[#2E2E2F]/20 flex flex-col h-full">
          <div className="text-center flex flex-col items-center mb-8">
            <img
              src="https://xmjdcbzgdfylbqkjoyyb.supabase.co/storage/v1/object/public/startuplab-business-ticketing/assets/assets/image%20(1).svg"
              alt="StartupLab Business Center Logo"
              className="mx-auto mb-6 w-[240px] max-w-full h-auto"
              style={{ objectFit: 'contain' }}
            />
            <p className="text-[#2E2E2F]/70 text-lg font-medium">Sign in to your account</p>
            <div className="w-20 h-1 bg-[#38BDF2] mx-auto mt-4 rounded-full"></div>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            <Input
              placeholder="Email"
              value={email}
              onChange={(e: any) => setEmail(e.target.value)}
              type="email"
              required
            />
            <Input
              placeholder="Password"
              value={password}
              onChange={(e: any) => setPassword(e.target.value)}
              type="password"
              required
            />
            <div className="flex justify-end -mt-2">
              <button
                type="button"
                className="text-[#2E2E2F]/60 hover:text-[#38BDF2] transition-colors text-[11px] font-black uppercase tracking-[0.15em]"
                onClick={() => navigate('/forgot-password')}
              >
                Forgot password?
              </button>
            </div>
            <Button
              className="w-full mt-2"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Signing you in...' : 'Sign In'}
            </Button>
            {error && (
              <div className="mt-2 text-[#2E2E2F] text-sm font-bold text-center">{error}</div>
            )}
          </form>
        </Card>
        <div className="mt-16 flex flex-col items-center gap-6">
          <button
            className="text-[#2E2E2F]/60 hover:text-[#38BDF2] transition-colors text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2"
            onClick={() => navigate('/')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Event Home
          </button>
        </div>
      </div>
    </div>
  );
};

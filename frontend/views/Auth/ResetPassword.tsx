import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '../../components/Shared';
import { supabase } from '../../supabase/supabaseClient.js';

export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const ensureRecoverySession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (session) {
        setReady(true);
        return;
      }
      setError('This reset link is invalid or has expired. Request a new one.');
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true);
        setError('');
      }
    });

    ensureRecoverySession();
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (!ready) {
      setError('This reset link is invalid or has expired. Request a new one.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message || 'Unable to update password.');
      return;
    }

    setSuccess('Password updated. Redirecting to sign in...');
    await supabase.auth.signOut();
    setTimeout(() => navigate('/login'), 1500);
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
            <p className="text-[#2E2E2F]/70 text-lg font-medium">Choose a new password</p>
            <div className="w-20 h-1 bg-[#38BDF2] mx-auto mt-4 rounded-full"></div>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <Input
              placeholder="New password"
              value={password}
              onChange={(e: any) => setPassword(e.target.value)}
              type="password"
              required
            />
            <Input
              placeholder="Confirm password"
              value={confirm}
              onChange={(e: any) => setConfirm(e.target.value)}
              type="password"
              required
            />
            <Button className="w-full mt-2" type="submit" disabled={loading || !ready}>
              {loading ? 'Updating...' : 'Update password'}
            </Button>
            {error && (
              <div className="mt-2 text-[#2E2E2F] text-sm font-bold text-center">{error}</div>
            )}
            {success && (
              <div className="mt-2 text-[#2E2E2F] text-sm font-bold text-center">{success}</div>
            )}
          </form>
        </Card>
        <div className="mt-16 flex flex-col items-center gap-6">
          <button
            className="text-[#2E2E2F]/60 hover:text-[#38BDF2] transition-colors text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2"
            onClick={() => navigate('/forgot-password')}
          >
            Request a new reset link
          </button>
        </div>
      </div>
    </div>
  );
};

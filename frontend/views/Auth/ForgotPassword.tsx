import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '../../components/Shared';
import { supabase } from '../../supabase/supabaseClient.js';

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message || 'Unable to send reset email.');
      return;
    }
    setSuccess('If an account exists for that email, we sent a password reset link.');
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
            <p className="text-[#2E2E2F]/70 text-lg font-medium">Reset your password</p>
            <div className="w-20 h-1 bg-[#38BDF2] mx-auto mt-4 rounded-full"></div>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <Input
              placeholder="Email"
              value={email}
              onChange={(e: any) => setEmail(e.target.value)}
              type="email"
              required
            />
            <Button className="w-full mt-2" type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
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
            onClick={() => navigate('/login')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
};

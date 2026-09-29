'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Store token and user info
      localStorage.setItem('abs_token', data.access_token);
      localStorage.setItem('abs_user', JSON.stringify(data.user));

      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="p-8 bg-primary text-white text-center flex flex-col items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-xl" />
          <img src="/logo.png" alt="Ho Technical University Logo" className="h-20 w-auto object-contain bg-white p-2 rounded-2xl shadow-lg" />
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">HTU ABS Bridge</h1>
            <p className="mt-1 opacity-70 text-xs font-black uppercase tracking-widest">Administrative Portal</p>
          </div>
        </div>
        
        <div className="p-8 space-y-6 flex flex-col items-center justify-center min-h-[200px]">
          {error && (
            <div className="w-full p-3 bg-red-100 text-red-600 rounded-lg text-sm font-medium border border-red-200 text-center">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-gray-500 font-medium">Authenticating securely...</div>
          ) : (
            <div className="w-full flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => {
                  setError('Google Login Failed. Please try again.');
                }}
                useOneTap
                theme="outline"
                size="large"
                shape="rectangular"
                width="100%"
              />
            </div>
          )}
          
          <p className="text-xs text-gray-400 text-center mt-4">
            Secured via HTU Google Workspace. Only authorized administrators may log in.
          </p>
        </div>

        <div className="p-6 bg-gray-50 text-center text-xs text-gray-400 border-t border-gray-100">
          HTU Auto Bridge Service © 2026
        </div>
      </div>
    </div>
  );
}

import React, { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

function Login() {
  const { loginWithGoogle } = useAuth();

  useEffect(() => {
    // Load Google Sign-In script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse
      });

      window.google.accounts.id.renderButton(
        document.getElementById('google-signin-button'),
        { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular' }
      );
    };

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleCredentialResponse = (response) => {
    loginWithGoogle(response.credential);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Meeting Transcription App
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to start transcribing your meetings
          </p>
        </div>
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            <div className="text-center">
              <div id="google-signin-button" className="flex justify-center"></div>
            </div>
            <div className="text-xs text-gray-500 text-center">
              By signing in, you agree to our terms of service and privacy policy.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
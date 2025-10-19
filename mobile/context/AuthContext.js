import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../config/supabase';

// Complete WebBrowser authentication session
WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if user is already logged in on app start
  useEffect(() => {
    checkAuth();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔔 Auth state changed:', event);
      
      if (event === 'SIGNED_IN' && session) {
        await handleSessionChange(session);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setToken(null);
        await AsyncStorage.clear();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        console.log('🔄 Token refreshed');
        setToken(session.access_token);
        await AsyncStorage.setItem('auth_token', session.access_token);
      }
    });

    // Handle deep links for OAuth
    const handleDeepLink = Linking.addEventListener('url', ({ url }) => {
      console.log('🔗 Deep link received:', url);
      // Supabase will automatically handle the OAuth callback
    });

    return () => {
      subscription?.unsubscribe();
      handleDeepLink?.remove();
    };
  }, []);

  const handleSessionChange = async (session) => {
    const userData = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.user_metadata?.full_name || 
            session.user.user_metadata?.name || 
            session.user.email?.split('@')[0],
      avatar: session.user.user_metadata?.avatar_url,
      provider: session.user.app_metadata?.provider || 'email',
    };
    
    setToken(session.access_token);
    setUser(userData);
    
    // Persist to AsyncStorage
    await AsyncStorage.setItem('auth_token', session.access_token);
    await AsyncStorage.setItem('user_data', JSON.stringify(userData));
    await AsyncStorage.setItem('session_data', JSON.stringify(session));
    
    console.log('✅ Session saved to storage');
  };

  const checkAuth = async () => {
    try {
      console.log('🔍 Checking authentication...');
      
      // Try to get session from Supabase first
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (session) {
        console.log('✅ Active Supabase session found');
        await handleSessionChange(session);
      } else {
        // Try to restore from AsyncStorage
        console.log('⚠️ No active session, checking AsyncStorage...');
        const storedSessionData = await AsyncStorage.getItem('session_data');
        
        if (storedSessionData) {
          const storedSession = JSON.parse(storedSessionData);
          
          // Try to restore session in Supabase
          const { data, error: setError } = await supabase.auth.setSession({
            access_token: storedSession.access_token,
            refresh_token: storedSession.refresh_token,
          });
          
          if (!setError && data.session) {
            console.log('✅ Session restored from storage');
            await handleSessionChange(data.session);
          } else {
            console.log('❌ Could not restore session, clearing storage');
            await AsyncStorage.clear();
          }
        } else {
          console.log('❌ No stored session found');
        }
      }
    } catch (error) {
      console.error('❌ Auth check error:', error);
      await AsyncStorage.clear();
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
      console.log('✅ Auth check complete');
    }
  };

  const loginWithGoogle = async () => {
    try {
      console.log('🔐 Starting Google sign-in...');
      
      // Get the redirect URL for your app
      const redirectUrl = Linking.createURL('/auth/callback');
      console.log('📍 Redirect URL:', redirectUrl);
      
      // Use Supabase's built-in OAuth
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
        }
      });

      if (error) throw error;

      // Open the OAuth URL in browser
      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl
        );
        
        if (result.type === 'success') {
          console.log('✅ OAuth completed successfully');
          return { success: true };
        } else if (result.type === 'cancel') {
          return { success: false, error: 'Sign-in cancelled' };
        }
      }

      return { success: false, error: 'Failed to open OAuth' };
    } catch (error) {
      console.error('❌ Google sign-in error:', error);
      return { success: false, error: error.message };
    }
  };

  const login = async (email, password) => {
    try {
      console.log('🔐 Attempting email login...');
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid') || error.message.includes('Email not confirmed')) {
          throw new Error('Invalid credentials or email not verified. Please check your email for verification link or sign up.');
        }
        throw error;
      }

      console.log('✅ Logged in successfully');
      // Session will be handled by onAuthStateChange
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  };

  const signUp = async (email, password, name) => {
    try {
      console.log('📝 Creating new account...');
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || email.split('@')[0],
          },
        }
      });

      if (error) throw error;

      if (data.user && !data.session) {
        return { 
          success: true, 
          requiresConfirmation: true,
          message: 'Please check your email to verify your account before signing in.'
        };
      }

      return { success: true, requiresConfirmation: false };
    } catch (error) {
      console.error('Sign up error:', error);
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.clear();
      setToken(null);
      setUser(null);
      console.log('✅ Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const value = {
    user,
    token,
    loading,
    login,
    signUp,
    loginWithGoogle,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
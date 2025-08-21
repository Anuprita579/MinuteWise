import { useState, useEffect, createContext, useContext } from 'react';
import { api } from '../services/api';

// Auth Context
const AuthContext = createContext();

// Auth Provider Component
export const AuthProvider = ({ children }) => {
  const auth = useProvideAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};


export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Main auth hook logic
const useProvideAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth state on mount
  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const token = sessionStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      // Set token in API headers
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      // Verify token with backend
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      console.error('Auth check failed:', error);
      // Clear invalid token
      sessionStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      setError('Session expired');
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async (googleToken) => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.post('/auth/google', {
        token: googleToken
      });

      const { token, user } = response.data;

      // Store token
      sessionStorage.setItem('token', token);
      
      // Set token in API headers
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setUser(user);
      return { success: true, user };
    } catch (error) {
      console.error('Google login failed:', error);
      const message = error.response?.data?.detail || 'Login failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    // Clear token from storage and API headers
    sessionStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
    
    // Clear user state
    setUser(null);
    setError(null);
  };

  const refreshUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to refresh user:', error);
      logout(); // Auto logout if refresh fails
      throw error;
    }
  };

  return {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    loginWithGoogle,
    logout,
    refreshUser,
    checkAuthState
  };
};
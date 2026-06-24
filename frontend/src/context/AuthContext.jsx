import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Configure default axios properties
axios.defaults.baseURL = API_URL;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('netra_token') || null);
  const [loading, setLoading] = useState(true);
  const [isMfaRequired, setIsMfaRequired] = useState(false);
  const [tempCredentials, setTempCredentials] = useState(null);

  // Set default auth headers whenever token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('netra_token', token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('netra_token');
      localStorage.removeItem('netra_user');
      setUser(null);
    }
  }, [token]);

  // Load user profile on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('netra_user');
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        logout();
      }
    }
    setLoading(false);
  }, [token]);

  const register = async (username, email, password, role, badgeNumber = null, department = null) => {
    const payload = { username, email, password, role };
    if (role === 'police') {
      payload.badge_number = badgeNumber;
      payload.department = department;
    }
    const response = await axios.post('/api/auth/register', payload);
    return response.data;
  };

  const login = async (username, password, totpCode = null) => {
    try {
      const response = await axios.post('/api/auth/login', {
        username,
        password,
        totp_code: totpCode
      });

      const { data } = response;

      if (data.mfa_required) {
        setIsMfaRequired(true);
        setTempCredentials({ username, password });
        return { mfa_required: true };
      }

      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem('netra_user', JSON.stringify(data.user));
      setIsMfaRequired(false);
      setTempCredentials(null);
      return { success: true, user: data.user };
    } catch (error) {
      throw error.response?.data?.detail || 'Authentication failed';
    }
  };

  const verifyMfaLogin = async (code) => {
    if (!tempCredentials) {
      throw 'No pending credentials found. Please sign in again.';
    }
    return await login(tempCredentials.username, tempCredentials.password, code);
  };

  const setupMfa = async () => {
    try {
      const res = await axios.post('/api/auth/mfa/setup');
      return res.data;
    } catch (error) {
      throw error.response?.data?.detail || 'Failed to initiate MFA setup';
    }
  };

  const confirmMfa = async (code) => {
    try {
      const res = await axios.post('/api/auth/mfa/verify', { token: code });
      // Update local state user model
      const updatedUser = { ...user, mfa_enabled: true };
      setUser(updatedUser);
      localStorage.setItem('netra_user', JSON.stringify(updatedUser));
      return res.data;
    } catch (error) {
      throw error.response?.data?.detail || 'MFA validation failed';
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setIsMfaRequired(false);
    setTempCredentials(null);
    localStorage.removeItem('netra_token');
    localStorage.removeItem('netra_user');
  };

  const value = {
    user,
    token,
    loading,
    isMfaRequired,
    login,
    verifyMfaLogin,
    logout,
    register,
    setupMfa,
    confirmMfa,
    cancelMfaPrompt: () => {
      setIsMfaRequired(false);
      setTempCredentials(null);
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types.js';
import { api, setAuthToken } from '../api.js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string) => Promise<any>;
  guestLogin: () => Promise<void>;
  setAuthenticatedUser: (user: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ai_db_reviewer_token');
    if (!token) {
      setLoading(false);
      return;
    }

    api.getMe()
      .then(res => {
        setUser(res.user);
      })
      .catch(() => {
        setAuthToken(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await api.login(email, pass);
    setAuthToken(res.token);
    setUser(res.user);
  };

  const register = async (name: string, email: string, pass: string) => {
    const res = await api.register(name, email, pass);
    return res;
  };

  const setAuthenticatedUser = (u: User, token: string) => {
    setAuthToken(token);
    setUser(u);
  };

  const guestLogin = async () => {
    const res = await api.guestLogin();
    setAuthToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, guestLogin, setAuthenticatedUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

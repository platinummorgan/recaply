import { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://web-production-abd11.up.railway.app';
const TOKEN_KEY = 'recaply_auth_token';

interface User {
  id: string;
  email: string;
  subscriptionTier: 'free' | 'lite' | 'pro';
  minutesUsed?: number;
  minutesLimit?: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: {children: React.ReactNode}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load token on mount
  useEffect(() => {
    loadToken();
  }, []);

  const loadToken = async () => {
    try {
      const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (storedToken) {
        setToken(storedToken);
        // Fetch user info with this token
        await fetchUserInfo(storedToken);
      }
    } catch (error) {
      console.error('Error loading token:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserInfo = async (authToken: string) => {
    try {
      console.log('Fetching user info...');
      const response = await fetch(`${API_URL}/api/user/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('User info loaded:', data.user.email);
        setUser(data.user);
      } else {
        console.log('Token invalid, status:', response.status);
        // Token invalid, clear it
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
      // Network error, clear token
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      
      // Store token securely
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (error: any) {
      throw error;
    }
  };

  const register = async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Registration failed');
      }

      const data = await response.json();
      
      // Store token securely
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (error: any) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setToken(null);
      setUser(null);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUserInfo(token);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

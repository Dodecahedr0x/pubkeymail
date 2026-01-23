'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import * as authApi from '@/lib/api/auth';
import * as usersApi from '@/lib/api/users';
import type { User } from '@/lib/api/users';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

interface Props {
  children: ReactNode;
}

export function AuthProvider({ children }: Props) {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');
    
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
    }
    setIsLoading(false);
  }, []);
  
  const login = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError('Wallet not connected');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const address = publicKey.toBase58();
      
      const challengeResult = await authApi.requestChallenge(address);
      if (challengeResult.error) {
        throw new Error(challengeResult.error.message);
      }
      
      const { challenge, nonce } = challengeResult.data!;
      
      const messageBytes = new TextEncoder().encode(challenge);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);
      
      const verifyResult = await authApi.verifySignature(address, signature, nonce);
      if (verifyResult.error) {
        throw new Error(verifyResult.error.message);
      }
      
      const { token } = verifyResult.data!;
      localStorage.setItem('auth_token', token);
      
      const checkResult = await usersApi.checkAddress(address);
      
      let userData: User;
      
      if (!checkResult.data?.registered) {
        const registerResult = await usersApi.registerUser(address);
        if (registerResult.error) {
          throw new Error(registerResult.error.message);
        }
        userData = registerResult.data!.user;
      } else {
        const profileResult = await usersApi.getProfile(address);
        if (profileResult.error) {
          throw new Error(profileResult.error.message);
        }
        userData = profileResult.data!.user;
      }
      
      setUser(userData);
      localStorage.setItem('auth_user', JSON.stringify(userData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signMessage]);
  
  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setUser(null);
    disconnect();
  }, [disconnect]);
  
  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      error,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

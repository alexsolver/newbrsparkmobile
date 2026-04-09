import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import * as Notifications from 'expo-notifications';
import {
  AuthService,
  TwoFactorRequired,
  User,
  subscribeSessionInvalidated,
  applySessionInvalidatedFromServer,
  isTechnicianProfileActive,
} from '../services/auth';
import { ApiService } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataCollectionService } from '../services/dataCollectionService';
import { warmAvatarCacheForUser } from '../services/avatarLocalCache';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; phone?: string; consent: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  completeLoginWithOtp: (challengeToken: string, otp: string) => Promise<void>;
  userRole: 'CLIENT' | 'TECHNICIAN';
  setUserRole: (role: 'CLIENT' | 'TECHNICIAN') => Promise<void>;
  patchUser: (partial: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, _setUserRole] = useState<'CLIENT' | 'TECHNICIAN'>('CLIENT');

  const runAvatarWarm = useCallback((u: User | null) => {
    if (!u) return;
    warmAvatarCacheForUser(u, async partial => {
      const next = await AuthService.patchUserInStorage(partial);
      if (next) setUser(next);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    if (userRole === 'TECHNICIAN' && !isTechnicianProfileActive(user)) {
      _setUserRole('CLIENT');
      AsyncStorage.setItem('@brspark_active_role', 'CLIENT').catch(() => {});
      dataCollectionService.onSessionOpen(user.email, user.tenantId, false);
    }
  }, [user, user?.technicianProfile?.status, userRole]);

  useEffect(() => {
    const unsub = subscribeSessionInvalidated(() => {
      setUser(null);
      _setUserRole('CLIENT');
    });
    const pushSub = Notifications.addNotificationReceivedListener((notification) => {
      const t = notification.request?.content?.data?.type;
      if (t === 'FORCE_LOGOUT') {
        applySessionInvalidatedFromServer().catch(() => {});
      }
    });
    return () => {
      unsub();
      pushSub.remove();
    };
  }, []);

  useEffect(() => {
    AuthService.getUser()
      .then(localUser => {
        setUser(localUser);
        setLoading(false);
        if (localUser) {
          AuthService.validateSession()
            .then(fresh => {
              if (fresh) {
                setUser(fresh);
                runAvatarWarm(fresh);
              } else setUser(null); // Token expirado e limpo do ASyncStorage
            })
            .catch(() => {});
        }
        return AsyncStorage.getItem('@brspark_active_role').then(role => ({ localUser, role }));
      })
      .then(({ localUser, role: savedRole }) => {
         if (localUser && (savedRole === 'TECHNICIAN' || savedRole === 'CLIENT')) {
            _setUserRole(savedRole);
         } else {
            _setUserRole('CLIENT');
         }
         setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [runAvatarWarm]);

  const patchUser = async (partial: Partial<User>) => {
    const next = await AuthService.patchUserInStorage(partial);
    if (next) setUser(next);
  };

  const login = async (email: string, password: string) => {
    // TwoFactorRequired é relançado para a tela de login capturar
    const u = await AuthService.login(email, password);
    setUser(u);
    runAvatarWarm(u);
    const defaultRole = isTechnicianProfileActive(u) ? 'TECHNICIAN' : 'CLIENT';
    _setUserRole(defaultRole);
    await AsyncStorage.setItem('@brspark_active_role', defaultRole);
    dataCollectionService.onSessionOpen(u.email, u.tenantId, defaultRole === 'TECHNICIAN');
    ApiService.sync(u.email).catch(err => console.error('[AUTH] Sync post-login failed:', err));
  };

  const completeLoginWithOtp = async (challengeToken: string, otp: string) => {
    const u = await AuthService.verifyOtp(challengeToken, otp);
    setUser(u);
    runAvatarWarm(u);
    const defaultRole = isTechnicianProfileActive(u) ? 'TECHNICIAN' : 'CLIENT';
    _setUserRole(defaultRole);
    await AsyncStorage.setItem('@brspark_active_role', defaultRole);
    dataCollectionService.onSessionOpen(u.email, u.tenantId, defaultRole === 'TECHNICIAN');
    ApiService.sync(u.email).catch(err => console.error('[AUTH] Sync post-2fa failed:', err));
  };

  const register = async (data: { name: string; email: string; password: string; phone?: string; consent: boolean }) => {
    const u = await AuthService.register(data);
    setUser(u);
    runAvatarWarm(u);
    _setUserRole('CLIENT');
    await AsyncStorage.setItem('@brspark_active_role', 'CLIENT');
    dataCollectionService.onSessionOpen(u.email, u.tenantId, false);
    ApiService.sync(u.email).catch(err => console.error('[AUTH] Sync post-register failed:', err));
  };

  const logout = async () => {
    await AuthService.logout();
    setUser(null);
    _setUserRole('CLIENT');
  };

  const deleteAccount = async () => {
    await AuthService.deleteAccount();
    setUser(null);
  };

  const setUserRole = async (role: 'CLIENT' | 'TECHNICIAN') => {
    if (role === 'TECHNICIAN' && user && !isTechnicianProfileActive(user)) {
      return;
    }
    _setUserRole(role);
    await AsyncStorage.setItem('@brspark_active_role', role);
    if (user) {
      dataCollectionService.onSessionOpen(user.email, user.tenantId, role === 'TECHNICIAN');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, deleteAccount, completeLoginWithOtp, userRole, setUserRole, patchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
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
  /** Último status de technicianProfile visto — para detetar PENDING/INACTIVE → ACTIVE em tempo de execução */
  const prevTechnicianStatusRef = useRef<string | null>(null);

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

  /** Prestador habilitado remotamente (painel): passar a TECHNICIAN + modo prestador no Header */
  useEffect(() => {
    if (!user) {
      prevTechnicianStatusRef.current = null;
      return;
    }
    const st = String(user.technicianProfile?.status || '').toUpperCase() || '';
    const prev = prevTechnicianStatusRef.current;
    if (prev !== null && prev !== 'ACTIVE' && st === 'ACTIVE' && userRole === 'CLIENT') {
      _setUserRole('TECHNICIAN');
      AsyncStorage.setItem('@brspark_active_role', 'TECHNICIAN').catch(() => {});
      dataCollectionService.onSessionOpen(user.email, user.tenantId, true);
    }
    prevTechnicianStatusRef.current = st || null;
  }, [user, user?.technicianProfile?.status, userRole]);

  /** Ao voltar ao primeiro plano, atualizar /me para refletir habilitação feita no painel (com throttle). */
  const lastMeRefreshRef = useRef(0);
  useEffect(() => {
    const onState = async (s: AppStateStatus) => {
      if (s !== 'active') return;
      const now = Date.now();
      if (now - lastMeRefreshRef.current < 45_000) return;
      const local = await AuthService.getUser();
      if (!local) return;
      lastMeRefreshRef.current = now;
      try {
        const fresh = await AuthService.validateSession();
        if (fresh) {
          setUser(fresh);
          runAvatarWarm(fresh);
        }
      } catch {
        /* ignore */
      }
    };
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, [runAvatarWarm]);

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
    let cancelled = false;
    (async () => {
      try {
        const localUser = await AuthService.getUser();
        if (cancelled) return;
        setUser(localUser);

        let effective: User | null = localUser;
        if (localUser) {
          try {
            const fresh = await AuthService.validateSession();
            if (cancelled) return;
            if (fresh) {
              effective = fresh;
              setUser(fresh);
              runAvatarWarm(fresh);
            } else {
              effective = null;
              setUser(null);
            }
          } catch {
            /* mantém localUser em effective */
          }
        }

        const rawSaved = await AsyncStorage.getItem('@brspark_active_role');
        let role: 'CLIENT' | 'TECHNICIAN' =
          rawSaved === 'TECHNICIAN' || rawSaved === 'CLIENT' ? rawSaved : 'CLIENT';

        const wasActive = localUser ? isTechnicianProfileActive(localUser) : false;
        const nowActive = effective ? isTechnicianProfileActive(effective) : false;

        if (role === 'TECHNICIAN' && !nowActive) {
          role = 'CLIENT';
          await AsyncStorage.setItem('@brspark_active_role', 'CLIENT');
        }
        // Habilitação no painel enquanto o papel guardado era cliente (ou primeira sessão)
        if (role === 'CLIENT' && !wasActive && nowActive) {
          role = 'TECHNICIAN';
          await AsyncStorage.setItem('@brspark_active_role', 'TECHNICIAN');
        }

        if (cancelled) return;
        _setUserRole(role);
        if (effective) {
          dataCollectionService.onSessionOpen(
            effective.email,
            effective.tenantId,
            role === 'TECHNICIAN',
          );
        }
        const st = String(effective?.technicianProfile?.status || '').toUpperCase() || '';
        prevTechnicianStatusRef.current = st || null;
      } catch {
        if (!cancelled) _setUserRole('CLIENT');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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

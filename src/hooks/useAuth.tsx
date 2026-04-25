import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  AuthService,
  API_BASE,
  TwoFactorRequired,
  User,
  subscribeSessionInvalidated,
  applySessionInvalidatedFromServer,
  isTechnicianProfileActive,
  canUseFieldWorkAppRole,
  canUseProviderMode,
} from '../services/auth';
import { ApiService } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataCollectionService } from '../services/dataCollectionService';
import { warmAvatarCacheForUser } from '../services/avatarLocalCache';
import { normalizeUserAvatarUrl } from '../utils/normalizeUserAvatarUrl';
import { NotificationService } from '../services/notifications';
import { resetAppIntroGuestSession } from '../lib/appIntroPrefs';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, tenantId?: string | null) => Promise<void>;
  loginWithOAuth: (params: {
    provider: 'google' | 'facebook' | 'apple';
    idToken?: string;
    accessToken?: string;
    tenantId?: string | null;
  }) => Promise<void>;
  register: (data: { name: string; email: string; password: string; phone?: string; consent: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  completeLoginWithOtp: (challengeToken: string, otp: string) => Promise<void>;
  loginWithOtp: (p: { challengeId: string; code: string; name?: string }) => Promise<void>;
  completeRegisterAfterOtpSetup: (p: { setupToken: string; password: string; consent: boolean }) => Promise<void>;
  userRole: 'CLIENT' | 'TECHNICIAN';
  setUserRole: (role: 'CLIENT' | 'TECHNICIAN') => Promise<void>;
  patchUser: (partial: Partial<User>) => Promise<void>;
  /** Cria tenant CLIENT ou PROVIDER e muda a sessão para esse espaço. */
  createWorkspace: (kind: 'CLIENT' | 'PROVIDER') => Promise<void>;
  /** Mesmo e-mail, outro tenant — troca JWT (perfil). */
  switchWorkspace: (tenantId: string) => Promise<void>;
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
    const absolute = normalizeUserAvatarUrl(u.avatarUrl, API_BASE);
    const forWarm = absolute ? { ...u, avatarUrl: absolute } : u;
    warmAvatarCacheForUser(forWarm, async partial => {
      const next = await AuthService.patchUserInStorage(partial);
      if (next) setUser(next);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    if (userRole === 'TECHNICIAN' && !canUseProviderMode(user)) {
      _setUserRole('CLIENT');
      AsyncStorage.setItem('@brspark_active_role', 'CLIENT').catch(() => {});
      dataCollectionService.onSessionOpen(user.email, user.tenantId, false);
    }
  }, [user, user?.technicianProfile?.status, user?.role, userRole]);

  /**
   * Mesma regra do PersonaContext: CLIENTE/TECHNICIAN → concha. Push e rotas lêem esta chave em alguns fluxos.
   * (PersonaContext não lê o AsyncStorage; só auth → role.)
   */
  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        if (!user) {
          await AsyncStorage.setItem('@brspark_active_persona_v1', 'client');
          return;
        }
        if (canUseProviderMode(user)) {
          const shell: 'client' | 'provider' = userRole === 'TECHNICIAN' ? 'provider' : 'client';
          await AsyncStorage.setItem('@brspark_active_persona_v1', shell);
        } else {
          await AsyncStorage.setItem('@brspark_active_persona_v1', 'client');
        }
      } catch {
        /* ignore */
      }
    })();
  }, [user, userRole, loading]);

  /** Prestador habilitado remotamente (painel): passar a TECHNICIAN + modo prestador no Header */
  useEffect(() => {
    if (!user) {
      prevTechnicianStatusRef.current = null;
      return;
    }
    const st = String(user.technicianProfile?.status || '').toUpperCase() || '';
    const prev = prevTechnicianStatusRef.current;
    if (prev !== null && prev !== 'ACTIVE' && st === 'ACTIVE' && userRole === 'CLIENT' && canUseProviderMode(user)) {
      _setUserRole('TECHNICIAN');
      AsyncStorage.setItem('@brspark_active_role', 'TECHNICIAN').catch(() => {});
      dataCollectionService.onSessionOpen(user.email, user.tenantId, true);
    }
    prevTechnicianStatusRef.current = st || null;
  }, [user, user?.technicianProfile?.status, userRole]);

  /** Ao voltar ao primeiro plano, atualizar /me para refletir habilitação feita no painel (com throttle). */
  const lastMeRefreshRef = useRef(0);
  useEffect(() => {
    const onState = (s: AppStateStatus) => {
      void (async () => {
        try {
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
            } else {
              // 401 em /me chama logout() e apaga AsyncStorage — sem isto o React mantém o utilizador
              // e o Dashboard corre loadData com cache já limpo (lista vazia / «sem dados»).
              const after = await AuthService.getUser();
              setUser(after);
              if (!after) {
                _setUserRole('CLIENT');
                await AsyncStorage.setItem('@brspark_active_role', 'CLIENT').catch(() => {});
                resetAppIntroGuestSession();
              }
            }
          } catch {
            /* ignore */
          }
        } catch {
          /* ignore */
        }
      })().catch(() => {});
    };
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, [runAvatarWarm]);

  useEffect(() => {
    const unsub = subscribeSessionInvalidated(() => {
      setUser(null);
      _setUserRole('CLIENT');
      resetAppIntroGuestSession();
    });
    const pushSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request?.content?.data as Record<string, unknown> | undefined;
      const t = data?.type;
      if (t === 'FORCE_LOGOUT') {
        applySessionInvalidatedFromServer().catch(() => {});
        return;
      }
      if (t === 'EVALUATION_CLIENT_SURVEY_INVITE') {
        const surveyUrl = typeof data?.surveyUrl === 'string' ? data.surveyUrl.trim() : '';
        const evaluationInstanceId =
          typeof data?.evaluationInstanceId === 'string' ? data.evaluationInstanceId.trim() : '';
        if (!surveyUrl || !evaluationInstanceId) return;
        const content = notification.request.content;
        NotificationService.addNotification({
          title: String(content.title || 'Avaliação'),
          body: String(content.body || 'Toque para responder à pesquisa.'),
          category: 'evaluation',
          personaScope: 'client',
          evaluationInstanceId,
          surveyUrl,
          fixedId: `eval_survey_${evaluationInstanceId}`,
          suppressLocalBanner: true,
        });
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
              resetAppIntroGuestSession();
            }
          } catch {
            /* mantém localUser em effective */
          }
        }

        const rawSaved = await AsyncStorage.getItem('@brspark_active_role');
        let role: 'CLIENT' | 'TECHNICIAN' =
          rawSaved === 'TECHNICIAN' || rawSaved === 'CLIENT' ? rawSaved : 'CLIENT';

        const wasActive = localUser ? canUseProviderMode(localUser) : false;
        const nowActive = effective ? canUseProviderMode(effective) : false;

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
    try {
      if (
        partial.avatarUrl !== undefined ||
        partial.name !== undefined ||
        partial.email !== undefined ||
        partial.preferredChatLocale !== undefined
      ) {
        const merged = await AuthService.patchMe({
          name: partial.name,
          email: partial.email,
          avatarUrl: partial.avatarUrl,
          preferredChatLocale: partial.preferredChatLocale,
        });
        if (merged) {
          setUser(merged);
          runAvatarWarm(merged);
          return;
        }
      }
    } catch (e) {
      // Idioma do chat no servidor: não gravar só em cache local — o GET usa a BD e a tradução ficaria errada.
      if (partial.preferredChatLocale !== undefined) throw e;
      console.warn('[Auth] patchMe falhou; a gravar alterações só no armazenamento local', e);
    }
    const next = await AuthService.patchUserInStorage(partial);
    if (next) setUser(next);
  };

  const login = async (email: string, password: string, tenantId?: string | null) => {
    // TwoFactorRequired é relançado para a tela de login capturar
    const u = await AuthService.login(email, password, tenantId);
    setUser(u);
    runAvatarWarm(u);
    const defaultRole = canUseProviderMode(u) ? 'TECHNICIAN' : 'CLIENT';
    _setUserRole(defaultRole);
    await AsyncStorage.setItem('@brspark_active_role', defaultRole);
    dataCollectionService.onSessionOpen(u.email, u.tenantId, defaultRole === 'TECHNICIAN');
    ApiService.sync(u.email).catch(err => console.error('[AUTH] Sync post-login failed:', err));
  };

  const loginWithOAuth = async (params: {
    provider: 'google' | 'facebook' | 'apple';
    idToken?: string;
    accessToken?: string;
    tenantId?: string | null;
  }) => {
    const u = await AuthService.loginWithOAuth(params);
    setUser(u);
    runAvatarWarm(u);
    const defaultRole = canUseProviderMode(u) ? 'TECHNICIAN' : 'CLIENT';
    _setUserRole(defaultRole);
    await AsyncStorage.setItem('@brspark_active_role', defaultRole);
    dataCollectionService.onSessionOpen(u.email, u.tenantId, defaultRole === 'TECHNICIAN');
    ApiService.sync(u.email).catch(err => console.error('[AUTH] Sync pós-login OAuth falhou:', err));
  };

  const completeLoginWithOtp = async (challengeToken: string, otp: string) => {
    const u = await AuthService.verifyOtp(challengeToken, otp);
    setUser(u);
    runAvatarWarm(u);
    const defaultRole = canUseProviderMode(u) ? 'TECHNICIAN' : 'CLIENT';
    _setUserRole(defaultRole);
    await AsyncStorage.setItem('@brspark_active_role', defaultRole);
    dataCollectionService.onSessionOpen(u.email, u.tenantId, defaultRole === 'TECHNICIAN');
    ApiService.sync(u.email).catch(err => console.error('[AUTH] Sync post-2fa failed:', err));
  };

  const loginWithOtp = async (p: { challengeId: string; code: string; name?: string }) => {
    const u = await AuthService.verifyOtpAndLogin({
      challengeId: p.challengeId,
      code: p.code,
      name: p.name,
    });
    setUser(u);
    runAvatarWarm(u);
    const defaultRole = canUseProviderMode(u) ? 'TECHNICIAN' : 'CLIENT';
    _setUserRole(defaultRole);
    await AsyncStorage.setItem('@brspark_active_role', defaultRole);
    dataCollectionService.onSessionOpen(u.email, u.tenantId, defaultRole === 'TECHNICIAN');
    ApiService.sync(u.email).catch(err => console.error('[AUTH] Sync pós-OTP app falhou:', err));
  };

  const completeRegisterAfterOtpSetup = async (p: { setupToken: string; password: string; consent: boolean }) => {
    const u = await AuthService.completeRegisterAfterOtpSetup(p);
    setUser(u);
    runAvatarWarm(u);
    _setUserRole('CLIENT');
    await AsyncStorage.setItem('@brspark_active_role', 'CLIENT');
    dataCollectionService.onSessionOpen(u.email, u.tenantId, false);
    ApiService.sync(u.email).catch(err => console.error('[AUTH] Sync pós-registo OTP falhou:', err));
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
    resetAppIntroGuestSession();
  };

  const deleteAccount = async () => {
    await AuthService.deleteAccount();
    setUser(null);
    _setUserRole('CLIENT');
    await AsyncStorage.setItem('@brspark_active_role', 'CLIENT').catch(() => {});
    resetAppIntroGuestSession();
  };

  const setUserRole = async (role: 'CLIENT' | 'TECHNICIAN') => {
    if (role === 'TECHNICIAN' && user && !canUseProviderMode(user)) {
      return;
    }
    _setUserRole(role);
    await AsyncStorage.setItem('@brspark_active_role', role);
    if (user) {
      dataCollectionService.onSessionOpen(user.email, user.tenantId, role === 'TECHNICIAN');
    }
  };

  const createWorkspace = async (kind: 'CLIENT' | 'PROVIDER') => {
    const u = await AuthService.createWorkspace(kind);
    setUser(u);
    runAvatarWarm(u);
    const defaultRole = canUseProviderMode(u) ? 'TECHNICIAN' : 'CLIENT';
    _setUserRole(defaultRole);
    await AsyncStorage.setItem('@brspark_active_role', defaultRole);
    dataCollectionService.onSessionOpen(u.email, u.tenantId, defaultRole === 'TECHNICIAN');
    ApiService.sync(u.email).catch((err) => console.error('[AUTH] Sync pós-criação de espaço falhou:', err));
  };

  const switchWorkspace = async (tenantId: string) => {
    const u = await AuthService.switchWorkspace(tenantId);
    setUser(u);
    runAvatarWarm(u);
    const defaultRole = canUseProviderMode(u) ? 'TECHNICIAN' : 'CLIENT';
    _setUserRole(defaultRole);
    await AsyncStorage.setItem('@brspark_active_role', defaultRole);
    dataCollectionService.onSessionOpen(u.email, u.tenantId, defaultRole === 'TECHNICIAN');
    ApiService.sync(u.email).catch((err) => console.error('[AUTH] Sync pós-troca de organização falhou:', err));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        loginWithOAuth,
        register,
        logout,
        deleteAccount,
        completeLoginWithOtp,
        loginWithOtp,
        completeRegisterAfterOtpSetup,
        userRole,
        setUserRole,
        patchUser,
        createWorkspace,
        switchWorkspace,
      }}
    >
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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { errorMessage } from '@project-graphite/ui';
import { ApiError, apiRequest } from './api';
import { announceChange } from './changes';
import { wipeLocalData } from './local-data';
import { applyTimePreferences, type TimeFormat } from './time';
import { refreshSession } from './session-refresh';

export type UserRole = 'member' | 'admin' | 'system_manager';

interface User {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  role: UserRole;
  timeZone: string;
  timeFormat?: TimeFormat;
  features: string[];
}

export const isAdmin = (user: User | undefined) => user?.role === 'admin' || user?.role === 'system_manager';

interface Session {
  accessToken: string;
  user: User;
}

export interface Proof {
  password: string;
  code?: string;
}

interface AuthContextValue {
  user?: User;
  ready: boolean;
  restoreError?: string;
  request<T>(path: string, init?: RequestInit, read?: (response: Response) => Promise<unknown>): Promise<T>;
  register(input: {
    email: string;
    handle: string;
    displayName: string;
    password: string;
    invite?: string;
  }): Promise<void>;
  verify(token: string): Promise<void>;
  login(email: string, password: string): Promise<{ challenge: string } | undefined>;
  completeTwoStep(challenge: string, code: string): Promise<void>;
  logout(): Promise<void>;
  changePassword(proof: Proof, newPassword: string): Promise<void>;
  deleteAccount(proof: Proof): Promise<void>;
  updateUser(changes: Partial<Pick<User, 'displayName' | 'features' | 'timeZone' | 'timeFormat'>>): void;
  accessToken(): Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function requestSession(retries = 4, delay = 1_000): Promise<Session | undefined> {
  try {
    return await apiRequest<Session>('/auth/refresh', { method: 'POST' });
  } catch (reason) {
    if (reason instanceof ApiError && reason.status === 401) {
      return undefined;
    }
    const retryAfter = reason instanceof ApiError ? reason.retryAfter : undefined;
    if (retries === 0 || (retryAfter && retryAfter > 10)) {
      throw reason;
    }
    await new Promise((resolve) => setTimeout(resolve, retryAfter ? retryAfter * 1000 : delay));
    return requestSession(retryAfter ? 0 : retries - 1, delay * 2);
  }
}

function restoreSession() {
  return refreshSession(() => requestSession());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>();
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState<string>();
  const current = useRef<Session>(undefined);

  const applySession = useCallback((next: Session | undefined) => {
    current.current = next;
    setSession(next);
  }, []);

  useEffect(() => {
    restoreSession()
      .then(applySession)
      .then(
        () => setReady(true),
        (reason: unknown) => setRestoreError(errorMessage(reason, 'Strata could not restore your session.')),
      );
  }, [applySession]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(
      () =>
        void restoreSession()
          .then((renewed) => renewed && applySession(renewed))
          .catch(() => null),
      13 * 60 * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [applySession, session]);

  const request = useCallback(
    async function authenticatedRequest<T>(
      path: string,
      init: RequestInit = {},
      read?: (response: Response) => Promise<unknown>,
    ) {
      const token = current.current?.accessToken;
      const result = await apiRequest<T>(path, init, token, read).catch(async (reason: unknown) => {
        if (!(reason instanceof ApiError && reason.status === 401 && token)) {
          throw reason;
        }
        const renewed = await restoreSession();
        applySession(renewed);
        if (!renewed) {
          throw reason;
        }
        return apiRequest<T>(path, init, renewed.accessToken, read);
      });
      if (init.method && init.method !== 'GET' && path !== '/me/calendars/refresh') announceChange();
      return result;
    },
    [applySession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user,
      ready,
      restoreError,
      request,
      register: async (input) => {
        await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      },
      verify: async (token) => {
        await apiRequest('/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
      },
      login: async (email, password) => {
        const result = await apiRequest<Session | { twoStep: true; challenge: string }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        if ('challenge' in result) return { challenge: result.challenge };
        applySession(result);
        return undefined;
      },
      completeTwoStep: async (challenge, code) => {
        applySession(
          await apiRequest<Session>('/auth/two-step', {
            method: 'POST',
            body: JSON.stringify({ challenge, code }),
          }),
        );
      },
      logout: async () => {
        await apiRequest('/auth/logout', { method: 'POST' });
        applySession(undefined);
        await wipeLocalData();
      },
      changePassword: async (proof, newPassword) => {
        applySession(
          await request<Session>('/auth/password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword: proof.password, code: proof.code, newPassword }),
          }),
        );
      },
      deleteAccount: async (proof) => {
        await request('/me', { method: 'DELETE', body: JSON.stringify(proof) });
        applySession(undefined);
        await wipeLocalData();
      },
      updateUser: (changes) => {
        const active = current.current;
        if (active) applySession({ ...active, user: { ...active.user, ...changes } });
      },
      accessToken: async () => {
        const active = current.current;
        if (!active) return '';
        const expiresAt = JSON.parse(atob(active.accessToken.split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/'))).exp;
        if (Number.isFinite(expiresAt) && expiresAt * 1000 > Date.now() + 30_000) return active.accessToken;
        const renewed = await restoreSession();
        if (current.current?.user.id !== active.user.id) throw new Error('The signed-in account changed');
        if (current.current.accessToken !== active.accessToken) return current.current.accessToken;
        applySession(renewed);
        if (renewed?.user.id !== active.user.id) throw new Error('The signed-in account changed');
        return renewed.accessToken;
      },
    }),
    [applySession, ready, request, restoreError, session],
  );

  applyTimePreferences(session?.user.timeFormat, session?.user.timeZone);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

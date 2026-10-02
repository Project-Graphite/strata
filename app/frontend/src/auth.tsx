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
import { ApiError, apiRequest } from './api';

export type UserRole = 'member' | 'admin' | 'system_manager';

interface User {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  role: UserRole;
  timeZone: string;
}

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
  updateUser(changes: Partial<Pick<User, 'displayName' | 'timeZone'>>): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let sessionRestoration: Promise<Session | undefined> | undefined;

async function requestSession(attempt = 0): Promise<Session | undefined> {
  try {
    return await apiRequest<Session>('/auth/refresh', { method: 'POST' });
  } catch (reason) {
    if ((reason instanceof ApiError && reason.status === 401) || attempt === 12) {
      return undefined;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
    return requestSession(attempt + 1);
  }
}

function restoreSession() {
  sessionRestoration ??= requestSession().finally(() => {
    sessionRestoration = undefined;
  });
  return sessionRestoration;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>();
  const [ready, setReady] = useState(false);
  const current = useRef<Session>(undefined);

  const applySession = useCallback((next: Session | undefined) => {
    current.current = next;
    setSession(next);
  }, []);

  useEffect(() => {
    restoreSession()
      .then(applySession)
      .finally(() => setReady(true));
  }, [applySession]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(
      () => void restoreSession().then((renewed) => renewed && applySession(renewed)),
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
      try {
        return await apiRequest<T>(path, init, token, read);
      } catch (reason) {
        if (!(reason instanceof ApiError && reason.status === 401 && token)) {
          throw reason;
        }
        const renewed = await restoreSession();
        applySession(renewed);
        if (!renewed) {
          throw reason;
        }
        return apiRequest<T>(path, init, renewed.accessToken, read);
      }
    },
    [applySession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user,
      ready,
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
      },
      updateUser: (changes) => {
        const active = current.current;
        if (active) applySession({ ...active, user: { ...active.user, ...changes } });
      },
    }),
    [applySession, ready, request, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

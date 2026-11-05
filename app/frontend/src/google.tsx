import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Button as UiButton } from '@project-graphite/ui';
import { apiRequest } from './api';

export type GooglePurpose = 'link' | 'calendar' | 'drive';

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export interface GoogleStatus {
  available: boolean;
  picker: { apiKey: string; appId: string } | null;
  hasPassword: boolean;
  account: { email: string; calendar: boolean; drive: boolean } | null;
}

export const googleConnectedMessages: Record<GooglePurpose, string> = {
  link: 'Google is linked. You can now sign in with it.',
  calendar: 'Google Calendar is connected. Choose the calendars to sync.',
  drive: 'Google Drive is connected. Choose the files to import.',
};

export const googleAllowed = !Capacitor.isNativePlatform();

export function useGoogleSignIn() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!googleAllowed) return;
    let current = true;
    apiRequest<{ enabled: boolean }>('/auth/google').then(
      (config) => current && setEnabled(config.enabled),
      () => current && setEnabled(false),
    );
    return () => {
      current = false;
    };
  }, []);
  return enabled;
}

export async function connectGoogle(request: Request, purpose: GooglePurpose, returnTo: string) {
  const { url } = await request<{ url: string }>('/auth/google/connect', { method: 'POST', body: JSON.stringify({ purpose, returnTo }) });
  window.location.assign(url);
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 48 48" width="18">
      <path d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" fill="#EA4335" />
      <path d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" fill="#4285F4" />
      <path d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" fill="#FBBC05" />
      <path d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" fill="#34A853" />
    </svg>
  );
}

export function GoogleSignInButton({ invite, onError }: { invite?: string; onError: (reason: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <UiButton
      className="w-full"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        apiRequest<{ url: string }>('/auth/google/start', { method: 'POST', body: JSON.stringify(invite ? { invite } : {}) }).then(
          ({ url }) => window.location.assign(url),
          (reason: unknown) => {
            setBusy(false);
            onError(reason);
          },
        );
      }}
      size="medium"
      type="button"
      variant="secondary"
    >
      <span className="inline-flex items-center gap-2">
        <GoogleMark />
        Continue with Google
      </span>
    </UiButton>
  );
}

interface DocsView {
  setIncludeFolders(include: boolean): DocsView;
}

interface PickerBuilder {
  addView(view: DocsView): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setCallback(callback: (result: { action: string; docs?: { id: string }[] }) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface PickerApi {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new () => DocsView;
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
}

declare global {
  interface Window {
    gapi?: { load(library: string, ready: () => void): void };
    google?: { picker: PickerApi };
  }
}

let picker: Promise<PickerApi> | undefined;

function loadPicker() {
  picker ??= new Promise<PickerApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => window.gapi!.load('picker', () => resolve(window.google!.picker));
    script.onerror = () => {
      picker = undefined;
      script.remove();
      reject(new Error('Google Drive could not be opened. Check your connection and try again.'));
    };
    document.head.append(script);
  });
  return picker;
}

export async function pickDriveFiles(request: Request) {
  const [{ token, apiKey, appId }, api] = await Promise.all([request<{ token: string; apiKey: string; appId: string }>('/me/google/picker'), loadPicker()]);
  return new Promise<string[]>((resolve) => {
    new api.PickerBuilder()
      .addView(new api.DocsView().setIncludeFolders(true))
      .enableFeature(api.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setOrigin(window.location.origin)
      .setCallback((result) => {
        if (result.action === api.Action.PICKED) resolve((result.docs ?? []).map((doc) => doc.id));
        else if (result.action === api.Action.CANCEL) resolve([]);
      })
      .build()
      .setVisible(true);
  });
}

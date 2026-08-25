// src/components/CloudKitAuthWebView.tsx
//
// Modal WebView that hosts CloudKit JS to obtain a private-database
// compatible web auth token.
//
// IMPORTANT PRIVACY NOTE on identity:
//   Apple NEVER exposes the user's real Apple ID email address through
//   CloudKit JS, by design. The only identity info available is:
//     - userRecordName: an opaque, app-scoped identifier (not human-readable)
//     - nameComponents (given/family name) — ONLY if the user opts into
//       "discoverability" AND the API token has "Request user
//       discoverability at sign in" enabled in CloudKit Dashboard
//   This component captures whatever displayName is available (a real
//   name, if discoverability was granted) and passes it up via
//   onTokenReceived's second argument. If nothing is available, the
//   caller should fall back to a generic label — there is no way to
//   show a real email address; this is an Apple platform privacy
//   guarantee, not a limitation of this implementation.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes'
import { colors } from '@/constants/colors';
import { buildCloudKitAuthHtml } from '../webview-assets/cloudkitAuthHtml';

// ─── Configuration ────────────────────────────────────────────────────────────

export const CLOUDKIT_CALLBACK_URL = 'https://wdkshowcase.app/cloudkit-callback';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CloudKitAuthWebViewProps {
  visible: boolean;
  containerIdentifier: string;
  apiToken: string;
  environment: 'development' | 'production';
  // identity is whatever we could capture — a real name if the user granted
  // discoverability, the opaque userRecordName otherwise, or null if neither
  // was ever received before the token arrived.
  onTokenReceived: (
    webAuthToken: string,
    identity: { displayName: string | null; userRecordName: string | null }
  ) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

interface WebViewMessage {
  type:
    | 'html_loaded'
    | 'awaiting_sign_in'
    | 'already_signed_in'
    | 'sign_in_success'
    | 'token_received'
    | 'error';
  payload: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractTokenFromCallbackUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    return (
      params.get('ckWebAuthToken') ??
      params.get('ckAPIToken') ??
      params.get('webAuthToken') ??
      (() => {
        if (parsed.hash) {
          const fragmentParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
          return (
            fragmentParams.get('ckWebAuthToken') ??
            fragmentParams.get('webAuthToken')
          );
        }
        return null;
      })()
    );
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CloudKitAuthWebView({
  visible,
  containerIdentifier,
  apiToken,
  environment,
  onTokenReceived,
  onError,
  onClose,
}: CloudKitAuthWebViewProps) {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [statusText, setStatusText] = useState('Loading…');
  const [isLoading, setIsLoading] = useState(true);
  const tokenReceivedRef = useRef(false);

  // Captured from already_signed_in / sign_in_success messages, BEFORE the
  // token itself arrives (the identity messages fire earlier in the flow
  // than the URL-redirect token interception below).
  const identityRef = useRef<{ displayName: string | null; userRecordName: string | null }>({
    displayName: null,
    userRecordName: null,
  });

  const html = useMemo(
    () => buildCloudKitAuthHtml({ containerIdentifier, apiToken, environment }),
    [containerIdentifier, apiToken, environment]
  );

  const resolveWithToken = useCallback(
    (webAuthToken: string) => {
      if (tokenReceivedRef.current) return;
      tokenReceivedRef.current = true;
      onTokenReceived(webAuthToken, identityRef.current);
    },
    [onTokenReceived]
  );

  const handleShouldStartLoad = useCallback(
    (request: ShouldStartLoadRequest): boolean => {
      if (request.url.startsWith(CLOUDKIT_CALLBACK_URL)) {
        // DEMO ONLY — never log auth tokens in production.
        // Strip query params which contain the live ckWebAuthToken.
        console.log('[CloudKitAuthWebView] Intercepted callback:', request.url.split('?')[0]);
        const token = extractTokenFromCallbackUrl(request.url);
        if (token) {
          setStatusText('Signed in! Finalizing…');
          resolveWithToken(token);
        } else {
          onError(
            'Sign-in callback reached but no token found in URL. ' +
            'Raw URL: ' + request.url.slice(0, 200)
          );
        }
        return false;
      }
      return true;
    },
    [resolveWithToken, onError]
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: WebViewMessage;
      try {
        message = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      switch (message.type) {
        case 'html_loaded':
          setStatusText('Loading CloudKit JS…');
          console.log('[CloudKitAuthWebView] html_loaded', message.payload);
          break;

        case 'awaiting_sign_in':
          setStatusText('Please sign in with your Apple ID below.');
          setIsLoading(false);
          break;

        case 'already_signed_in':
          setStatusText('Already signed in. Retrieving token…');
          console.log('[CloudKitAuthWebView] already_signed_in', message.payload);
          identityRef.current = {
            displayName: message.payload?.displayName ?? null,
            userRecordName: message.payload?.userRecordName ?? null,
          };
          break;

        case 'sign_in_success':
          setStatusText('Signed in! Retrieving token…');
          console.log('[CloudKitAuthWebView] sign_in_success', message.payload);
          identityRef.current = {
            displayName: message.payload?.displayName ?? null,
            userRecordName: message.payload?.userRecordName ?? null,
          };
          break;

        case 'token_received':
          console.log('[CloudKitAuthWebView] token_received (in-page), length:', message.payload?.webAuthToken?.length);
          if (message.payload?.webAuthToken) {
            resolveWithToken(message.payload.webAuthToken);
          }
          break;

        case 'error':
          console.log('[CloudKitAuthWebView] error', message.payload);
          setIsLoading(false);
          onError(message.payload?.message ?? 'Unknown CloudKit JS error');
          break;
      }
    },
    [resolveWithToken, onError]
  );

  const handleNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    // DEMO ONLY — Apple auth URLs carry oauth_token/oauth_verifier in query params;
    // log path only so credentials never appear in logs.
    console.log('[CloudKitAuthWebView] navigated to:', nav.url.split('?')[0], 'loading:', nav.loading);
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Sign in to iCloud</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
        )}

        <WebView
          ref={webViewRef}
          source={{ html }}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          originWhitelist={['*']}
          setSupportMultipleWindows={false}
          onError={(e) => onError(`WebView error: ${e.nativeEvent.description}`)}
          style={styles.webview}
        />

        {!isLoading && (
          <Text style={[styles.statusTextBottom, { paddingBottom: insets.bottom + 8 }]}>
            {statusText}
          </Text>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 14,
    color: colors.danger,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 16,
  },
  statusText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  statusTextBottom: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    padding: 8,
  },
});

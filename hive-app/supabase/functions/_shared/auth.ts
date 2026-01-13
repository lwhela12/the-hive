/**
 * Shared JWT verification for Supabase Edge Functions
 *
 * This module provides manual JWT verification using the jose library.
 * We use this approach instead of relying on Supabase's gateway JWT verification
 * because:
 *
 * 1. More control - We handle auth in our code, not hidden in infrastructure
 * 2. Avoid gateway caching issues - No stale JWT verification at the gateway level
 * 3. Better error handling - We can return specific error messages
 * 4. Supabase's recommended pattern - They're pushing everyone toward this approach
 *
 * IMPORTANT: All functions should be deployed with --no-verify-jwt flag
 * See: supabase/config.toml for default settings
 */

import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'https://deno.land/x/jose@v4.15.4/index.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Pass apikey header when fetching JWKS (Supabase requires this)
// The correct JWKS URL is /auth/v1/.well-known/jwks.json
const JWKS = supabaseUrl && supabaseAnonKey
  ? createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`), {
      headers: {
        apikey: supabaseAnonKey,
      },
    })
  : null;

export interface AuthResult {
  userId: string;
  token: string;
  payload: JWTPayload;
}

export interface AuthError {
  error: string;
  status: number;
}

/**
 * Verify a Supabase JWT token from the Authorization header
 *
 * @param authHeader - The Authorization header value (should be "Bearer <token>")
 * @returns AuthResult on success, AuthError on failure
 *
 * @example
 * const authHeader = req.headers.get('Authorization');
 * const auth = await verifySupabaseJwt(authHeader);
 * if ('error' in auth) {
 *   return new Response(JSON.stringify({ error: auth.error }), { status: auth.status });
 * }
 * const { userId, token } = auth;
 */
export async function verifySupabaseJwt(
  authHeader: string | null
): Promise<AuthResult | AuthError> {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variable');
    return { error: 'Server misconfigured', status: 500 };
  }

  if (!JWKS) {
    console.error('Failed to create JWKS - check SUPABASE_URL and SUPABASE_ANON_KEY');
    return { error: 'Server misconfigured', status: 500 };
  }

  if (!authHeader) {
    return { error: 'Missing Authorization header', status: 401 };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { error: 'Invalid Authorization header format', status: 401 };
  }

  const token = authHeader.slice('Bearer '.length).trim();

  if (!token) {
    return { error: 'Empty token', status: 401 };
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${supabaseUrl}/auth/v1`,
      audience: 'authenticated',
    });

    const userId = payload.sub;

    if (!userId) {
      return { error: 'Token missing subject claim', status: 401 };
    }

    return { userId, token, payload };
  } catch (error) {
    console.error('JWT verification failed:', error);

    // Provide specific error messages for common issues
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return { error: 'Token expired', status: 401 };
      }
      if (error.message.includes('signature')) {
        return { error: 'Invalid token signature', status: 401 };
      }
    }

    return { error: 'Invalid token', status: 401 };
  }
}

/**
 * Check if the auth result is an error
 */
export function isAuthError(result: AuthResult | AuthError): result is AuthError {
  return 'error' in result;
}

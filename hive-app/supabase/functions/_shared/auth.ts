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

/**
 * Being signed in is not the same as being allowed.
 *
 * An audit on 2026-08-03 found the same shape in five functions: verify the
 * token, then read or write with the service-role key using an id that came out
 * of the request body. The service-role key ignores row-level security, so
 * "which HIVE?" was answered by whoever was asking. A Production HIVE member
 * could hand over an OG HIVE id and be served its contents.
 *
 * These two are the missing half of every one of those checks. Call one
 * immediately after verifySupabaseJwt, before touching any caller-supplied id.
 */

/** Is this person actually in the HIVE whose data they're asking about? */
export async function isCommunityMember(
  supabaseAdmin: { from: (t: string) => any },
  userId: string,
  communityId: string
): Promise<boolean> {
  if (!userId || !communityId) return false;
  const { data, error } = await supabaseAdmin
    .from('community_memberships')
    .select('user_id')
    .eq('user_id', userId)
    .eq('community_id', communityId)
    .maybeSingle();
  if (error) {
    // A failed lookup is a no. A check that opens the door when the database
    // hiccups is not a check.
    console.error('Membership lookup failed:', error);
    return false;
  }
  return !!data;
}

/** Does this person run this HIVE from the inside? Owners always do. */
export async function isCommunityAdmin(
  supabaseAdmin: { from: (t: string) => any },
  userId: string,
  communityId: string
): Promise<boolean> {
  if (!userId || !communityId) return false;
  if (await isOwner(supabaseAdmin, userId)) return true;
  const { data, error } = await supabaseAdmin
    .from('community_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('community_id', communityId)
    .maybeSingle();
  if (error) {
    console.error('Admin lookup failed:', error);
    return false;
  }
  return data?.role === 'admin';
}

/**
 * God level — Nat and Lucas (migration 128). Deliberately reads profiles.is_owner
 * and NOT profiles.role: role is writable by the person it describes, which is
 * how a member could make themselves an admin of every HIVE they were in.
 */
export async function isOwner(
  supabaseAdmin: { from: (t: string) => any },
  userId: string
): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('is_owner')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('Owner lookup failed:', error);
    return false;
  }
  return data?.is_owner === true;
}

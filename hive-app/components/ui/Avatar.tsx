import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '../../lib/supabase';

/**
 * A member's face, or their initials.
 *
 * Every one of the 33 places in the app that draws a person draws it here, and
 * that is what makes the `avatars` bucket lockable. Migration 009 created the
 * bucket public, which meant its LISTING was open too — the folders are member
 * ids, so a stranger with no account could walk it and come away with a roster
 * of everybody in HIVE and their photographs. Migration 151 closed the listing
 * (reading takes being signed in and being in a HIVE) and this component asks
 * for a short-lived signed link instead of trusting the stored address.
 *
 * The signing lives here rather than in `lib/signedAttachment.ts` because that
 * file is bound to the `attachments` bucket, whose object keys and lifetime are
 * a different thing. The shape is deliberately identical, though, so the two
 * read the same when you land in either one.
 */

const BUCKET = 'avatars';
/** An hour: longer than anyone stares at a member list, short enough to matter. */
const TTL_SECONDS = 60 * 60;
/** Re-sign a couple of minutes early rather than hand out one about to die. */
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * The object key inside the bucket, read back out of whatever we stored.
 *
 * `profile.tsx` saves the result of `getPublicUrl` into `profiles.avatar_url`,
 * so the rows hold `/object/public/avatars/<key>`. Reading the key back means
 * none of those rows ever need rewriting. Anything without that marker — a
 * Google account photo, an external image — returns null and is drawn exactly
 * as it arrives, with no round trip and no flicker.
 */
function avatarPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  // Query strings on a stored avatar URL are cache-busters, never part of the key.
  const key = url.slice(i + marker.length).split('?')[0];
  return key ? decodeURIComponent(key) : null;
}

/** A link that opens, or null if it could not be signed. */
async function signAvatarUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const path = avatarPathFromUrl(url);
  // Not one of ours. Leave it alone.
  if (!path) return url;

  const hit = cache.get(path);
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return hit.url;

  const pending = inFlight.get(path);
  if (pending) return pending;

  const job = (async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
    if (error || !data?.signedUrl) {
      console.warn('Could not sign avatar', path, error);
      return null;
    }
    cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 });
    return data.signedUrl;
  })().finally(() => inFlight.delete(path));

  inFlight.set(path, job);
  return job;
}

/**
 * The signed form of one stored avatar, for drawing.
 *
 * Returns an outside address straight back on the first render, so a Google
 * photo appears with no delay. One of ours shows initials for the moment it
 * takes to sign — the same placeholder a member with no photo gets, so the wait
 * reads as intentional rather than as something broken.
 */
export function useSignedAvatar(url: string | null | undefined): string | null {
  const isOurs = !!avatarPathFromUrl(url);
  const [signed, setSigned] = useState<string | null>(isOurs ? null : (url ?? null));

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setSigned(null);
      return;
    }
    if (!avatarPathFromUrl(url)) {
      setSigned(url);
      return;
    }
    void signAvatarUrl(url).then((next) => {
      if (!cancelled) setSigned(next);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return signed;
}

/**
 * A member's photo on its own, with whatever you want drawn in its place.
 *
 * `Avatar` above always falls back to initials. Two screens draw a face with a
 * different stand-in — Home's daily-question strip uses a little grey
 * silhouette — and both were reaching for the stored address directly, which is
 * the one thing that stops the `avatars` bucket being closed. This exists so
 * they can keep their own fallback and still get a signed link.
 *
 * A component, not a hook, because Home draws these inside a `.map()` and a
 * hook cannot be called there. Same reason `SignedImage` is a component.
 */
export function SignedAvatarImage({
  url,
  style,
  fallback,
}: {
  url: string | null | undefined;
  style: React.ComponentProps<typeof Image>['style'];
  fallback: React.ReactNode;
}) {
  const source = useSignedAvatar(url);
  if (!source) return <>{fallback}</>;
  return <Image source={{ uri: source }} style={style} contentFit="cover" />;
}

interface AvatarProps {
  name: string;
  url?: string | null;
  /**
   * The same thing under an older name. Three call sites in the member
   * directory pass `uri`, and before this they silently drew initials for every
   * member who had uploaded a photo. Accepting both means that stays fixed
   * whichever name a screen reaches for.
   */
  uri?: string | null;
  size?: number;
}

export function Avatar({ name, url, uri, size = 40 }: AvatarProps) {
  const source = useSignedAvatar(url ?? uri);

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (source) {
    return (
      <Image
        source={{ uri: source }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#e5e7eb' }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="bg-honey-100 items-center justify-center"
    >
      <Text
        style={{ fontSize: size * 0.4 }}
        className="text-honey-700 font-semibold"
      >
        {initials}
      </Text>
    </View>
  );
}

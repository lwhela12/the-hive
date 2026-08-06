import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '../../lib/supabase';

/** The HIVE bee — the same mark the rail, the wish combs and the newsletter wear. */
const hiveBee = require('../../assets/BEE ONLY IN GOLD BG.png');

/**
 * A member's face, or a bee.
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
 * Sign a whole list of faces in ONE request, before anything asks for them.
 *
 * `signAvatarUrl` above signs one at a time, which is right when a single face
 * appears and wrong when a directory of them does: a comb of twelve members was
 * twelve separate round trips, so the faces arrived one by one and Nat watched
 * them trickle in (2026-08-06, "i wish the load times were way faster"). Supabase
 * has a plural `createSignedUrls`, so twelve becomes one.
 *
 * This fills the same cache the component reads, so a screen calls it once with
 * whatever it is about to draw and every `Avatar` underneath then resolves with
 * no request at all. Nothing waits on it — a face that is not warmed yet still
 * signs itself the old way, so calling this is always an optimisation and never
 * a dependency.
 *
 * Outside addresses (Google account photos) are skipped: they need no signing.
 */
export async function warmAvatarCache(urls: (string | null | undefined)[]): Promise<void> {
  const now = Date.now();
  const paths = Array.from(
    new Set(
      urls
        .map(avatarPathFromUrl)
        .filter((p): p is string => {
          if (!p) return false;
          const hit = cache.get(p);
          // Already good for a while, or already on its way: leave it alone.
          return !(hit && hit.expiresAt - REFRESH_MARGIN_MS > now) && !inFlight.has(p);
        })
    )
  );
  if (paths.length === 0) return;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, TTL_SECONDS);
  if (error || !data) {
    console.warn('Could not batch-sign avatars', error);
    return;
  }
  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  for (const row of data) {
    // The plural call reports failures per row rather than throwing, so a single
    // missing file cannot cost the whole directory its faces.
    if (row.signedUrl && row.path) cache.set(row.path, { url: row.signedUrl, expiresAt });
  }
}

/**
 * The signed form of one stored avatar, for drawing.
 *
 * Returns an outside address straight back on the first render, so a Google
 * photo appears with no delay. One of ours shows the bee for the moment it
 * takes to sign — the same stand-in a member with no photo gets, so the wait
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
 * `Avatar` above always falls back to the bee. Two screens draw a face with a
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

  if (source) {
    return (
      <Image
        source={{ uri: source }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#e5e7eb' }}
        contentFit="cover"
        cachePolicy="memory-disk"
        accessibilityLabel={`${name}'s photo`}
      />
    );
  }

  /**
   * No photo: a bee in a honey circle.
   *
   * Nat, on Infiniti's hexagon, 2026-08-06: *"what should we do if people dont
   * have a pic associated with their account? put a bee in? one of our logos?"*
   * An empty circle where a face goes reads as a picture that failed to load,
   * and somebody who has simply not uploaded one yet should not look broken.
   *
   * This replaced two letters of initials, and it replaced them **everywhere**,
   * on purpose. One stand-in is a decision anybody can recognise on sight; two
   * — letters here, a bee there — is a thing you have to learn. Who the face
   * belongs to is carried by the name drawn beside it in every place this
   * appears, and by the label below for a screen reader, so nothing that told
   * you who somebody was has gone.
   *
   * The bee is the app's own mark, the one the rail and the wish combs wear.
   * `contentFit="contain"` keeps its wings inside the circle at 24 points and
   * at 84.
   *
   * The fill is the app's soft honey rather than the `honey-100` gold the
   * initials sat on: the bee is drawn in black and gold, and on a gold disc its
   * stripes disappear into the background.
   */
  return (
    <View
      accessible
      accessibilityLabel={`${name} — no photo yet`}
      style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#fdf3dc' }}
      className="items-center justify-center"
    >
      <Image
        source={hiveBee}
        style={{ width: size * 0.66, height: size * 0.66 }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
    </View>
  );
}

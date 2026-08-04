import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Turning a stored attachment address into one that actually opens.
 *
 * The `attachments` bucket was created public, which meant every file in it sat
 * at a permanent open web address — and, worse, that the bucket's LISTING was
 * open too, so a stranger with no account could walk the folders (they are
 * member ids), pick a file and download it. An audit did exactly that on
 * 2026-08-04 and pulled down a 428KB image without sending a single credential.
 * Direct-message pictures were in there.
 *
 * The fix is to make the bucket private and hand out short-lived signed links
 * instead. What made that awkward is that the app stored the PUBLIC URL in the
 * database — on `board_posts.attachments`, `room_messages.attachments`,
 * `wish_comments.attachments` and room customisations — so 29 rows' worth of
 * addresses were about to stop working all at once.
 *
 * Rather than rewrite those rows, this reads the path back OUT of the stored
 * URL. Everything after `/attachments/` is the object's key, which is all the
 * signing call needs. Old rows keep working untouched, new rows can keep
 * storing whatever they like, and if the bucket is ever flipped back the same
 * code still returns something that opens.
 *
 * Signed links expire, so they are cached until shortly before they do — a
 * gallery re-rendering must not mean signing the same six files again.
 */

const BUCKET = 'attachments';
/** An hour is long enough to read a thread and short enough to be worth having. */
const TTL_SECONDS = 60 * 60;
/** Re-sign a couple of minutes early rather than hand out one about to die. */
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * The object key inside the bucket, from whatever we stored.
 *
 * Handles both shapes Supabase produces — `/object/public/attachments/<key>`
 * and `/object/attachments/<key>` — and returns null for anything that is not
 * one of ours, so an avatar or an external image passes straight through
 * unsigned instead of being mangled.
 */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  // Query strings on a public URL are cache-busters, never part of the key.
  const key = url.slice(i + marker.length).split('?')[0];
  return key ? decodeURIComponent(key) : null;
}

/** A link that opens, or null if it could not be signed. */
export async function signAttachmentUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const path = storagePathFromUrl(url);
  // Not ours — an avatar, an external image, a data: URI. Leave it alone.
  if (!path) return url;

  const hit = cache.get(path);
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return hit.url;

  const pending = inFlight.get(path);
  if (pending) return pending;

  const job = (async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
    if (error || !data?.signedUrl) {
      console.warn('Could not sign attachment', path, error);
      return null;
    }
    cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 });
    return data.signedUrl;
  })().finally(() => inFlight.delete(path));

  inFlight.set(path, job);
  return job;
}

/**
 * The signed form of one stored URL, for rendering.
 *
 * Returns the original immediately when it is not one of ours, so anything that
 * was already a plain image keeps working with no flash.
 */
export function useSignedUrl(url: string | null | undefined): string | null {
  const isOurs = !!storagePathFromUrl(url);
  const [signed, setSigned] = useState<string | null>(isOurs ? null : (url ?? null));

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setSigned(null);
      return;
    }
    if (!storagePathFromUrl(url)) {
      setSigned(url);
      return;
    }
    void signAttachmentUrl(url).then((next) => {
      if (!cancelled) setSigned(next);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return signed;
}

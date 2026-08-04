import { Linking } from 'react-native';
import { Image, type ImageProps } from 'expo-image';
import { signAttachmentUrl, useSignedUrl } from '../../lib/signedAttachment';

/**
 * An image from the attachments bucket, fetched with a signed link.
 *
 * A drop-in for expo-image's `Image` wherever the source is something a member
 * uploaded. It exists as a COMPONENT rather than a hook because almost every
 * attachment in this app is rendered inside a `.map()`, and a hook cannot be
 * called per item — which is exactly the sort of detail that would otherwise
 * have led to signing being wired into four places and forgotten in the fifth.
 *
 * Anything that is not from our bucket passes straight through untouched, so
 * avatars and external images keep working with no flash and no extra request.
 */
export function SignedImage({ uri, ...rest }: Omit<ImageProps, 'source'> & { uri: string | null | undefined }) {
  const signed = useSignedUrl(uri);
  return <Image source={signed ? { uri: signed } : undefined} {...rest} />;
}

/**
 * Open a stored attachment in the browser or a viewer.
 *
 * Signs first. Opening the stored address directly would 404 now the bucket is
 * private, which is the whole point — but it means every "open this file" path
 * has to come through here.
 */
export async function openSignedUrl(url: string | null | undefined) {
  const signed = await signAttachmentUrl(url);
  if (signed) void Linking.openURL(signed);
}

import { GrantWishModal } from '../hive/GrantWishModal';
import { useWishes } from '../../lib/hooks/useWishes';
import type { Wish } from '../../types';

// Use the wish's source HIVE, including when its owner brings it HIVE-Wide.
export function CheckInWishGrant({ wish, onClose, onGranted }: {
  wish: Wish; onClose: () => void; onGranted: () => void;
}) {
  const { grantWish } = useWishes();
  return <GrantWishModal visible wish={wish} communityId={wish.community_id} onClose={onClose}
    onGrant={async ({ granterIds, thankYouMessage }) => {
      const result = await grantWish(wish.id, granterIds, thankYouMessage, wish.community_id);
      if (!result.error) onGranted();
      return result;
    }} />;
}

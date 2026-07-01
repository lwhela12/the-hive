import type { ReactNode } from 'react';
import type { PressableProps } from 'react-native';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/hooks/useAuth';

type MemberProfileLinkProps = {
  memberId?: string | null;
  memberName?: string | null;
  children: ReactNode;
  onBeforeNavigate?: () => void;
  stopPropagation?: boolean;
  disabled?: boolean;
  className?: string;
  style?: PressableProps['style'];
  hitSlop?: PressableProps['hitSlop'];
  accessibilityLabel?: string;
};

export function MemberProfileLink({
  memberId,
  memberName,
  children,
  onBeforeNavigate,
  stopPropagation = false,
  disabled = false,
  className,
  style,
  hitSlop,
  accessibilityLabel,
}: MemberProfileLinkProps) {
  const router = useRouter();
  const { profile, session } = useAuth();
  const currentUserId = profile?.id ?? session?.user?.id ?? null;
  const canNavigate = !!memberId && !disabled;
  const isCurrentUser = !!memberId && memberId === currentUserId;
  const profileLabel = isCurrentUser ? 'your' : memberName ? `${memberName}'s` : 'member';

  const handlePress: NonNullable<PressableProps['onPress']> = (event) => {
    if (stopPropagation) {
      event.stopPropagation();
    }

    if (!canNavigate || !memberId) return;

    onBeforeNavigate?.();
    router.push(
      isCurrentUser
        ? '/profile'
        : { pathname: '/(app)/members', params: { memberId } }
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={!canNavigate}
      accessibilityRole={canNavigate ? 'button' : undefined}
      accessibilityLabel={canNavigate ? accessibilityLabel ?? `Open ${profileLabel} profile` : undefined}
      hitSlop={hitSlop}
      className={className}
      style={style}
    >
      {children}
    </Pressable>
  );
}

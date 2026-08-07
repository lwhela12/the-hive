import { Redirect } from 'expo-router';
import { useAuth } from '../lib/hooks/useAuth';
import { ArrivalScreen } from '../components/ui/ThinkingBee';
import { HIVE_GOLD } from '../lib/hiveBrand';
import { SPACE_SKIN } from '../lib/pageSkin';

export default function Index() {
  const { session, communityId, loading, wholeHive } = useAuth();

  // This is the waiting room, not a page. Nobody is meant to read it — it holds
  // for the length of one auth check and then sends you on — so it draws the
  // colour of wherever you are heading and nothing else.
  //
  // It used to draw cream with a bee on it. Cream reads as white, and everybody
  // lands at HIVE-Wide, so on a fresh tab that was a pale sheet dropped into the
  // middle of a near-black arrival — one of the "flashes of different colours"
  // Nat saw crossing over from the public site (2026-08-06). In a browser this
  // is invisible anyway now: the boot splash stays up until a real screen says
  // it has drawn something, and this room never says it.
  if (loading) {
    return <ArrivalScreen background={wholeHive ? SPACE_SKIN.page : HIVE_GOLD} />;
  }

  // Not logged in -> go to login
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // Logged in but no community -> go to join screen
  if (!communityId) {
    return <Redirect href="/join" />;
  }

  // Fresh app entry starts above the HIVEs rather than inside one — the same
  // call that retired the "Which HIVE today?" question (Nat 2026-08-03). From
  // up there every HIVE is one tap away in the rail, and nobody has to answer
  // anything to get through the door.
  // In-session navigation is still preserved by the app tabs while the user switches apps.
  return <Redirect href={'/hive-wide' as never} />;
}

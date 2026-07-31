// Has this person already said which hive they're in, this time round?
//
// People in one hive are never asked — there is nothing to choose. People in
// more than one (right now: Nat and Lucas) get the picker once when they arrive,
// and then the app leaves them alone until they sign out or come back fresh.
//
// Deliberately in memory only. A cold start is exactly when the question is
// worth asking again, and profiles.current_community_id already remembers the
// answer across sessions so the picker can lead with their last hive.

let confirmed = false;

export function hasConfirmedHive(): boolean {
  return confirmed;
}

export function markHiveConfirmed(): void {
  confirmed = true;
}

export function clearHiveConfirmation(): void {
  confirmed = false;
}

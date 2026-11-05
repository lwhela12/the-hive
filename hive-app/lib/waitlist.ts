type Interest = {
  email: string;
  name?: string | null;
  interested_in?: string | null;
  interest_slugs?: string[] | null;
};
type Member = { id: string; email: string; name?: string | null };

/** The scalar remains for older clients; the array preserves every explicit ask. */
export function waitlistInterests(person: Interest): string[] {
  return [...new Set([...(person.interest_slugs ?? []), person.interested_in ?? '']
    .map((slug) => slug.trim()).filter(Boolean))];
}

/** Owners' Waiting folders: moving up in one HIVE does not fulfil another ask. */
export function groupWaitlistByHive<T extends Interest>(
  rows: T[],
  hives: { id: string; slug: string }[],
  membersByHive: Record<string, Member[]>,
  invitesByHive: Record<string, { email: string }[]>,
): Record<string, T[]> {
  const waiting: Record<string, T[]> = Object.fromEntries(hives.map(({ id }) => [id, []]));
  const idsBySlug = new Map(hives.map(({ id, slug }) => [slug, id]));
  const members = Object.values(membersByHive).flat();
  const invites = Object.values(invitesByHive).flat();

  for (const person of rows) {
    const email = person.email.trim().toLowerCase();
    const exactName = person.name?.trim().toLocaleLowerCase();
    const interests = waitlistInterests(person);
    // A general /join request is fulfilled anywhere. Keep the existing unique
    // name match for people who joined with a second email address.
    if (!interests.length) {
      const matchingIds = new Set(members.filter((member) =>
        exactName && member.name?.trim().toLocaleLowerCase() === exactName
      ).map((member) => member.id));
      if (members.some((member) => member.email.trim().toLowerCase() === email)
        || invites.some((invite) => invite.email.trim().toLowerCase() === email)
        || matchingIds.size === 1) continue;
    }

    const targets = interests.length
      ? interests.map((slug) => idsBySlug.get(slug)).filter((id): id is string => !!id)
      : hives.map(({ id }) => id);
    for (const id of targets) {
      const hiveMembers = membersByHive[id] ?? [];
      const uniqueNameMatch = !!exactName && hiveMembers.filter((member) =>
        member.name?.trim().toLocaleLowerCase() === exactName
      ).length === 1;
      const already = hiveMembers.some((member) => member.email.trim().toLowerCase() === email)
        || (invitesByHive[id] ?? []).some((invite) => invite.email.trim().toLowerCase() === email)
        || uniqueNameMatch;
      if (!already) waiting[id].push(person);
    }
  }
  return waiting;
}

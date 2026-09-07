-- Link Tech HIVE's existing "Productizing your own life" thread to the
-- deliberately published, read-only teaching edition. Nat's private PYL
-- master remains the only live source of truth; this is not a second doctrine.

do $$
declare
  matching_posts integer;
begin
  select count(*)
    into matching_posts
  from public.board_posts post
  join public.board_categories category on category.id = post.category_id
  join public.communities community on community.id = post.community_id
  where community.slug = 'tech'
    and category.name = 'Things We Learned'
    and post.title = 'Productizing your own life';

  if matching_posts <> 1 then
    raise exception 'Expected exactly one Tech HIVE Things We Learned PYL thread; found %', matching_posts;
  end if;

  update public.board_posts post
  set content = post.content || $addition$

---

**Read the full playbook.** [Productizing Your Own Life — Tech HIVE Read-Only Edition](https://docs.google.com/document/d/1vCrgWxuFNkZ8xE0oRh6AKJFSn9k5Jz3vR8Fucpohxm8/view)

This is a stable teaching edition, not Nat's private live doctrine. Make your own copy to use the system. During Nat's live sessions, only the private master gets updated.$addition$
  from public.board_categories category,
       public.communities community
  where category.id = post.category_id
    and community.id = post.community_id
    and community.slug = 'tech'
    and category.name = 'Things We Learned'
    and post.title = 'Productizing your own life'
    and position(
      '1vCrgWxuFNkZ8xE0oRh6AKJFSn9k5Jz3vR8Fucpohxm8' in post.content
    ) = 0;
end
$$;

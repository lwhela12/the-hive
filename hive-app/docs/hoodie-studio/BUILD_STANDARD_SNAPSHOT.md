The Build Standard
Live source: https://docs.google.com/document/d/1SbSbEA5DhzVl9PKORMXQRRxJpU75Pb1vc7XGp5X0474/edit
Edit either one, then keep them matched. This local copy is what agents read.
How anything we build has to behave — every app, every website, every time.
Written by Claude on Nat's behalf, 2026-08-19, from Nat's voice memos.
Read me first
THE DOC is how to run Nat's life. This is how anything we ship has to behave. Different job, different doc, same shelf.
These are not hard rules. They are the good version of the answer we have already argued our way to, so the next build can start there instead of iterating to it again.
Breaking one is allowed. Breaking one quietly is not. If a project ignores a rule here, the reason goes on that project's Trello card, and then it is a decision instead of a miss.
Who reads this: every agent, before touching any of Nat's code. Follow AGENTS.md for the reading order; every repo's claude.md points at this standard.
1. Core
Walk it before you call it done.
Check the claim, not the code. If the copy says "it's on Home," open Home. If a link goes somewhere, follow it. Check it on a phone, and on a phone turned sideways.
Protect Nat’s active work surface. Visual verification never means taking over the browser or device Nat is using. Never attach to, inspect, navigate, type in, resize, foreground, or otherwise control her Chrome, Safari, tabs/profiles, or shared desktop browser windows. Use code, APIs, CLI checks, or a provably isolated agent-owned or headless browser that cannot steal focus, change her tabs, or affect her clipboard. If a signed-in or physical-device check requires her browser or device, leave it unverified and ask for a separate testing arrangement. The only exception is when Nat explicitly says she is not using that browser or device and grants permission for that specific task; permission never carries forward.
Know the MVP, and build only the MVP.
This is the most important one. Before anything else: what is the minimum viable product, and what is the flow through it. Then build that and nothing else.
Every other idea is a good idea. Write it down the moment it is said — immediately, so it is safe — and give it a later phase. It does not get built today.
One feature at a time, top to bottom, until it is airtight.
Finish one and prove it end to end before the next one starts. One feature that genuinely works is worth something. Ninety features that almost work are worth nothing at all.
Low cognition wins.
One idea per screen. If someone has to hold two things in their head to use it, it is not finished.
Change it in one place, change it everywhere.
A decision made once applies to every instance of the thing, not the one that got reported. Nat decides a rule once; the sweep happens in the same pass, and the reply says which files. She should never be the one finding instances two through six.
Start with the brand.
Step one of any project, before a screen exists: colours, logo, voice, message, and what the MVP actually is. Everything built afterwards is checked back against it. A project that starts building before it knows what it looks like spends the rest of its life being retrofitted.
Beauty matters.
It is a requirement, not a finishing touch.
Camping rules.
Leave it better than you found it. If it is dirty, clean it. If it is broken, fix it. If it is loose, tighten it. If we do not need it, get rid of it.
Say when something is on purpose.
Seed data, a closed signup, a dormant invite — label it in the app. Otherwise it reads as broken, and someone re-fixes it next month.
2. Every app has these
A feedback button.
Always reachable, sends a screenshot, lands in Nat's email. On every project with real users, without being asked.
The one exception is an app only Nat and Lucas use — Tally, Whelan Wellness. They can just say it out loud.
It lives inside the sign-in, never on the public site. Nat, 2026-09-07, taking the button off infinitextpublishing.com: "that's more of a 'once you're signed in' feature." A public page gets a Say Hello form; the feedback button is for people who are in.
A public site has a Sign in door. Top right, small, and it goes to the .app. "Like all the other sites … members log in here." (Nat, 2026-09-07.)
Every account-based product has two sign-in paths.
Show Continue with Google, then Or use your email → Email me a sign-in code. A person never needs Gmail or a Google Account to use the product. Email sign-in is passwordless by default; do not add passwords and password-recovery work unless a real product constraint requires them.
Send one-time codes through branded production email delivery, never a provider's test sender. Google and email-code sign-in for the same verified email must resolve to the same account, preserve its existing data, and never create a second empty identity. Before shipping, walk Google sign-in, email-code sign-in, sign-out, recovery, switching methods on an existing account, and cross-device access. A public or marketing-only site with no accounts is exempt; when its product has accounts elsewhere, it only needs the Sign in door to that product.
Sign-in method and permission to enter are separate decisions. Every account-based product must explicitly be one of: open enrollment, invite-only, owner/internal-only, or closed/prelaunch. The default is closed/prelaunch until Nat explicitly approves opening it. Adding Google or email-code sign-in must never weaken an invitation, allowlist, role, subscription, maintenance, or onboarding gate; both sign-in methods must pass through the same admission rules.
A "fresh version" banner, and a real hard refresh next to it.
When a new version is live, the app applies it on its own, the moment it's safe to (nobody's mid-keystroke) — that is the actual fix. The banner — HIVE's fresh honey, JJS's sunshine — is the fallback for the rare moment someone IS mid-keystroke, not the whole plan. Any button labelled "Refresh" has to force a real check right then, not just trust a background flag that might not have fired yet: HIVE's own Refresh pill quietly did nothing for weeks because it only read a flag instead of forcing a look (2026-08-25). HIVE's lib/hooks/useAppUpdate.ts is the reference — copy it, don't rebuild it.
Never give the user homework to make an action safe.
If an update, navigation, payment, or destructive action depends on another step, the product performs that step, confirms it is safe, and continues. Put any choice and its safety action together. Never tell someone to go find Save and then come back.
A "what's new" log.
Show the page title once. Group changes underneath by date, written in the member's voice and saying what they can now do. On the dashboard, show updates the member has not seen yet. Fixes included. No release slogans, mood adjectives, summary paragraph, or second "What's new" heading. Update the log in the same commit as the change, never afterwards.
A left nav with three sizes.
Full, narrow, collapsed. Nat's preference on every app that has a side nav. The order is always: size control; logo and company name; signed-in profile; current working context; navigation destinations. The size control is always the first, topmost element in the rail and occupies its own row. Nothing may sit above it or beside it. The company, signed-in profile, current working context, and every destination begin underneath it, in that order. The hierarchy always narrows down: company → person → current brand or workspace → the destination or item in focus. Sign out belongs at the bottom of the rail, separate from the profile; compact form may be icon-only while retaining an accessible name. Full and narrow rails show the full company name—never a cropped, ellipsized, or half-visible wordmark. This placement stays identical in big, medium, and small sizes on phones and computers. The arrow points back/left when the next press makes the rail smaller, and forward/right only when the next press opens the big rail.
Use the signed-in person's real account photo in the profile spot whenever the identity provider supplies one. For Google sign-in, use the Google/Gmail profile photo. Do not show a generic avatar when a real account photo is available; use a neutral fallback only when the identity provider has none.
The same nav on a phone as on a computer.
Added 2026-09-04, after Nellie shipped a left rail on a laptop and a row of tabs
across the top on a phone. Nat: *"I don't like that these don't look the same...
we want same orientation on phone and computer."*
One shape, both places. The rail is the standard — big, medium, small — and a
phone gets the same rail, just resting at a narrower size. Not a top bar, not a
hamburger, not a second navigation to learn. HIVE's
components/navigation/SideRail.tsx is the version we already argued our way
to for sizing, persistence, accessibility, and phone behavior, but not its current header order. The topmost-control rule above wins:
the size control sits alone in the first row at every size, followed by the brand, the signed-in profile, the current working context, and then the navigation. The hierarchy always narrows down: company → person → current brand or workspace → the destination or item in focus. Sign out sits at the bottom of the rail, apart from the profile. The smallest size still carries every name for a screen reader even though it draws none.
Real empty states.
An empty list says what this is and what to do next. Never a blank panel.
Every screen explains itself.
Someone who has never seen that screen should land on it and know what it is and what to do next, without anyone telling them. If they would have to ask, the screen is not finished.
One door, many paths to it.
One place where the important thing actually happens — never two competing half-versions of it. But lots of ways to reach that place. See "Many paths, one campfire.
The public form, two shapes (Nat, 7 Sep 2026). A product that is not yet live shows the coming-soon card, copied exactly from storymantle.com and restyled per brand: kicker PRIVATE TESTING · "Coming soon." · two lines ("<Product> is in private testing with a small circle of <people>. Leave your email and you'll hear the moment it opens.") · Email · "What would make this worth it to you?" (Optional) · one button "Tell me when it's ready" · "Already have a seat? Sign in is your door." where a sign-in exists. Nothing else on the page asks for anything. Mail subject Wait list — Product (+ · wish). A product that IS live shows the one contact form: Name, Email, "How can we help?" with a short list (Wishlist: something I'd love to see · A question · Just saying hello · at most one topic that site truly needs), Message, Send; subject Wish — Product, Question — Product, Hello — Product. Both go to the studio inbox with Nat on copy, reply-to the visitor, and the weekly tally counts sign-ups and wishes from the subjects, so nobody reads email to know the numbers. Nat's approval of the coming-soon shape: "this one is friggin perfect, the most concise, put it everywhere."
3. It fits every screen
The layout adjusts itself, always.
Every person is on a different screen. Chrome and Safari now have an expanded browser bar and a collapsed one, and the app has to survive both — the same page, mid-scroll, as the bar slides away.
The side nav's three sizes are part of that.
Full, narrow, collapsed, picked to fit the space it has.
Use the space you have.
Fill the screen a person actually has before you ask them to scroll. Scrolling should mean there is genuinely more, not that the layout wasted the room it was given.
A back-to-top button on phones.
Every scrolling mobile page has a floating Back to top control in the bottom-right corner once the reader has moved down the page. Use a drawn icon with an accessible name and a touch target of at least 44 pixels. Keep it clear of content, other controls, and the phone’s safe area. It returns to the page top, respects reduced-motion preferences, and hides when already at the top. Check it in portrait and landscape, with the browser bar expanded and collapsed.
Nothing ever overlaps.
Not at any width, not at any browser-bar state, not on a phone turned sideways. If two things can touch, that is a bug, not a small screen.
The two ways this actually happens (Jasmine Jammin Sprouts, 2026-08-25 — a fold arrow landing on top of its own edit pencil, which survived a first fix because the real cause wasn't found the first time): reserved space declared on the wrong element — a parent's padding doesn't protect a child pushed to a corner two levels further down; the reservation has to live on the element that actually contains the pushed thing — and text inside a flex row that was never told it is allowed to shrink, so it overflows straight past any padding reserved next to it no matter how generous. Both read as fixed from the CSS alone. Confirm by resizing the actual window, not by reading the rule.
4. Movement tells people it's working
When nothing moves, people assume it's broken. They don't assume they did it wrong. So every input gets an answer they can see.
Scrolling gets a bounce at the end.
It says the app read the scroll and there is simply nothing below. Without it, the end of a list looks like a frozen screen.
A button that changes nothing still reacts.
Tap Home while already on Home and the button presses in and the screen refreshes. Otherwise it reads as a broken button instead of "you're already here."
Every tap acknowledges itself, then shows it's thinking, then says it worked.
Three beats, not two — added by Nat 2026-09-04.
1. The tap registered — the button presses in, right now.
2. Work is happening — a spinner, a moving thing, a label that changed to "Sending…". Something has to actually move, or the person assumes it died.
3. It worked — a short, warm line where they can see it. "Sent! Thank you." Not a silent return to normal.
Anything that has to go and think — sending an enquiry, saving, uploading, syncing — gets all three. A person who can't tell the difference between beats taps again, and now you have two of whatever it was.
Talk-to-text shows the words as they arrive.
Words populating as you speak, or a listening bubble. The person has to see it writing down what they're saying while they say it.
5. One feature looks the same everywhere
Pick the edit button once. The X, the back arrow, the microphone, the attachment clip — whatever it is, every single place it appears it is the same shape, the same spot, and does the same thing.
A feature that looks different in two screens is two features to learn.
6. Many paths, one campfire
Apple's trick: there are always several ways to get to the same place. A person who tries the thing that makes sense to them arrives, instead of having to learn one exact in-and-out route.
Every important destination has more than one way in.
A menu item and a tile and a link inside the thing that mentions it. Different people reach for different ones.
Nobody should have to memorise a path.
If there is exactly one route to something and a person guesses wrong, the app has told them no. Give them a second and a third way to be right.
They all land in the same place.
Many paths, one campfire — not several slightly different versions of the same screen.
7. Names and addresses
Same name everywhere.
The URL, the words on the screen, and the words we say to Nat all match. She clicks through rather than pasting links, so a name that only exists in code is a dead end.
`.com` is public, `.app` is inside — when both exist.
JJS is the pattern: jasminesjamminsprouts.com out front, jamminsprouts.app once you're in.
When only one is available, it does both jobs and that's fine — HIVE lives at app.the-hive.app, Content Creature at contentcreature.app, because the .com wasn't there to buy.
Every new site or app posts itself to Saved You a Seat.
The portfolio is part of shipping, not a thing we remember later. Every entry names the real role — never implies solo authorship.
Public-facing footers cross-link.
Put the SYAS plug and copyright on public sites and signed-out entry pages such as Sign in. "We build," not "Nat builds." Do not place a promotional footer inside a signed-in member app: it uses valuable working space and advertises to people who are already inside. Center public and signed-out footers on computer and phone. Promotional footer links have no resting underline; the underline appears only on hover or keyboard focus.
8. Words on the screen
One sentence per line.
If display copy wraps to two lines, give it a real break. Sentence two never starts mid-line.
Sixty percent less text.
Whatever is written, most of the time it can lose more than half and say the same thing. Nat reads at a glance; a paragraph is where she stops reading. Boxes, short lines, headings that carry the point on their own.
Never a block of text.
More than one idea in a row gets bullets, not sentences run together. A slide, a card, an email — if it reads as a paragraph, break it into short lines, a header, or a bulleted list so the eye has somewhere to land. Cutting the word count is not enough on its own; a short paragraph is still a paragraph.
Say what it is.
Never "not this, not that, just this." Say what the thing is and stop.
One screen gets one title.
Name the page once. Do not repeat that name in a card, panel, accordion, or section immediately beneath it. If the title already explains the screen, stop. Do not add a subtitle that restates or explains the title.
Write affirmatively.
Lead with the invitation, possibility, or action. Copy carries its point without cushioning qualifiers such as “small,” “tiny,” or “calm” unless a source fact makes one essential.
Plain English.
No unexplained dev words anywhere a person can see — and none in chat with Nat either.
Gold serif italic means "coming soon."
Only that. Anything that actually exists gets plain mono.
Inclusion is a section, not a footnote.
LGBTQIA+, neurodivergence, models who don't usually get shown. It's a stated brand value, so it gets first-class space.
9. Paywalls and money
People get to look around before they pay.
Click through the real UI first. Always.
Seed the look-around with fake data.
A little onboarding wizard: here's what you'd do, then this, then this. Real-feeling data so the UI can be judged. Then the paywall.
No prices on a site until Nat says the number.
Money names both sides.
Any financial calendar item, reminder, bill, debt, transfer, or planned obligation shows what is being paid and where the money comes from. Use friendly account names plus masked last four only; never full account numbers. If either side is unknown, say Not verified yet instead of guessing. Apply the same shape across every screen, calendar item, notification, automation, and stored obligation.
10. Email that goes out of an app
Nat approves the TEMPLATE once. She approves fresh WORDS every time.
Amended 2026-09-04, by Nat, and the old rule is kept below because the reason it existed still decides which half a given email falls into.
It used to read: "Nothing mass-sends on any project until she has seen that particular send, rendered, and said approved. A monthly email is twelve approvals a year, not one." That was right while a machine was composing prose — the check-in emails were built at 6am out of meeting rows and dates, and somebody had to read what the machine had written.
Her diagnosis of why it stopped being right: "a lot of the times I'm reviewing, I'm tweaking the email, do this, do this, do this. And so that's just a lame step." The tweaking was the tell. An email you edit every month is an email whose shape was never settled.
So the line moved to where the risk actually is:
- A template — the same words every time, with a name and a date slotted in. "You have a message." "Your check-in is ready." "Somebody commented on your board." She reads them all once, approves them once, and they send themselves after that. Twelve identical letters need one approval, not twelve.
- Fresh words she wrote — a newsletter, a note to a HIVE. Still previews, every single time. There is nothing to approve in advance because it does not exist yet.
- Fresh words a MACHINE wrote. Still previews, every single time, and it is worth asking first whether it should be a template instead.
A template cannot quietly become fresh words. The moment an email starts assembling sentences per send, it is back in the second group and needs a preview.
A notification email says its KIND and nothing else.
Added 2026-09-04, by Nat, the same day as the amendment above and for the same reason it kept going wrong: "the name of the game here... is generic. Let's just leave it generic for right now, i think thats the better, safer, less likely to break way."
Not which community or HIVE, not which board or room or thread, not who wrote it, not a word of what they said. "Somebody tagged you." "You have a meeting tomorrow." The BUTTON carries the specifics, because the button lands behind the login.
Three reasons, and all three are the point:
- It cannot be wrong, because there is nothing in it to be wrong about. The two specimens that started this named a HIVE the letter no longer belongs to, and a board that HIVE does not have.
- It cannot leak. A subject line sits on a lock screen and in a mail list somebody can read over your shoulder. Everything the app keeps behind a login — who you are grouped with, what any of you said — an inbox does not.
- It stays one letter. Somebody in three groups gets one "somebody tagged you", not three that give away the count.
The words live in ONE place per app, never per sender. In-app notifications and the dots stay specific: you are already past the login when you read one.
Same name everywhere applies to a letter too.
The subject, the name on the approval page, and the name on the screen all say one thing. "Before we meet" is the check-in; "You have a meeting tomorrow" is what the letter says. A letter's words are never a second name for the thing it opens.
The approval copy has to BE the letter.
A page that renders templates for approval renders the real builder, with the reader's real name in it. A specimen that says "Hi there," where the real one says "Hi Nat," is an approval of something nobody receives.
Every one still has its own off switch, and the switch is the member's — never the sender's.
Nothing sends while people are in the room. A meeting is the hour everybody is already inside the app together; mail about it lands after.
The one-morning pattern.
Preview lands 6am on send day. She has three hours. She presses send by 9am.
Three doors in the preview, never a one-tap send link.
Send it, change it, skip it.
`send.<domain>` is a return path, never a from-address.
All the sites email from the one Saved You a Seat Resend team.
Never name a bot trap "company."
Chrome autofills it, real people trip their own honeypot, and the form dies silently.
11. Shipping
Always deploy.
Commit, push, deploy — every project, every session, unasked. Nat reviews in the running app, not in a diff. Env-var changes need a redeploy too.
Full build before any UI push.
And add named paths, never git add -A, while another agent is still writing files.
Curl every domain after a deploy.
Add domains with vercel domains add. alias set inherits deployment protection and hides the site behind a Vercel login.
Get Nat looking at the running app early.
Agents read code and can't see the screen. Half the real bugs only show up to a person clicking.
No hanging chads.
It's fixed, or Nat deferred it. An "open engineering" list handed forward is not a finish.
12. Trackers
Solo project: Trello card only. Team project: Task Tracker and POP.
Never both on a solo project.
Phases, not "one more thing."
Name the MVP, date the rest, list what's already done. New ideas mid-build get added to the list with a trigger, not built today.
Turn it dark, don't delete it.
A done item comes off the list.
13. The standardization pass
Run this when a project is opened, not as a retrofit sprint. Every miss becomes a numbered item on that project's Trello card, in the MVP phase.
1. Feedback button — present inside the sign-in, sends a screenshot, arrives in Nat's inbox. Send one and check. Skip on an app only Nat and Lucas use. Not on the public site.
2. Fresh-version handling — updates apply themselves when it's safe to; the banner and any Refresh button are the fallback, and the Refresh button actually forces a check rather than trusting a stale flag.
3. What's new log — one page title, changes grouped by date, unseen dashboard updates first, and current as of the last thing shipped.
4. Left nav — three sizes, and the SAME nav on a phone as
   on a computer. The order at every size is: size control in its own top row; logo and company name; signed-in profile; current working context; navigation destinations. Sign out sits separately at the bottom. Big and medium point back/left to shrink; small points forward/right to open big. Open it on both and check they are the same shape.
5. Empty states — open every list with no data in it.
6. Every screen explains itself with one visible title — no repeated page name or subtitle that merely explains the title. Land on each one as a stranger and see if you know what to do.
7. Names — the URL, the screen, and the card all say the same word.
8. Domains — .com public and .app inside, or a written reason there's only one. The public site has a Sign in link to the .app.
9. On the SYAS portfolio, with the real role named.
10. Footer — SYAS plug and copyright on public sites and signed-out entry pages only, never inside the signed-in member app; centered on computer and phone, with promotional links underlined only on hover or keyboard focus.
11. Copy — one sentence per line, affirmative framing, no cushioning qualifiers such as "small," "tiny," or "calm" unless a source fact requires one, no jargon, gold italic only on things that don't exist yet.
12. Paywall — free click-around and a fake-data wizard before the wall.
13. Automatic emails — the templates are read and approved once, together, on a page that renders the real ones; anything written fresh still previews before it sends. Three doors, no one-tap send, a switch per kind, and nothing goes out while a meeting is running.
14. Phone, and phone turned sideways.
15. Resize the window slowly from wide to narrow, and watch the browser bar expand and collapse. Nothing overlaps at any point.
16. Scroll to the bottom of a list — it bounces.
17. Tap a button that goes nowhere, like Home while on Home. It reacts.
18. Tap something slow. The tap is acknowledged, then something moves to show it is thinking, then a short
    friendly line says it worked. All three beats, every time.
19. Talk-to-text shows words appearing as you speak.
20. The same feature — edit, X, back, microphone, attachment — looks and behaves identically everywhere it appears.
21. Colours, logo, voice and message still match the brand guideline.
22. Read each screen at a glance. If you had to read a paragraph to know what it was, cut it — and if what's left is still more than one idea in a row, break it into bullets or a header, not shorter sentences run together.
23. Nothing scrolls that could have fitted in the space the screen already had.
24. Every important destination has at least two ways in, and they land in the same place.
25. The MVP is written down, and everything not in it sits on a dated later phase.
26. Anything changed this pass was changed everywhere it appears, not only where it was reported.
27. Camping rules — nothing dirty, broken, loose or unused left behind.
28. Deployed, and every domain curls clean.
29. Mobile back-to-top — bottom-right, reachable after scrolling, clear of content and safe areas, returns to the top and respects reduced motion.
30. Authentication and admission — when an account door is enabled, the product offers Google and passwordless email-code sign-in; both preserve one account and its data for the same verified email. Record whether the product is open enrollment, invite-only, owner/internal-only, or closed/prelaunch, and prove neither sign-in method bypasses that gate. Check branded production delivery, sign-in, sign-out, recovery, method switching and cross-device access. Marketing-only sites without accounts are exempt.
14. Copy these, don't rebuild them
The version we already argued our way to:
- Feedback — nellie/src/components/feedback-form.tsx, HIVE/the-HIVE/hive-app/app/(app)/app-feedback.tsx, Jasmine Jammin Sprouts/sprouts-app/app/feedback/page.tsx
- Fresh-version handling (auto-apply + forced refresh + banner fallback) — HIVE/the-HIVE/hive-app/lib/hooks/useAppUpdate.ts is the full pattern as of 2026-08-25: updates apply themselves silently unless someone's mid-keystroke, the Refresh button forces a real check instead of trusting a background flag, and the banner is the fallback. nellie/src/components/version-refresh-banner.tsx is banner-only — a simpler reference, not the standard.
- What's new log — HIVE/the-HIVE/hive-app/lib/appNews.ts, Jasmine Jammin Sprouts/sprouts-app/lib/appNews.ts with components/AppNewsPanel.tsx
- Click-by-click walkthrough — Productization_of_Nats_Life/PATTERN_click_by_click_walkthrough.md
Known gaps as of 2026-08-19, to be picked up when each project is next opened:
- Content Creature — feedback button, version banner, what's-new log. All three.
- Yours CRM — feedback button, version banner, what's-new log. All three.
- Tally — version banner and what's-new log. No feedback button; it's Nat and Lucas only.
- Whelan Wellness — version banner and what's-new log. No feedback button; it's Nat only.
Simple controls stay simple-sized.
Added by Nat, 2026-09-05: a simple form must not stretch across a desktop just because the screen is wide.
Cap and center the whole editor, not merely its Save button. Size short inputs, date/time pickers, toggles and ordinary buttons to their content or a sensible compact width; reserve wide fields for content that needs it.
On phones, adapt to the available width without overflow, and keep accessible touch targets. Check desktop, phone and sideways phone across every create/edit version of the same feature.
Show and accept human AM/PM times for everyone: 6:00 PM, never raw 18:00:00, seconds, or HH:mm:ss placeholders. Optional time fields stay blank unless a meaningful hint such as 6:00 PM is needed; never fill blanks with invented times. Keep canonical 24-hour storage and timezone handling unchanged behind the interface. Validate invalid times and backwards windows.
Core addition — build it for Nat first:
Build it for Nat first. Sell that exact version.
Every app works perfectly for Nat's own life before anyone else sees it: her team, her key, private, no paywall, for a month or two. Once it is improving her life and doing good work, that exact version goes on sale, priced from the measured spend. After that, the feedback button decides what gets built next. Nothing is pre-built for an imagined stranger. (Nat, 7 Sep 2026.)
15. Commerce listing readiness
A marketplace listing is not ready because metadata saved, a mockup generated, or an agent wrote notes. Verify the actual physical-product mockups, the buyer personalization flow, the variant stock, and the full economics.
For The Nat Effect POD rebuilds, work one product through both review gates before starting the next. Gate 1 is a hidden Printify review; Gate 2 is an Etsy-draft review. Each must be opened in Nat’s right-side review panel and must pause for explicit approval. A later gate never authorizes an earlier missing check.

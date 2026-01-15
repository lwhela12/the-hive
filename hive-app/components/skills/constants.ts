// Fun eclectic mix - not organized by category, meant to be delightful to scroll
export const PREDEFINED_SKILLS = [
  // Whimsical & Creative
  'Ocean Boiling',
  'Starship Navigation',
  'Time Travel Planning',
  'Dragon Taming',
  'Professional Napping',
  'Cloud Watching',
  'Parallel Universe Hopping',

  // Intimacy & Wellness
  'Sex Therapy',
  'Couples Counseling',
  'Intimacy Coaching',

  // Aerial & Movement Arts
  'Aerial Acrobatics',
  'Pole Dancing',
  'Contortion',
  'Trapeze',
  'Aerial Silks',
  'Handstands',

  // Crafts
  'Crocheting',
  'Knitting',
  'Embroidery',
  'Macramé',
  'Sewing',

  // Food & Drink
  'Cooking',
  'Meal Prep',
  'Baking',
  'Fermentation',
  'Cocktail Crafting',
  'Coffee Snobbery',
  'Tea Ceremony',

  // Nature & Plants
  'Gardening',
  'Composting',
  'Beekeeping',
  'Plant Parenting',
  'Foraging',

  // Creative Arts
  'Photography',
  'Video Editing',
  'Graphic Design',
  'Writing',
  'Storytelling',
  'Poetry',
  'Painting',
  'Pottery',

  // Healing & Body Work
  'Massage',
  'Reiki',
  'Sound Healing',
  'Yoga',
  'Meditation',
  'Breathwork',

  // Practical Magic
  'Home Repairs',
  'Furniture Building',
  'Painting Walls',
  'Tax Wizardry',
  'Spreadsheet Sorcery',
  'Budget Magic',

  // Animals & Companions
  'Dog Whispering',
  'Cat Herding',
  'Pet Photography',
  'Animal Training',

  // Social Superpowers
  'Karaoke Domination',
  'Dance Floor Presence',
  'Hype Person',
  'Deep Listening',
  'Tough Love Delivery',
  'Pep Talks',
  'Wingman Services',

  // Life Skills
  'Moving Heavy Things',
  'Assembling IKEA',
  'Parallel Parking',
  'Gift Wrapping',
  'Party Planning',
  'Surprise Orchestration',

  // Mystical Arts
  'Tarot Reading',
  'Astrology',
  'Dream Interpretation',
  'Crystal Collecting',

  // Tech & Professional
  'Coding',
  'Web Design',
  'App Building',
  'Resume Polishing',
  'Interview Prep',
  'Salary Negotiation',
  'Language Teaching',
  'Accent Coaching',
  'Proofreading',

  // Music & Performance
  'DJing',
  'Guitar Playing',
  'Singing',
  'Voice Acting',
  'Stand-up Comedy',

  // Adventure & Sports
  'Rock Climbing',
  'Surfing',
  'Skateboarding',
  'Camping',
  'Trail Finding',
];

// Shuffle helper - skills display in random order each time modal opens
export const shuffleSkills = (skills: string[]): string[] =>
  [...skills].sort(() => Math.random() - 0.5);

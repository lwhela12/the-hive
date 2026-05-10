export interface SkillCategory {
  label: string;
  emoji: string;
  skills: string[];
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    label: 'Creative',
    emoji: '🎨',
    skills: [
      'Writing', 'Storytelling', 'Copywriting', 'Poetry', 'Journaling',
      'Graphic Design', 'Illustration', 'Painting', 'Drawing', 'Watercolor',
      'Collage', 'Embroidery', 'Crocheting', 'Knitting', 'Sewing',
      'Ceramics', 'Jewelry Making', 'Candle Making', 'Photography',
      'Video Editing', 'Film Making', 'Animation', 'Interior Decorating',
      'Floral Arranging', 'Scrapbooking', 'Calligraphy',
    ],
  },
  {
    label: 'Music & Performance',
    emoji: '🎤',
    skills: [
      'Singing', 'Guitar', 'Piano', 'Drums', 'DJ-ing',
      'Dancing', 'Pole Dancing', 'Choreography', 'Acting',
      'Stand-up Comedy', 'Improv', 'Public Speaking', 'Karaoke Domination',
      'Hosting & Emceeing', 'Podcast Production',
    ],
  },
  {
    label: 'Food & Hosting',
    emoji: '🍳',
    skills: [
      'Cooking', 'Baking', 'Meal Prep', 'Cocktail Making', 'Wine Pairing',
      'Cake Decorating', 'Cheesemaking', 'Fermentation', 'BBQ & Grilling',
      'Party Planning', 'Event Hosting', 'Table Setting', 'Gift Giving',
    ],
  },
  {
    label: 'Body & Wellness',
    emoji: '🧘',
    skills: [
      'Yoga', 'Meditation', 'Personal Training', 'Nutrition Coaching',
      'Massage', 'Breathwork', 'Running', 'Hiking', 'Cycling',
      'Swimming', 'Rock Climbing', 'Camping', 'Stretching & Mobility',
      'Herbalism', 'Reiki',
    ],
  },
  {
    label: 'Mind & Learning',
    emoji: '🧠',
    skills: [
      'Research', 'Tutoring', 'Teaching', 'Language Learning',
      'Speed Reading', 'Note-taking Systems', 'Memory Techniques',
      'Debate', 'Philosophy', 'Astrology', 'Dream Interpretation',
      'Tarot Reading', 'Numerology',
    ],
  },
  {
    label: 'Tech & Digital',
    emoji: '💻',
    skills: [
      'Coding', 'Web Design', 'App Development', 'Data Analysis',
      'Spreadsheet Sorcery', 'AI Prompting', 'Social Media Strategy',
      'SEO', 'Email Marketing', 'Podcast Editing', 'Photo Editing',
      'Canva Design', '3D Printing',
    ],
  },
  {
    label: 'Career & Business',
    emoji: '💼',
    skills: [
      'Resume Polishing', 'Interview Prep', 'Salary Negotiation',
      'Business Strategy', 'Project Management', 'Public Relations',
      'Fundraising', 'Grant Writing', 'Legal Basics', 'Accounting Basics',
      'Budget Magic', 'Investing 101', 'Real Estate Know-how',
    ],
  },
  {
    label: 'People & Heart',
    emoji: '🤝',
    skills: [
      'Active Listening', 'Conflict Resolution', 'Hype Person',
      'Pep Talks', 'Tough Love Delivery', 'Life Coaching',
      'Therapy-adjacent Wisdom', 'Matchmaking', 'Wingman Services',
      'Networking', 'Community Building', 'Mentoring',
    ],
  },
  {
    label: 'Practical Life',
    emoji: '🔧',
    skills: [
      'Painting Walls', 'Basic Home Repair', 'IKEA Assembly',
      'Moving Help', 'Decluttering & Organizing', 'Plant Parenting',
      'Car Basics', 'Driving (have a truck!)', 'Sewing & Mending',
      'Thrift Shopping', 'Garage Sales', 'Proofreading', 'Editing',
    ],
  },
  {
    label: 'Adventure & Fun',
    emoji: '✨',
    skills: [
      'Road Trips', 'Travel Planning', 'Cloud Watching',
      'Star Gazing', 'Foraging', 'Treasure Hunting',
      'Escape Rooms', 'Board Games', 'Trivia', 'Karaoke',
      'Time Travel Planning', 'Parallel Universe Hopping',
    ],
  },
];

export const ALL_SKILLS: string[] = SKILL_CATEGORIES.flatMap(c => c.skills);

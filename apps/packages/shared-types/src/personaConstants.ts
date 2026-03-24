import { PersonalityTrait, ExpertiseDomain } from './personaAdvanced';

// Core personality traits available for cross-breeding
export const personalityTraits: Record<string, PersonalityTrait> = {
  analytical: { weight: 1, description: 'Approaches problems through systematic analysis' },
  creative: { weight: 1, description: 'Generates innovative and original solutions' },
  pragmatic: { weight: 1, description: 'Focuses on practical, workable solutions' },
  empathetic: { weight: 1, description: 'Considers human emotions and experiences' },
  strategic: { weight: 1, description: 'Thinks long-term and big-picture' },
  detail_oriented: { weight: 1, description: 'Pays close attention to specifics and nuances' },
  questioning: { weight: 1, description: 'Challenges assumptions and asks probing questions' },
  collaborative: { weight: 1, description: 'Works well with others and builds consensus' },
  innovative: { weight: 1, description: 'Seeks new approaches and breakthrough thinking' },
  systematic: { weight: 1, description: 'Follows structured, methodical approaches' },
  intuitive: { weight: 1, description: 'Relies on instinct and pattern recognition' },
  logical: { weight: 1, description: 'Uses clear reasoning and evidence-based thinking' },
  passionate: { weight: 1, description: 'Brings enthusiasm and energy to discussions' },
  cautious: { weight: 1, description: 'Carefully considers risks and potential issues' },
  bold: { weight: 1, description: 'Takes calculated risks and pushes boundaries' },
};

// Expertise domains available for cross-breeding
export const expertiseDomains: Record<string, ExpertiseDomain> = {
  // Technical
  software_engineering: {
    category: 'Technical',
    description: 'Programming, architecture, and development',
  },
  data_science: {
    category: 'Technical',
    description: 'Analytics, machine learning, and data insights',
  },
  cybersecurity: { category: 'Technical', description: 'Security protocols and threat analysis' },
  ai_machine_learning: {
    category: 'Technical',
    description: 'Artificial intelligence and ML systems',
  },

  // Business
  strategy: { category: 'Business', description: 'Strategic planning and competitive analysis' },
  marketing: { category: 'Business', description: 'Brand strategy and market positioning' },
  finance: { category: 'Business', description: 'Financial analysis and resource allocation' },
  operations: { category: 'Business', description: 'Process optimization and efficiency' },

  // Social Sciences
  psychology: {
    category: 'Social Sciences',
    description: 'Human behavior and cognitive processes',
  },
  sociology: { category: 'Social Sciences', description: 'Social structures and group dynamics' },
  anthropology: { category: 'Social Sciences', description: 'Cultural analysis and human society' },
  education: { category: 'Social Sciences', description: 'Learning and knowledge transfer' },

  // Natural Sciences
  biology: { category: 'Natural Sciences', description: 'Life sciences and biological systems' },
  environmental_science: {
    category: 'Natural Sciences',
    description: 'Ecology and environmental impact',
  },
  physics: {
    category: 'Natural Sciences',
    description: 'Physical systems and mathematical modeling',
  },
  chemistry: {
    category: 'Natural Sciences',
    description: 'Chemical processes and materials science',
  },

  // Humanities
  philosophy: { category: 'Humanities', description: 'Ethics, logic, and fundamental questions' },
  history: { category: 'Humanities', description: 'Historical context and patterns' },
  literature: { category: 'Humanities', description: 'Communication and narrative structure' },
  ethics: { category: 'Humanities', description: 'Moral reasoning and ethical frameworks' },

  // Creative
  design: { category: 'Creative', description: 'Visual design and user experience' },
  creative_writing: { category: 'Creative', description: 'Storytelling and creative expression' },
  innovation: { category: 'Creative', description: 'Breakthrough thinking and ideation' },
  art: { category: 'Creative', description: 'Artistic expression and aesthetic judgment' },

  // Professional
  law: { category: 'Professional', description: 'Legal frameworks and compliance' },
  medicine: { category: 'Professional', description: 'Healthcare and medical analysis' },
  engineering: { category: 'Professional', description: 'Technical engineering and systems' },
  consulting: { category: 'Professional', description: 'Problem-solving and advisory skills' },
};

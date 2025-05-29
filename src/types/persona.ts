export interface PersonaTrait {
  name: string;
  description: string;
  strength: number; // 1-10 scale
}

// Tone and style modifiers for natural conversation
export type PersonaTone = 'concise' | 'verbose' | 'analytical' | 'casual' | 'empathetic' | 'humorous' | 'cautious' | 'optimistic';
export type PersonaStyle = 'structured' | 'freeform' | 'inquisitive' | 'decisive' | 'collaborative' | 'authoritative';
export type PersonaEnergyLevel = 'low' | 'moderate' | 'high' | 'dynamic';

export interface Persona {
  id: string;
  name: string;
  role: string;
  description: string;
  traits: PersonaTrait[];
  expertise: string[];
  background: string;
  systemPrompt: string;
  // New conversational characteristics
  tone: PersonaTone;
  style: PersonaStyle;
  energyLevel: PersonaEnergyLevel;
  chattiness: number; // 0.1-1.0 scale - how likely to contribute
  empathyLevel: number; // 0.1-1.0 scale - how much they reflect on emotional/human impact
}

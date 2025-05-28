export interface PersonaTrait {
  name: string;
  description: string;
  strength: number; // 1-10 scale
}

export interface Persona {
  id: string;
  name: string;
  role: string;
  description: string;
  traits: PersonaTrait[];
  expertise: string[];
  background: string;
  systemPrompt: string;
}

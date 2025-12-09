import { LocationData } from './LocationService';

export interface WallpaperImage {
  id: string;
  url: string;
  title: string;
  description?: string;
  author?: string;
  source?: string;
  keywords?: string[];
}

export interface WallpaperTheme {
  id: string;
  name: string;
  description: string;
  images: WallpaperImage[];
  slideshow: boolean;
  interval: number; // in seconds
  category: 'nature' | 'space' | 'urban' | 'abstract' | 'landscape';
}

export interface WallpaperPreferences {
  currentTheme: string;
  slideshowEnabled: boolean;
  intervalSeconds: number;
  randomOrder: boolean;
  locationBased: boolean;
  quality: 'high' | 'medium' | 'low';
}

class WallpaperService {
  private static instance: WallpaperService;
  private preferences: WallpaperPreferences;
  private currentImageIndex: number = 0;
  private slideshowTimer: NodeJS.Timeout | null = null;
  private currentTheme: WallpaperTheme | null = null;
  private listeners: Set<(image: WallpaperImage) => void> = new Set();

  private constructor() {
    this.preferences = this.loadPreferences();
    this.initializeTheme();
  }

  static getInstance(): WallpaperService {
    if (!WallpaperService.instance) {
      WallpaperService.instance = new WallpaperService();
    }
    return WallpaperService.instance;
  }

  private loadPreferences(): WallpaperPreferences {
    const saved = localStorage.getItem('wallpaper-preferences');
    return saved
      ? JSON.parse(saved)
      : {
          currentTheme: 'space',
          slideshowEnabled: true,
          intervalSeconds: 300, // 5 minutes
          randomOrder: false,
          locationBased: false,
          quality: 'high',
        };
  }

  private savePreferences(): void {
    localStorage.setItem('wallpaper-preferences', JSON.stringify(this.preferences));
  }

  private initializeTheme(): void {
    const theme = this.getThemeById(this.preferences.currentTheme);
    if (theme) {
      this.setTheme(theme);
    }
  }

  // High-quality image collections
  private getThemes(): WallpaperTheme[] {
    return [
      {
        id: 'space',
        name: 'Space - James Webb Telescope',
        description: 'Latest stunning images from the James Webb Space Telescope and deep space',
        category: 'space',
        slideshow: true,
        interval: 300,
        images: [
          {
            id: 'jwst-1',
            url: 'https://images.unsplash.com/photo-1614728263952-84ea256f9679?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Pillars of Creation',
            description: 'James Webb Space Telescope capture of the iconic star-forming region',
            author: 'NASA/ESA/CSA',
            keywords: ['space', 'nebula', 'stars', 'webb', 'telescope'],
          },
          {
            id: 'jwst-2',
            url: 'https://images.unsplash.com/photo-1639128558586-602e11045e6c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Carina Nebula',
            description: 'Cosmic landscape of star birth in unprecedented detail',
            author: 'NASA/ESA/CSA',
            keywords: ['nebula', 'stars', 'cosmic', 'formation'],
          },
          {
            id: 'jwst-3',
            url: 'https://images.unsplash.com/photo-1610296669228-602fa827fc1f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Galaxy Cluster',
            description: 'Deep field view showing thousands of galaxies',
            author: 'NASA/ESA/CSA',
            keywords: ['galaxy', 'deep', 'field', 'cluster'],
          },
          {
            id: 'jwst-4',
            url: 'https://images.unsplash.com/photo-1608178398319-48f814d0750c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Planetary Nebula',
            description: 'Dying star creating beautiful cosmic structures',
            author: 'NASA/ESA/CSA',
            keywords: ['planetary', 'nebula', 'dying', 'star'],
          },
          {
            id: 'jwst-5',
            url: 'https://images.unsplash.com/photo-1666214172239-0b7e4b77c8b7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Exoplanet System',
            description: 'Distant worlds orbiting alien stars',
            author: 'NASA/ESA/CSA',
            keywords: ['exoplanet', 'system', 'alien', 'worlds'],
          },
        ],
      },
      {
        id: 'mountains',
        name: "Mountain Ranges - World's Highest Peaks",
        description: "Majestic views of the world's highest mountain ranges",
        category: 'landscape',
        slideshow: true,
        interval: 600,
        images: [
          {
            id: 'everest',
            url: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Mount Everest',
            description: "The world's highest peak in the Himalayas",
            keywords: ['everest', 'himalayas', 'highest', 'peak'],
          },
          {
            id: 'k2',
            url: 'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'K2 - Karakoram Range',
            description: 'The savage mountain and second highest peak',
            keywords: ['k2', 'karakoram', 'savage', 'mountain'],
          },
          {
            id: 'denali',
            url: 'https://images.unsplash.com/photo-1561128959-a7e0f3f8f0d8?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Denali',
            description: "North America's highest peak in Alaska",
            keywords: ['denali', 'alaska', 'north', 'america'],
          },
          {
            id: 'matterhorn',
            url: 'https://images.unsplash.com/photo-1609221873781-8d4b7ee0d76a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Matterhorn',
            description: 'Iconic pyramid peak in the Alps',
            keywords: ['matterhorn', 'alps', 'pyramid', 'iconic'],
          },
          {
            id: 'annapurna',
            url: 'https://images.unsplash.com/photo-1519904981063-b0cf448d479e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Annapurna Circuit',
            description: 'Breathtaking Himalayan mountain range',
            keywords: ['annapurna', 'circuit', 'himalayas', 'range'],
          },
        ],
      },
      {
        id: 'ocean',
        name: 'Ocean Depths - Spectacular Water Scenes',
        description: 'Breathtaking oceanic landscapes and underwater worlds',
        category: 'nature',
        slideshow: true,
        interval: 400,
        images: [
          {
            id: 'maldives',
            url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Maldives Crystal Waters',
            description: 'Perfect turquoise waters and coral reefs',
            keywords: ['maldives', 'crystal', 'turquoise', 'coral'],
          },
          {
            id: 'bora-bora',
            url: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Bora Bora Lagoon',
            description: 'Pristine Pacific island paradise',
            keywords: ['bora', 'bora', 'lagoon', 'paradise'],
          },
          {
            id: 'great-barrier-reef',
            url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Great Barrier Reef',
            description: "World's largest coral reef system",
            keywords: ['great', 'barrier', 'reef', 'coral'],
          },
          {
            id: 'iceland-fjords',
            url: 'https://images.unsplash.com/photo-1486022338577-c4c69b9c4b67?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Iceland Fjords',
            description: 'Dramatic glacial-carved waterways',
            keywords: ['iceland', 'fjords', 'glacial', 'dramatic'],
          },
          {
            id: 'aurora-ocean',
            url: 'https://images.unsplash.com/photo-1497449493050-aad1e7cad165?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Aurora Over Ocean',
            description: 'Northern lights reflecting in arctic waters',
            keywords: ['aurora', 'ocean', 'northern', 'lights'],
          },
        ],
      },
      {
        id: 'forest',
        name: 'Forest Ecosystems - Diverse Woodlands',
        description: 'Lush forest environments from around the world',
        category: 'nature',
        slideshow: true,
        interval: 450,
        images: [
          {
            id: 'redwood',
            url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'California Redwoods',
            description: 'Ancient giants of the Pacific Coast',
            keywords: ['redwood', 'california', 'giants', 'ancient'],
          },
          {
            id: 'bamboo-forest',
            url: 'https://images.unsplash.com/photo-1583212292454-1fe6229603b7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Bamboo Forest',
            description: 'Serene bamboo groves in Japan',
            keywords: ['bamboo', 'forest', 'japan', 'serene'],
          },
          {
            id: 'amazon-rainforest',
            url: 'https://images.unsplash.com/photo-1544041242-35ad9e19b9c6?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Amazon Rainforest',
            description: 'Lungs of the Earth in Brazil',
            keywords: ['amazon', 'rainforest', 'brazil', 'lungs'],
          },
          {
            id: 'autumn-maple',
            url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Autumn Maple Forest',
            description: 'Fall colors in New England',
            keywords: ['autumn', 'maple', 'fall', 'colors'],
          },
          {
            id: 'black-forest',
            url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Black Forest',
            description: 'Mystical woodlands of Germany',
            keywords: ['black', 'forest', 'germany', 'mystical'],
          },
        ],
      },
      {
        id: 'city',
        name: 'Urban Landscapes - Modern Cities',
        description: 'Dynamic cityscapes and urban architecture',
        category: 'urban',
        slideshow: true,
        interval: 350,
        images: [
          {
            id: 'tokyo-skyline',
            url: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Tokyo Skyline',
            description: 'Futuristic cityscape at night',
            keywords: ['tokyo', 'skyline', 'futuristic', 'night'],
          },
          {
            id: 'manhattan',
            url: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Manhattan Skyline',
            description: 'Iconic New York City architecture',
            keywords: ['manhattan', 'new', 'york', 'iconic'],
          },
          {
            id: 'dubai-modern',
            url: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Dubai Modern',
            description: 'Cutting-edge architecture in the desert',
            keywords: ['dubai', 'modern', 'architecture', 'desert'],
          },
        ],
      },
      {
        id: 'abstract',
        name: 'Abstract Dynamics - Digital Art',
        description: 'Dynamic patterns and abstract digital compositions',
        category: 'abstract',
        slideshow: true,
        interval: 250,
        images: [
          {
            id: 'fluid-gradient',
            url: 'https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Fluid Gradient',
            description: 'Dynamic color transitions',
            keywords: ['fluid', 'gradient', 'dynamic', 'color'],
          },
          {
            id: 'geometric-waves',
            url: 'https://images.unsplash.com/photo-1557683311-eac922347aa1?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Geometric Waves',
            description: 'Mathematical beauty in motion',
            keywords: ['geometric', 'waves', 'mathematical', 'motion'],
          },
          {
            id: 'particle-field',
            url: 'https://images.unsplash.com/photo-1615529328331-f8917597711f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Particle Field',
            description: 'Cosmic energy visualization',
            keywords: ['particle', 'field', 'cosmic', 'energy'],
          },
          {
            id: 'neon-mesh',
            url: 'https://images.unsplash.com/photo-1635372722656-389f87a941b7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2560&q=80',
            title: 'Neon Mesh',
            description: 'Cyberpunk aesthetic patterns',
            keywords: ['neon', 'mesh', 'cyberpunk', 'patterns'],
          },
        ],
      },
    ];
  }

  getAvailableThemes(): WallpaperTheme[] {
    return this.getThemes();
  }

  getThemeById(id: string): WallpaperTheme | null {
    return this.getThemes().find((theme) => theme.id === id) || null;
  }

  getCurrentTheme(): WallpaperTheme | null {
    return this.currentTheme;
  }

  getCurrentImage(): WallpaperImage | null {
    if (!this.currentTheme) return null;
    return this.currentTheme.images[this.currentImageIndex] || null;
  }

  setTheme(theme: WallpaperTheme): void {
    if (this.slideshowTimer) {
      clearInterval(this.slideshowTimer);
      this.slideshowTimer = null;
    }

    this.currentTheme = theme;
    this.currentImageIndex = 0;
    this.preferences.currentTheme = theme.id;
    this.savePreferences();

    this.notifyListeners();

    if (this.preferences.slideshowEnabled && theme.slideshow) {
      this.startSlideshow();
    }
  }

  setImage(imageId: string): void {
    if (!this.currentTheme) return;

    const index = this.currentTheme.images.findIndex((img) => img.id === imageId);
    if (index !== -1) {
      this.currentImageIndex = index;
      this.notifyListeners();
    }
  }

  toggleSlideshow(): void {
    this.preferences.slideshowEnabled = !this.preferences.slideshowEnabled;
    this.savePreferences();

    if (this.preferences.slideshowEnabled && this.currentTheme?.slideshow) {
      this.startSlideshow();
    } else {
      this.stopSlideshow();
    }
  }

  setSlideshowInterval(seconds: number): void {
    this.preferences.intervalSeconds = seconds;
    this.savePreferences();

    if (this.preferences.slideshowEnabled && this.currentTheme?.slideshow) {
      this.startSlideshow();
    }
  }

  private startSlideshow(): void {
    if (this.slideshowTimer) {
      clearInterval(this.slideshowTimer);
    }

    const interval = this.preferences.intervalSeconds * 1000;
    this.slideshowTimer = setInterval(() => {
      this.nextImage();
    }, interval);
  }

  private stopSlideshow(): void {
    if (this.slideshowTimer) {
      clearInterval(this.slideshowTimer);
      this.slideshowTimer = null;
    }
  }

  nextImage(): void {
    if (!this.currentTheme) return;

    if (this.preferences.randomOrder) {
      this.currentImageIndex = Math.floor(Math.random() * this.currentTheme.images.length);
    } else {
      this.currentImageIndex = (this.currentImageIndex + 1) % this.currentTheme.images.length;
    }

    this.notifyListeners();
  }

  previousImage(): void {
    if (!this.currentTheme) return;

    if (this.preferences.randomOrder) {
      this.currentImageIndex = Math.floor(Math.random() * this.currentTheme.images.length);
    } else {
      this.currentImageIndex =
        this.currentImageIndex === 0
          ? this.currentTheme.images.length - 1
          : this.currentImageIndex - 1;
    }

    this.notifyListeners();
  }

  getPreferences(): WallpaperPreferences {
    return { ...this.preferences };
  }

  updatePreferences(updates: Partial<WallpaperPreferences>): void {
    this.preferences = { ...this.preferences, ...updates };
    this.savePreferences();

    // Restart slideshow if needed
    if (this.preferences.slideshowEnabled && this.currentTheme?.slideshow) {
      this.startSlideshow();
    } else {
      this.stopSlideshow();
    }
  }

  // Image quality optimization
  getOptimizedImageUrl(image: WallpaperImage, width?: number, height?: number): string {
    const quality =
      this.preferences.quality === 'high' ? 90 : this.preferences.quality === 'medium' ? 70 : 50;

    const w = width || 2560;
    const h = height || 1440;

    // If it's an Unsplash URL, add optimization parameters
    if (image.url.includes('unsplash.com')) {
      return `${image.url}&w=${w}&h=${h}&q=${quality}&fit=crop`;
    }

    return image.url;
  }

  // Event listeners for wallpaper changes
  addChangeListener(callback: (image: WallpaperImage) => void): void {
    this.listeners.add(callback);
  }

  removeChangeListener(callback: (image: WallpaperImage) => void): void {
    this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const currentImage = this.getCurrentImage();
    if (currentImage) {
      this.listeners.forEach((callback) => callback(currentImage));
    }
  }

  // Location-based wallpaper suggestions
  getLocationBasedSuggestions(location: LocationData): WallpaperTheme[] {
    const themes = this.getThemes();
    const suggestions: WallpaperTheme[] = [];

    // Simple location-based logic - can be enhanced
    if (location.city) {
      const cityLower = location.city.toLowerCase();

      // Coastal cities -> Ocean theme
      if (
        cityLower.includes('beach') ||
        cityLower.includes('coast') ||
        cityLower.includes('bay') ||
        cityLower.includes('harbor')
      ) {
        suggestions.push(themes.find((t) => t.id === 'ocean')!);
      }

      // Mountain cities -> Mountain theme
      if (
        cityLower.includes('mountain') ||
        cityLower.includes('peak') ||
        cityLower.includes('alpine') ||
        cityLower.includes('summit')
      ) {
        suggestions.push(themes.find((t) => t.id === 'mountains')!);
      }
    }

    // Default suggestions if no location-specific ones
    if (suggestions.length === 0) {
      suggestions.push(
        themes.find((t) => t.id === 'space')!,
        themes.find((t) => t.id === 'abstract')!
      );
    }

    return suggestions.filter(Boolean);
  }

  // Clean up resources
  destroy(): void {
    if (this.slideshowTimer) {
      clearInterval(this.slideshowTimer);
      this.slideshowTimer = null;
    }
    this.listeners.clear();
  }
}

export default WallpaperService;

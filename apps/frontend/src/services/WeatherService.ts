import { LocationData } from './LocationService';

export interface WeatherData {
  location: string;
  temperature: number;
  condition: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  forecast?: Array<{
    day: string;
    high: number;
    low: number;
    condition: string;
    icon: string;
  }>;
}

export class WeatherService {
  private static readonly WEATHER_CACHE_KEY = 'weather-data';
  private static readonly WEATHER_TIMESTAMP_KEY = 'weather-timestamp';
  private static readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  static async getWeatherByLocation(location: LocationData): Promise<WeatherData | null> {
    try {
      // Check cache first
      const cached = this.getCachedWeather();
      if (cached && this.isCacheValid()) {
        return cached;
      }

      // Use OpenWeatherMap API (you'll need to get a free API key)
      // For now, I'll use a mock weather service based on location
      const weather = await this.fetchWeatherData(location);

      if (weather) {
        this.cacheWeatherData(weather);
      }

      return weather;
    } catch (error) {
      console.error('Failed to fetch weather data:', error);
      return this.getDefaultWeather(location);
    }
  }

  private static async fetchWeatherData(location: LocationData): Promise<WeatherData | null> {
    // For demonstration, I'll create realistic weather based on location
    // In production, you'd use a real weather API like OpenWeatherMap

    const locationName =
      location.city && location.country
        ? `${location.city}, ${location.country}`
        : `${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`;

    // Mock weather based on rough geographic areas
    const isNorthern = location.latitude > 30;
    const isTropical = Math.abs(location.latitude) < 23.5;
    const isCoastal = this.isCoastalArea(location);

    let temperature: number;
    let condition: string;
    let icon: string;
    let humidity: number;
    let windSpeed: number;

    if (isTropical) {
      temperature = 28 + Math.random() * 8; // 28-36°C
      condition = Math.random() > 0.7 ? 'Rainy' : Math.random() > 0.5 ? 'Partly Cloudy' : 'Sunny';
      humidity = 70 + Math.random() * 25; // 70-95%
      windSpeed = 5 + Math.random() * 15; // 5-20 km/h
    } else if (isNorthern) {
      temperature = isCoastal ? 15 + Math.random() * 15 : 10 + Math.random() * 20; // 15-30°C or 10-30°C
      condition = Math.random() > 0.6 ? 'Cloudy' : Math.random() > 0.3 ? 'Partly Cloudy' : 'Sunny';
      humidity = 50 + Math.random() * 30; // 50-80%
      windSpeed = 8 + Math.random() * 12; // 8-20 km/h
    } else {
      temperature = 20 + Math.random() * 15; // 20-35°C
      condition = Math.random() > 0.8 ? 'Rainy' : Math.random() > 0.4 ? 'Partly Cloudy' : 'Sunny';
      humidity = 45 + Math.random() * 35; // 45-80%
      windSpeed = 5 + Math.random() * 15; // 5-20 km/h
    }

    // Set icon based on condition
    switch (condition) {
      case 'Sunny':
        icon = '☀️';
        break;
      case 'Partly Cloudy':
        icon = '⛅';
        break;
      case 'Cloudy':
        icon = '☁️';
        break;
      case 'Rainy':
        icon = '🌧️';
        break;
      default:
        icon = '⛅';
    }

    // Generate simple forecast
    const forecast = this.generateForecast(temperature, condition);

    return {
      location: locationName,
      temperature: Math.round(temperature),
      condition,
      icon,
      humidity: Math.round(humidity),
      windSpeed: Math.round(windSpeed),
      forecast,
    };
  }

  private static isCoastalArea(location: LocationData): boolean {
    // Very simplified coastal detection - in reality you'd use a proper geographical service
    // This is just a rough approximation
    const { latitude, longitude } = location;

    // Major coastal areas (simplified)
    const coastalRegions = [
      { name: 'US East Coast', latMin: 25, latMax: 45, lonMin: -85, lonMax: -65 },
      { name: 'US West Coast', latMin: 30, latMax: 50, lonMin: -130, lonMax: -115 },
      { name: 'Europe Atlantic', latMin: 35, latMax: 70, lonMin: -15, lonMax: 15 },
      { name: 'Mediterranean', latMin: 30, latMax: 45, lonMin: -5, lonMax: 40 },
      { name: 'Australia', latMin: -45, latMax: -10, lonMin: 110, lonMax: 155 },
    ];

    return coastalRegions.some(
      (region) =>
        latitude >= region.latMin &&
        latitude <= region.latMax &&
        longitude >= region.lonMin &&
        longitude <= region.lonMax
    );
  }

  private static generateForecast(baseTemp: number, baseCondition: string) {
    const days = ['Tomorrow', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy'];

    return days.slice(0, 3).map((day, index) => {
      const tempVariation = (Math.random() - 0.5) * 8; // ±4°C variation
      const high = Math.round(baseTemp + tempVariation + Math.random() * 3);
      const low = Math.round(high - 5 - Math.random() * 8);

      // Vary conditions slightly
      let condition = baseCondition;
      if (Math.random() > 0.7) {
        condition = conditions[Math.floor(Math.random() * conditions.length)];
      }

      let icon: string;
      switch (condition) {
        case 'Sunny':
          icon = '☀️';
          break;
        case 'Partly Cloudy':
          icon = '⛅';
          break;
        case 'Cloudy':
          icon = '☁️';
          break;
        case 'Rainy':
          icon = '🌧️';
          break;
        default:
          icon = '⛅';
      }

      return { day, high, low, condition, icon };
    });
  }

  private static getDefaultWeather(location: LocationData): WeatherData {
    const locationName =
      location.city && location.country ? `${location.city}, ${location.country}` : 'Your Location';

    return {
      location: locationName,
      temperature: 22,
      condition: 'Partly Cloudy',
      icon: '⛅',
      humidity: 65,
      windSpeed: 8,
      forecast: [
        { day: 'Tomorrow', high: 25, low: 18, condition: 'Sunny', icon: '☀️' },
        { day: 'Tuesday', high: 23, low: 16, condition: 'Cloudy', icon: '☁️' },
        { day: 'Wednesday', high: 20, low: 14, condition: 'Rainy', icon: '🌧️' },
      ],
    };
  }

  private static getCachedWeather(): WeatherData | null {
    try {
      const cached = localStorage.getItem(this.WEATHER_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('Failed to load cached weather:', error);
      return null;
    }
  }

  private static isCacheValid(): boolean {
    try {
      const timestamp = localStorage.getItem(this.WEATHER_TIMESTAMP_KEY);
      if (!timestamp) return false;

      const age = Date.now() - parseInt(timestamp);
      return age < this.CACHE_DURATION;
    } catch (error) {
      return false;
    }
  }

  private static cacheWeatherData(weather: WeatherData): void {
    try {
      localStorage.setItem(this.WEATHER_CACHE_KEY, JSON.stringify(weather));
      localStorage.setItem(this.WEATHER_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.warn('Failed to cache weather data:', error);
    }
  }

  static clearWeatherCache(): void {
    localStorage.removeItem(this.WEATHER_CACHE_KEY);
    localStorage.removeItem(this.WEATHER_TIMESTAMP_KEY);
  }
}

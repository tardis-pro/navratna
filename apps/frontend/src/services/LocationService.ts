export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  city?: string;
  country?: string;
}

export class LocationService {
  static async requestLocation(): Promise<LocationData | null> {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported');
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          });
        },
        (error) => {
          console.warn('Location access denied or failed:', error.message);
          resolve(null); // Don't reject, just return null
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    });
  }

  static async reverseGeocode(lat: number, lng: number): Promise<{city?: string, country?: string}> {
    try {
      // Using OpenStreetMap Nominatim (free)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Council-of-Nycea/1.0'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Geocoding request failed');
      }
      
      const data = await response.json();
      
      return {
        city: data.address?.city || data.address?.town || data.address?.village || data.address?.municipality,
        country: data.address?.country
      };
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
      return {};
    }
  }

  static saveLocation(location: LocationData): void {
    localStorage.setItem('userLocation', JSON.stringify(location));
    localStorage.setItem('locationConsent', 'true');
    localStorage.setItem('locationTimestamp', Date.now().toString());
  }

  static loadLocation(): LocationData | null {
    try {
      const locationData = localStorage.getItem('userLocation');
      const consent = localStorage.getItem('locationConsent');
      const timestamp = localStorage.getItem('locationTimestamp');
      
      if (!locationData || consent !== 'true') {
        return null;
      }

      // Check if location is older than 24 hours
      if (timestamp) {
        const locationAge = Date.now() - parseInt(timestamp);
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (locationAge > oneDayMs) {
          console.log('Location data is stale, will request fresh location');
          return null;
        }
      }

      return JSON.parse(locationData);
    } catch (error) {
      console.warn('Failed to load saved location:', error);
      return null;
    }
  }

  static clearLocation(): void {
    localStorage.removeItem('userLocation');
    localStorage.removeItem('locationConsent');
    localStorage.removeItem('locationTimestamp');
  }

  static hasLocationConsent(): boolean {
    return localStorage.getItem('locationConsent') === 'true';
  }
}
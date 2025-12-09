import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  EyeIcon,
  EyeSlashIcon,
  LockClosedIcon,
  UserIcon,
  LightBulbIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { Globe, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { LocationService, LocationData } from '../services/LocationService';
import { MapWallpaper } from './futuristic/desktop/MapWallpaper';

interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export const Login: React.FC = () => {
  const { login, isLoading, error } = useAuth();
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Location-related state
  const [locationConsent, setLocationConsent] = useState<boolean | null>(null);
  const [userLocation, setUserLocation] = useState<LocationData | null>(null);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);

  // Initialize location on component mount
  useEffect(() => {
    const savedLocation = LocationService.loadLocation();
    if (savedLocation) {
      setUserLocation(savedLocation);
      setLocationConsent(true);
    } else if (LocationService.hasLocationConsent()) {
      setLocationConsent(true);
    }
  }, []);

  // Clear errors when form data changes
  useEffect(() => {
    if (Object.keys(formErrors).length > 0) {
      setFormErrors({});
    }
  }, [formData, formErrors, error]);

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    // Email validation
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Password validation
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLocationRequest = async () => {
    setIsRequestingLocation(true);
    try {
      const location = await LocationService.requestLocation();
      if (location) {
        // Try to get city/country info
        const geocode = await LocationService.reverseGeocode(location.latitude, location.longitude);
        const enhancedLocation = { ...location, ...geocode };

        setUserLocation(enhancedLocation);
        LocationService.saveLocation(enhancedLocation);
        setLocationConsent(true);
      } else {
        setLocationConsent(false);
      }
    } catch (error) {
      console.error('Location request failed:', error);
      setLocationConsent(false);
    } finally {
      setIsRequestingLocation(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await login(formData.email, formData.password, formData.rememberMe);
    } catch (error) {
      // Error is handled by the auth context
      console.error('Login failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange =
    (field: keyof LoginFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = field === 'rememberMe' ? e.target.checked : e.target.value;
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const demoCredentials = {
    'System Accounts': {
      color: 'red',
      accounts: [
        {
          email: 'admin1@uaip.dev',
          password: 'admin123!',
          role: 'Admin',
          description: 'Full system access',
        },
        {
          email: 'manager1@uaip.dev',
          password: 'manager123!',
          role: 'Manager',
          description: 'Management access',
        },
      ],
    },
    'Professional Roles': {
      color: 'blue',
      accounts: [
        {
          email: 'analyst1@uaip.dev',
          password: 'analyst123!',
          role: 'Analyst',
          description: 'Data analysis specialist',
        },
        {
          email: 'developer1@uaip.dev',
          password: 'dev123!',
          role: 'Developer',
          description: 'Software development',
        },
      ],
    },
    'Specialized Users': {
      color: 'purple',
      accounts: [
        {
          email: 'codemaster@uaip.dev',
          password: 'viral123!',
          role: 'Code Expert',
          description: 'Programming specialist',
        },
        {
          email: 'creativeguru@uaip.dev',
          password: 'create123!',
          role: 'Creative',
          description: 'Design & content creation',
        },
        {
          email: 'socialguru@uaip.dev',
          password: 'social123!',
          role: 'Social Media',
          description: 'Social media management',
        },
      ],
    },
    'Guest Access': {
      color: 'green',
      accounts: [
        {
          email: 'guest1@uaip.dev',
          password: 'guest123!',
          role: 'Guest',
          description: 'Limited demo access',
        },
        {
          email: 'devgenius@uaip.dev',
          password: 'genius123!',
          role: 'Demo User',
          description: 'General demonstration',
        },
      ],
    },
  };

  const fillDemoCredentials = (email: string, password: string) => {
    console.log('Filling demo credentials:', { email, password });
    const newFormData = { ...formData, email, password };
    setFormData(newFormData);
    // Auto-submit after a brief delay to show the filled credentials
    setTimeout(async () => {
      console.log('Auto-submitting with credentials:', { email, password });
      setIsSubmitting(true);
      try {
        await login(email, password, formData.rememberMe);
      } catch (error) {
        console.error('Auto-login failed:', error);
      } finally {
        setIsSubmitting(false);
      }
    }, 300);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Map Wallpaper Background */}
      <MapWallpaper
        userLocation={
          userLocation
            ? {
                lat: userLocation.latitude,
                lng: userLocation.longitude,
              }
            : undefined
        }
        theme="dark"
        interactive={false}
        className="opacity-40"
      />

      {/* Dark overlay for better contrast */}
      <div className="absolute inset-0 bg-slate-900/70" />

      <div className="relative z-10 min-h-screen bg-gradient-to-br from-transparent via-slate-900/20 to-slate-900/40 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/30 mb-6">
              <SparklesIcon className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 dark:from-white dark:via-blue-100 dark:to-indigo-100 bg-clip-text text-transparent">
              Welcome Back
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Sign in to access the Navratna
            </p>
          </div>

          {/* Demo Credentials */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/60 shadow-xl">
            <div className="flex items-center space-x-2 mb-4">
              <LightBulbIcon className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Quick Demo Login
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(demoCredentials).map(([category, { color, accounts }]) => {
                const colorClasses = {
                  red: {
                    border: 'border-red-200 dark:border-red-800',
                    bg: 'bg-red-50 dark:bg-red-900/20',
                    hover: 'hover:bg-red-100 dark:hover:bg-red-900/30',
                    text: 'text-red-700 dark:text-red-300',
                    accent: 'bg-red-500',
                  },
                  blue: {
                    border: 'border-blue-200 dark:border-blue-800',
                    bg: 'bg-blue-50 dark:bg-blue-900/20',
                    hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/30',
                    text: 'text-blue-700 dark:text-blue-300',
                    accent: 'bg-blue-500',
                  },
                  purple: {
                    border: 'border-purple-200 dark:border-purple-800',
                    bg: 'bg-purple-50 dark:bg-purple-900/20',
                    hover: 'hover:bg-purple-100 dark:hover:bg-purple-900/30',
                    text: 'text-purple-700 dark:text-purple-300',
                    accent: 'bg-purple-500',
                  },
                  green: {
                    border: 'border-green-200 dark:border-green-800',
                    bg: 'bg-green-50 dark:bg-green-900/20',
                    hover: 'hover:bg-green-100 dark:hover:bg-green-900/30',
                    text: 'text-green-700 dark:text-green-300',
                    accent: 'bg-green-500',
                  },
                };

                const colors = colorClasses[color as keyof typeof colorClasses];

                return (
                  <div
                    key={category}
                    className={`p-3 rounded-xl border ${colors.border} ${colors.bg}`}
                  >
                    <div className="flex items-center space-x-2 mb-3">
                      <div className={`w-2 h-2 rounded-full ${colors.accent}`}></div>
                      <h4
                        className={`text-xs font-semibold ${colors.text} uppercase tracking-wide`}
                      >
                        {category}
                      </h4>
                    </div>
                    <div className="space-y-2">
                      {accounts.map((cred, index) => (
                        <button
                          key={`${category}-${index}`}
                          type="button"
                          onClick={() => fillDemoCredentials(cred.email, cred.password)}
                          className={`w-full text-left p-2 rounded-lg ${colors.bg} ${colors.hover} transition-all duration-200 border ${colors.border} group`}
                        >
                          <div className="font-medium text-slate-700 dark:text-slate-300 text-xs group-hover:${colors.text} transition-colors">
                            {cred.role}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 text-xs">
                            {cred.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Click any account above to auto-login with demo credentials
              </p>
            </div>
          </div>

          {/* Login Form */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-8 border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/20 dark:shadow-slate-900/20">
            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Global Error */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start space-x-3">
                  <LightBulbIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                      Login Failed
                    </h3>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
                  </div>
                </div>
              )}

              {/* Email Field */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange('email')}
                    className={`block w-full pl-10 pr-3 py-3 border rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      formErrors.email
                        ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'
                    } text-slate-900 dark:text-slate-100`}
                    placeholder="Enter your email"
                  />
                </div>
                {formErrors.email && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{formErrors.email}</p>
                )}
              </div>

              {/* Password Field */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <LockClosedIcon className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={formData.password}
                    onChange={handleInputChange('password')}
                    className={`block w-full pl-10 pr-10 py-3 border rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      formErrors.password
                        ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'
                    } text-slate-900 dark:text-slate-100`}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                    )}
                  </button>
                </div>
                {formErrors.password && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {formErrors.password}
                  </p>
                )}
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={formData.rememberMe}
                    onChange={handleInputChange('rememberMe')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                  />
                  <label
                    htmlFor="remember-me"
                    className="ml-2 block text-sm text-slate-700 dark:text-slate-300"
                  >
                    Remember me
                  </label>
                </div>
                <div className="text-sm">
                  <a
                    href="#"
                    className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Forgot password?
                  </a>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || isSubmitting}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40"
              >
                {isLoading || isSubmitting ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>

          {/* Location Consent Section */}
          {locationConsent === null && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-blue-500/10 dark:bg-blue-500/20 backdrop-blur-xl rounded-2xl p-6 border border-blue-500/20 shadow-lg"
            >
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                    <Globe className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-medium text-white mb-2">Enable Location Features</h4>
                  <p className="text-slate-300 text-sm mb-4">
                    Allow location access to enhance your experience with a personalized map
                    wallpaper and location-based features. Your location data stays private and
                    secure on your device.
                  </p>

                  {userLocation && (
                    <div className="flex items-center space-x-2 mb-4 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                      <MapPin className="w-4 h-4 text-green-400" />
                      <span className="text-green-300 text-sm">
                        {userLocation.city && userLocation.country
                          ? `Located in ${userLocation.city}, ${userLocation.country}`
                          : `Location detected (${userLocation.latitude.toFixed(2)}, ${userLocation.longitude.toFixed(2)})`}
                      </span>
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <button
                      onClick={handleLocationRequest}
                      disabled={isRequestingLocation}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      {isRequestingLocation ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <MapPin className="w-4 h-4" />
                      )}
                      <span>{isRequestingLocation ? 'Getting Location...' : 'Allow Location'}</span>
                    </button>
                    <button
                      onClick={() => setLocationConsent(false)}
                      className="px-4 py-2 border border-slate-600 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      Skip for Now
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Location Status Display (when granted) */}
          {locationConsent === true && userLocation && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-green-500/10 dark:bg-green-500/20 backdrop-blur-xl rounded-2xl p-4 border border-green-500/20"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-green-300 font-medium text-sm">Location Enabled</p>
                  <p className="text-green-400/80 text-xs">
                    {userLocation.city && userLocation.country
                      ? `${userLocation.city}, ${userLocation.country}`
                      : 'Map wallpaper activated'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Footer */}
          <div className="text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Navratna • AI Agent Collaboration Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

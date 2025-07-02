export interface DesktopTheme {
  id: string;
  name: string;
  description: string;
  colors: {
    background: {
      primary: string;
      secondary: string;
      tertiary: string;
    };
    surface: {
      primary: string;
      secondary: string;
      elevated: string;
    };
    text: {
      primary: string;
      secondary: string;
      muted: string;
    };
    accent: {
      primary: string;
      secondary: string;
    };
    border: {
      primary: string;
      secondary: string;
    };
    status: {
      success: string;
      warning: string;
      error: string;
      info: string;
    };
  };
  effects: {
    blur: string;
    shadow: string;
    glow: string;
  };
  gradients: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

export const DESKTOP_THEMES: Record<string, DesktopTheme> = {
  dark: {
    id: 'dark',
    name: 'Dark Mode',
    description: 'Classic dark theme with blue accents',
    colors: {
      background: {
        primary: 'from-slate-950 via-slate-900 to-slate-800',
        secondary: 'from-slate-900 via-slate-800 to-slate-700',
        tertiary: 'from-slate-800 to-slate-700'
      },
      surface: {
        primary: 'bg-slate-900/95',
        secondary: 'bg-slate-800/50',
        elevated: 'bg-slate-700/50'
      },
      text: {
        primary: 'text-white',
        secondary: 'text-slate-300',
        muted: 'text-slate-400'
      },
      accent: {
        primary: 'text-blue-400',
        secondary: 'text-cyan-400'
      },
      border: {
        primary: 'border-slate-700/50',
        secondary: 'border-slate-600/50'
      },
      status: {
        success: 'text-green-400',
        warning: 'text-yellow-400',
        error: 'text-red-400',
        info: 'text-blue-400'
      }
    },
    effects: {
      blur: 'backdrop-blur-xl',
      shadow: 'shadow-2xl',
      glow: 'drop-shadow-lg'
    },
    gradients: {
      primary: 'bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900',
      secondary: 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900',
      accent: 'bg-gradient-to-br from-blue-500 to-cyan-500'
    }
  },

  light: {
    id: 'light',
    name: 'Light Mode',
    description: 'Clean light theme with subtle shadows',
    colors: {
      background: {
        primary: 'from-gray-50 via-white to-gray-100',
        secondary: 'from-white via-gray-50 to-gray-100',
        tertiary: 'from-gray-100 to-gray-200'
      },
      surface: {
        primary: 'bg-white/95',
        secondary: 'bg-gray-50/80',
        elevated: 'bg-white/90'
      },
      text: {
        primary: 'text-gray-900',
        secondary: 'text-gray-700',
        muted: 'text-gray-500'
      },
      accent: {
        primary: 'text-blue-600',
        secondary: 'text-indigo-600'
      },
      border: {
        primary: 'border-gray-200',
        secondary: 'border-gray-300'
      },
      status: {
        success: 'text-green-600',
        warning: 'text-amber-600',
        error: 'text-red-600',
        info: 'text-blue-600'
      }
    },
    effects: {
      blur: 'backdrop-blur-sm',
      shadow: 'shadow-lg',
      glow: 'drop-shadow-md'
    },
    gradients: {
      primary: 'bg-gradient-to-br from-white via-blue-50 to-gray-100',
      secondary: 'bg-gradient-to-r from-gray-50 via-white to-gray-50',
      accent: 'bg-gradient-to-br from-blue-500 to-indigo-600'
    }
  },

  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon-inspired theme with vibrant colors',
    colors: {
      background: {
        primary: 'from-black via-purple-950 to-black',
        secondary: 'from-purple-950 via-pink-950 to-black',
        tertiary: 'from-purple-900 to-pink-900'
      },
      surface: {
        primary: 'bg-black/95',
        secondary: 'bg-purple-950/50',
        elevated: 'bg-purple-900/50'
      },
      text: {
        primary: 'text-cyan-300',
        secondary: 'text-purple-300',
        muted: 'text-purple-400'
      },
      accent: {
        primary: 'text-cyan-400',
        secondary: 'text-pink-400'
      },
      border: {
        primary: 'border-cyan-500/50',
        secondary: 'border-purple-500/50'
      },
      status: {
        success: 'text-green-400',
        warning: 'text-yellow-400',
        error: 'text-red-400',
        info: 'text-cyan-400'
      }
    },
    effects: {
      blur: 'backdrop-blur-xl',
      shadow: 'shadow-2xl shadow-cyan-500/20',
      glow: 'drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]'
    },
    gradients: {
      primary: 'bg-gradient-to-br from-black via-purple-900 to-pink-900',
      secondary: 'bg-gradient-to-r from-purple-950 via-black to-purple-950',
      accent: 'bg-gradient-to-br from-cyan-500 to-pink-500'
    }
  },

  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Nature-inspired green theme',
    colors: {
      background: {
        primary: 'from-green-950 via-emerald-900 to-green-950',
        secondary: 'from-emerald-900 via-green-800 to-emerald-900',
        tertiary: 'from-green-800 to-emerald-700'
      },
      surface: {
        primary: 'bg-green-950/95',
        secondary: 'bg-emerald-900/50',
        elevated: 'bg-green-800/50'
      },
      text: {
        primary: 'text-green-100',
        secondary: 'text-green-200',
        muted: 'text-green-400'
      },
      accent: {
        primary: 'text-emerald-400',
        secondary: 'text-lime-400'
      },
      border: {
        primary: 'border-emerald-700/50',
        secondary: 'border-green-600/50'
      },
      status: {
        success: 'text-green-400',
        warning: 'text-yellow-400',
        error: 'text-red-400',
        info: 'text-emerald-400'
      }
    },
    effects: {
      blur: 'backdrop-blur-xl',
      shadow: 'shadow-2xl shadow-emerald-500/20',
      glow: 'drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]'
    },
    gradients: {
      primary: 'bg-gradient-to-br from-green-950 via-emerald-900 to-green-800',
      secondary: 'bg-gradient-to-r from-emerald-950 via-green-900 to-emerald-950',
      accent: 'bg-gradient-to-br from-emerald-500 to-lime-500'
    }
  },

  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep blue ocean-inspired theme',
    colors: {
      background: {
        primary: 'from-blue-950 via-indigo-900 to-blue-950',
        secondary: 'from-indigo-900 via-blue-800 to-indigo-900',
        tertiary: 'from-blue-800 to-indigo-700'
      },
      surface: {
        primary: 'bg-blue-950/95',
        secondary: 'bg-indigo-900/50',
        elevated: 'bg-blue-800/50'
      },
      text: {
        primary: 'text-blue-100',
        secondary: 'text-blue-200',
        muted: 'text-blue-400'
      },
      accent: {
        primary: 'text-cyan-400',
        secondary: 'text-sky-400'
      },
      border: {
        primary: 'border-blue-700/50',
        secondary: 'border-indigo-600/50'
      },
      status: {
        success: 'text-green-400',
        warning: 'text-yellow-400',
        error: 'text-red-400',
        info: 'text-cyan-400'
      }
    },
    effects: {
      blur: 'backdrop-blur-xl',
      shadow: 'shadow-2xl shadow-blue-500/20',
      glow: 'drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]'
    },
    gradients: {
      primary: 'bg-gradient-to-br from-blue-950 via-indigo-900 to-blue-800',
      secondary: 'bg-gradient-to-r from-indigo-950 via-blue-900 to-indigo-950',
      accent: 'bg-gradient-to-br from-cyan-500 to-blue-500'
    }
  },

  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm sunset colors with orange and pink tones',
    colors: {
      background: {
        primary: 'from-orange-950 via-red-900 to-orange-950',
        secondary: 'from-red-900 via-orange-800 to-red-900',
        tertiary: 'from-orange-800 to-red-700'
      },
      surface: {
        primary: 'bg-orange-950/95',
        secondary: 'bg-red-900/50',
        elevated: 'bg-orange-800/50'
      },
      text: {
        primary: 'text-orange-100',
        secondary: 'text-orange-200',
        muted: 'text-orange-400'
      },
      accent: {
        primary: 'text-orange-400',
        secondary: 'text-pink-400'
      },
      border: {
        primary: 'border-orange-700/50',
        secondary: 'border-red-600/50'
      },
      status: {
        success: 'text-green-400',
        warning: 'text-yellow-400',
        error: 'text-red-400',
        info: 'text-orange-400'
      }
    },
    effects: {
      blur: 'backdrop-blur-xl',
      shadow: 'shadow-2xl shadow-orange-500/20',
      glow: 'drop-shadow-[0_0_8px_rgba(251,146,60,0.4)]'
    },
    gradients: {
      primary: 'bg-gradient-to-br from-orange-950 via-red-900 to-orange-800',
      secondary: 'bg-gradient-to-r from-red-950 via-orange-900 to-red-950',
      accent: 'bg-gradient-to-br from-orange-500 to-pink-500'
    }
  }
};

export const getTheme = (themeId: string): DesktopTheme => {
  return DESKTOP_THEMES[themeId] || DESKTOP_THEMES.dark;
};

export const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
};

export const resolveTheme = (themePreference: 'light' | 'dark' | 'auto'): DesktopTheme => {
  if (themePreference === 'auto') {
    const systemTheme = getSystemTheme();
    return getTheme(systemTheme);
  }
  return getTheme(themePreference);
};

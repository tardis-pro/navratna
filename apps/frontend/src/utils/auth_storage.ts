export const getStoredUserId = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return localStorage.getItem('userId') || sessionStorage.getItem('userId');
  } catch (error) {
    console.warn('Failed to read userId from storage:', error);
    return null;
  }
};

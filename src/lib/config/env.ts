/**
 * Environment variable configuration
 */

/**
 * Get the OpenAI API key from environment variables or return an empty string
 */
export const getOpenAIApiKey = (): string => {
  return import.meta.env.VITE_OPENAI_API_KEY || '';
};

/**
 * Check if a required environment variable is present
 */
export const isOpenAIApiKeyConfigured = (): boolean => {
  return !!import.meta.env.VITE_OPENAI_API_KEY;
};

/**
 * Development mode check
 */
export const isDevelopment = (): boolean => {
  return import.meta.env.DEV === true;
}; 
/**
 * Sanitize sensitive data from objects before logging
 * Uses a strict denylist approach to prevent logging sensitive fields
 */
export const sanitizeObject = (obj: any): any => {
  // Define sensitive field names that should never be logged
  const sensitiveFields = [
    'password', 'passwd', 'pass',
    'token', 'access_token', 'refresh_token',
    'secret', 'api_key', 'apikey', 'key',
    'auth', 'authorization', 'credential',
    'private', 'private_key',
    'config', 'command', 'commands', 'environment', 'env', 'content',
    'stdout', 'stderr', 'output', 'body', 'data', 'cookie', 'set-cookie'
  ];

  // If input is not an object, return as-is
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // If it's an array, sanitize each element
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  // Create a new object without sensitive fields
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip sensitive fields
    if (sensitiveFields.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    
    // Recursively sanitize nested objects
    sanitized[key] = sanitizeObject(value);
  }

  return sanitized;
};

/**
 * Detect sensitive environment variables and return warning information
 */
export const detectSensitiveEnvVars = (env: Record<string, string> | undefined): { hasSensitive: boolean; sensitiveVars: string[]; warning: string } => {
  if (!env) {
    return { hasSensitive: false, sensitiveVars: [], warning: '' };
  }

  // Common sensitive environment variable patterns
  const sensitivePatterns = [
    /password/i,
    /passwd/i,
    /pass/i,
    /token/i,
    /secret/i,
    /api[_-]?key/i,
    /auth/i,
    /credential/i,
    /private/i,
    /access[_-]?token/i,
    /refresh[_-]?token/i,
    /jwt/i,
    /oauth/i,
    /client[_-]?secret/i,
    /database[_-]?password/i,
    /db[_-]?password/i
  ];

  const sensitiveVars: string[] = [];
  const foundPatterns: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    // Check if the key matches sensitive patterns
    for (const pattern of sensitivePatterns) {
      if (pattern.test(key)) {
        sensitiveVars.push(key);
        foundPatterns.push(key);
        break;
      }
    }
    
    // Also check for common sensitive values
    if (value && (value.includes('password') || value.includes('secret') || value.includes('token') || value.includes('key'))) {
      sensitiveVars.push(key);
    }
  }

  if (sensitiveVars.length > 0) {
    const warning = `Warning: Detected potentially sensitive environment variables: ${sensitiveVars.join(', ')}. These values will be sanitized in logs and execution.`;
    return { hasSensitive: true, sensitiveVars, warning };
  }

  return { hasSensitive: false, sensitiveVars: [], warning: '' };
};

/**
 * Sanitize a string by removing sensitive patterns
 */
export const sanitizeString = (str: string): string => {
  // This is a basic implementation for now
  // In a more complex scenario, we might want to do more sophisticated sanitization
  return str;
};
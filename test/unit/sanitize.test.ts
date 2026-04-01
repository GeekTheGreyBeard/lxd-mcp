import { describe, it, expect } from 'vitest';
import { sanitizeObject, detectSensitiveEnvVars } from '../../src/logging/sanitize';

describe('sanitizeObject', () => {
  it('should sanitize sensitive fields from objects', () => {
    const obj = {
      password: 'secret123',
      username: 'user123',
      token: 'abc123',
      other: 'value'
    };

    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.username).toBe('user123');
    expect(sanitized.other).toBe('value');
  });

  it('should handle nested objects', () => {
    const obj = {
      user: {
        password: 'secret123',
        username: 'user123'
      },
      token: 'abc123'
    };

    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.user.password).toBe('[REDACTED]');
    expect(sanitized.user.username).toBe('user123');
    expect(sanitized.token).toBe('[REDACTED]');
  });

  it('should handle arrays', () => {
    const obj = {
      items: [
        { password: 'secret123', name: 'item1' },
        { token: 'abc123', name: 'item2' }
      ]
    };

    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.items[0].password).toBe('[REDACTED]');
    expect(sanitized.items[0].name).toBe('item1');
    expect(sanitized.items[1].token).toBe('[REDACTED]');
    expect(sanitized.items[1].name).toBe('item2');
  });

  it('should not sanitize non-sensitive fields', () => {
    const obj = {
      username: 'user123',
      email: 'user@example.com',
      name: 'John Doe'
    };

    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.username).toBe('user123');
    expect(sanitized.email).toBe('user@example.com');
    expect(sanitized.name).toBe('John Doe');
  });
});

describe('detectSensitiveEnvVars', () => {
  it('should detect sensitive environment variables', () => {
    const env = {
      PASSWORD: 'secret123',
      API_KEY: 'abc123',
      USERNAME: 'user123'
    };

    const result = detectSensitiveEnvVars(env);
    
    expect(result.hasSensitive).toBe(true);
    expect(result.sensitiveVars).toContain('PASSWORD');
    expect(result.sensitiveVars).toContain('API_KEY');
    expect(result.warning).toContain('PASSWORD');
    expect(result.warning).toContain('API_KEY');
  });

  it('should detect case insensitive sensitive variables', () => {
    const env = {
      password: 'secret123',
      SECRET: 'abc123',
      token: 'xyz789'
    };

    const result = detectSensitiveEnvVars(env);
    
    expect(result.hasSensitive).toBe(true);
    expect(result.sensitiveVars).toContain('password');
    expect(result.sensitiveVars).toContain('SECRET');
    expect(result.sensitiveVars).toContain('token');
  });

  it('should handle undefined environment variables', () => {
    const result = detectSensitiveEnvVars(undefined);
    
    expect(result.hasSensitive).toBe(false);
    expect(result.sensitiveVars).toEqual([]);
    expect(result.warning).toBe('');
  });

  it('should handle empty environment variables', () => {
    const result = detectSensitiveEnvVars({});
    
    expect(result.hasSensitive).toBe(false);
    expect(result.sensitiveVars).toEqual([]);
    expect(result.warning).toBe('');
  });

  it('should detect common sensitive patterns', () => {
    const env = {
      DATABASE_PASSWORD: 'secret123',
      JWT_SECRET: 'abc123',
      CLIENT_SECRET: 'xyz789'
    };

    const result = detectSensitiveEnvVars(env);
    
    expect(result.hasSensitive).toBe(true);
    expect(result.sensitiveVars).toContain('DATABASE_PASSWORD');
    expect(result.sensitiveVars).toContain('JWT_SECRET');
    expect(result.sensitiveVars).toContain('CLIENT_SECRET');
  });
});
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, checkPasswordPolicy } from '../../src/auth/password.js';

describe('auth/password', () => {
  it('hashea y verifica correctamente una contraseña válida', async () => {
    const hash = await hashPassword('ClaveSegura123');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword('ClaveSegura123', hash)).toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await hashPassword('ClaveSegura123');
    expect(await verifyPassword('OtraClave456', hash)).toBe(false);
  });

  it('no lanza excepción con un hash corrupto, solo devuelve false', async () => {
    await expect(verifyPassword('cualquier', 'hash-invalido')).resolves.toBe(false);
  });

  describe('checkPasswordPolicy', () => {
    it('acepta una contraseña que cumple todos los requisitos', () => {
      expect(checkPasswordPolicy('ClaveSegura123').valid).toBe(true);
    });

    it('rechaza una contraseña demasiado corta', () => {
      const result = checkPasswordPolicy('Corta1');
      expect(result.valid).toBe(false);
      expect(result.reasons.some((r) => r.includes('12 caracteres'))).toBe(true);
    });

    it('rechaza una contraseña sin mayúsculas', () => {
      const result = checkPasswordPolicy('clavesegura123');
      expect(result.valid).toBe(false);
    });

    it('rechaza una contraseña sin números', () => {
      const result = checkPasswordPolicy('ClaveSeguraSinNumero');
      expect(result.valid).toBe(false);
    });
  });
});

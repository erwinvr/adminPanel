/**
 * services/insights.service.js
 *
 * Indicadores de higiene de identidad para la página "Usuarios" del
 * dashboard: cruza las fotos de sincronización de Active Directory y
 * Microsoft 365 (ad_users / m365_users) — no dispara sincronizaciones
 * ni escribe nada, es puramente de lectura sobre lo que ya está
 * guardado. El umbral de "estancado" (90 días) queda fijo acá, no es
 * configurable desde la UI — si en el futuro hace falta, es el único
 * lugar a tocar.
 */

import { insightsRepository } from '../repositories/insights.repository.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / MS_PER_DAY);
}

export const insightsService = {
  async getUserSecurityInsights() {
    const [adUserCount, m365UserCount, staleLoginCount, stalePasswordCount, topStalePasswords, topStaleLogins] = await Promise.all([
      insightsRepository.countAdUsers(),
      insightsRepository.countM365Users(),
      insightsRepository.countAdUsersWithStaleLogin(),
      insightsRepository.countAdUsersWithStalePassword(),
      insightsRepository.topAdUsersByStalePassword(),
      insightsRepository.topAdUsersByStaleLogin(),
    ]);

    return {
      adUserCount,
      m365UserCount,
      staleLoginCount,
      stalePasswordCount,
      topStalePasswords: topStalePasswords.map((u) => ({
        ...u,
        daysSincePasswordChange: daysSince(u.passwordLastSetAt),
      })),
      topStaleLogins: topStaleLogins.map((u) => ({
        ...u,
        daysSinceLogin: daysSince(u.lastLoginAt),
      })),
    };
  },
};

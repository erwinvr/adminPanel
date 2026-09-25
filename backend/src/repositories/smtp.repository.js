import { createSettingsRepository } from './settings.js';

export const smtpRepository = {
  ...createSettingsRepository('smtp_settings'),
};

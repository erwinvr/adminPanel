/**
 * controllers/settingsControllerFactory.js
 *
 * `getSettings`/`saveSettings` son idénticos en ad/m365/backup/pam360/vuln/smtp
 * — cada uno solo cambia el servicio al que delegan. El resto de los
 * endpoints de cada controller (sync, envío de prueba, etc.) sigue
 * definido aparte porque sí difiere entre integraciones.
 *
 * @param {{ getSettings: () => Promise<any>, saveSettings: (req: any, body: any) => Promise<any> }} service
 */
export function createSettingsController(service) {
  return {
    async getSettings(req, res) {
      const settings = await service.getSettings();
      res.status(200).json({ success: true, data: settings });
    },

    async saveSettings(req, res) {
      const settings = await service.saveSettings(req, req.body);
      res.status(200).json({ success: true, data: settings });
    },
  };
}

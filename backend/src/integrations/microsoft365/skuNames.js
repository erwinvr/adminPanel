/**
 * integrations/microsoft365/skuNames.js
 *
 * Microsoft Graph devuelve el SKU como `skuPartNumber` (ej. "SPE_E3"),
 * no como el nombre comercial. Esta es una tabla de traducción PARCIAL
 * y de mejor esfuerzo para los SKUs más comunes — no pretende cubrir
 * el catálogo completo (esa lista la publica Microsoft y cambia
 * seguido). Si un SKU no está acá, se muestra su `skuPartNumber` tal
 * cual — nunca se pierde información, solo se pierde la traducción.
 */

const SKU_DISPLAY_NAMES = {
  SPE_E3: 'Microsoft 365 E3',
  SPE_E5: 'Microsoft 365 E5',
  SPB: 'Microsoft 365 Business Premium',
  O365_BUSINESS_ESSENTIALS: 'Microsoft 365 Business Basic',
  O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Standard',
  ENTERPRISEPACK: 'Office 365 E3',
  ENTERPRISEPREMIUM: 'Office 365 E5',
  ENTERPRISEWITHSCAL: 'Office 365 E4',
  STANDARDPACK: 'Office 365 E1',
  EXCHANGESTANDARD: 'Exchange Online (Plan 1)',
  EXCHANGEENTERPRISE: 'Exchange Online (Plan 2)',
  POWER_BI_PRO: 'Power BI Pro',
  POWER_BI_STANDARD: 'Power BI (gratis)',
  FLOW_FREE: 'Power Automate (gratis)',
  TEAMS_EXPLORATORY: 'Microsoft Teams Exploratory',
  AAD_PREMIUM: 'Azure AD Premium P1',
  AAD_PREMIUM_P2: 'Azure AD Premium P2',
  EMS: 'Enterprise Mobility + Security E3',
  EMSPREMIUM: 'Enterprise Mobility + Security E5',
};

export function friendlySkuName(skuPartNumber) {
  return SKU_DISPLAY_NAMES[skuPartNumber] ?? skuPartNumber;
}

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
  // Nombres oficiales de Microsoft ("Product names and service plan
  // identifiers for licensing") de los SKU restantes de este tenant.
  CCIBOTS_PRIVPREV_VIRAL: 'Microsoft Copilot Studio Viral Trial',
  Dynamics_365_Sales_Premium_Viral_Trial: 'Dynamics 365 Sales Premium Viral Trial',
  ENTERPRISEPREMIUM_NOPSTNCONF: 'Office 365 E5 Without Audio Conferencing',
  EOP_ENTERPRISE: 'Exchange Online Protection',
  MICROSOFT_BUSINESS_CENTER: 'Microsoft Business Center',
  POWERAPPS_DEV: 'Microsoft Power Apps for Developer',
  POWERAPPS_PER_APP_NEW: 'Power Apps per app plan (1 app or portal)',
  POWERAPPS_PER_USER: 'Power Apps Premium',
  POWERAPPS_VIRAL: 'Microsoft Power Apps Plan 2 Trial',
  Power_Pages_vTrial_for_Makers: 'Power Pages vTrial for Makers',
  RIGHTSMANAGEMENT_ADHOC: 'Rights Management Adhoc',
  STREAM: 'Microsoft Stream',
  TEAMS_ESSENTIALS_AAD: 'Microsoft Teams Essentials (AAD Identity)',
  THREAT_INTELLIGENCE: 'Microsoft Defender for Office 365 (Plan 2)',
  'Teams_Premium_(for_Departments)': 'Teams Premium (for Departments)',
  VISIOCLIENT: 'Visio Plan 2',
  VISIO_PLAN2_DEPT: 'Visio Plan 2',
  WINDOWS_STORE: 'Windows Store for Business',
  WIN10_VDA_E3: 'Windows 10/11 Enterprise E3',
};

// Microsoft no es consistente con las mayúsculas del String ID (Graph
// devuelve "Win10_VDA_E3", su tabla publica "WIN10_VDA_E3"): se busca
// sin distinguirlas.
const NAMES_BY_LOWERCASE_SKU = new Map(Object.entries(SKU_DISPLAY_NAMES).map(([sku, name]) => [sku.toLowerCase(), name]));

export function friendlySkuName(skuPartNumber) {
  return NAMES_BY_LOWERCASE_SKU.get(String(skuPartNumber).toLowerCase()) ?? skuPartNumber;
}

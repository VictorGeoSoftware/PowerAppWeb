/** Spanish strings of BmApp `CurrentUserConditionsView` and `FeeFirstGateBanner` (values-es). */
export const CUSTOMER_DATA_TITLE = "DATOS DEL CLIENTE";
export const HOLDER_LABEL = "Titular";
export const ADDRESS_LABEL = "Dirección";
export const CUPS_LABEL = "CUPS";
export const CUSTOMER_DATA_PLACEHOLDER = "Introduce el dato";
export const COMPANY_NAME_LABEL = "Comercializadora actual";
export const COMPANY_NAME_PLACEHOLDER = "Introduce la comercializadora";
export const CONDITIONS_TITLE = "CONDICIONES ACTUALES";
export const POWER_TERM_TITLE = "TÉRMINO DE POTENCIA";
export const ENERGY_TITLE = "ENERGÍA CONSUMIDA";
export const EXTRA_SERVICES_TITLE = "SERVICIOS EXTRA";
export const ANNUAL_AMOUNT = "Importe total anual";
export const PRICE_PLACEHOLDER = "0.00000000";
export const EXTRA_SERVICES_PLACEHOLDER = "0.00€";
export const GO_TO_PROPOSALS = "Ir a las propuestas de precios";

export const GATE_LOCKED_TITLE = "Propuestas bloqueadas";
export const GATE_LOCKED_MESSAGE = "Rellena todos los precios de potencia y energía para desbloquear el menú.";
export const GATE_UNLOCKED_TITLE = "Navegación desbloqueada";
export const GATE_UNLOCKED_MESSAGE = "Ya puedes consultar Propuestas y Configuración.";
export const gateProgress = (completed: number, required: number) =>
  `${completed} de ${required} campos completados`;

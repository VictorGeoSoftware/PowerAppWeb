/** Spanish strings of BmApp `ProposalsScreen` and comparator columns (values-es + fixed labels). */
export const PROPOSALS_TITLE = "Propuestas";
export const EMPTY_MESSAGE = "Aún no hay propuestas que comparar.";
export const ANNUAL_CONSUMPTION = "CONSUMO ANUAL";
export const POWER_TERM = "TÉRMINO DE POTENCIA";
export const ENERGY_CONSUMED = "ENERGÍA CONSUMIDA";
export const ANNUAL_POWER_COST = "Coste anual termino potencia";
export const ANNUAL_ENERGY_COST = "Coste anual termino energía";
export const EXTRA_SERVICES = "SERVICIOS EXTRA";
export const ANNUAL_COST = "Coste Anual";
export const ELECTRIC_TAX = "IMPUESTO ELÉCTRICO";
export const IVA = "IVA";
export const ANNUAL_BILL_TOTAL = "COSTE ANUAL FACTURA ELÉCTRICA";
export const CURRENT_TARIFF = "Tarifa actual";
export const FIXED_AMOUNT_PLACEHOLDER = "0.00";
export const fixedAmountLabel = (title: string) => `Importe fijo ${title}`;
export const bestOptionTitle = (title: string) => `Mejor opción: ${title}`;
export const bestOptionMessage = (saving: string) =>
  `Ahorro estimado de ${saving}\u00A0€ al año frente a sus condiciones actuales.`;
export const VISIBLE_PROPOSALS_TITLE = "Propuestas visibles";
export const VISIBLE_PROPOSALS_HINT = "Usa el botón a la izquierda de la propuesta para ocultarla/mostrarla";
export const CREATE_REPORT = "Crear informe";
/** Premium comprehensive report action (report-web-export). */
export const COMPREHENSIVE_REPORT = "Informe completo";
export const PDF_EXPORT_ERROR = "No se pudo generar el informe PDF.";
export const PDF_READY = "Informe listo";
export const SHARE_PDF = "Compartir PDF";
export const DOWNLOAD_PDF = "Descargar";
export const CLOSE_PDF_PANEL = "Cerrar";
export const PDF_SHARE_TITLE = "Comparador de propuestas";
/** Premium "Informe completo" outcomes (report-web-export, approved 2026-10-29). */
export const PREMIUM_REQUIRED_MESSAGE = "El informe completo requiere el plan Premium.";
export const PREMIUM_STUDY_EXPIRED =
  "El estudio no está disponible o ha caducado. Vuelve a consultar el suministro.";
export const PREMIUM_STUDY_NOT_READY =
  "El estudio todavía no ha terminado. Inténtalo de nuevo en unos minutos.";
export const PREMIUM_HOLDER_MISSING =
  "Indica el titular del suministro en Condiciones actuales para crear el informe completo.";
export const PREMIUM_ADDRESS_MISSING =
  "Indica la dirección del suministro en Condiciones actuales para crear el informe completo.";
export const PREMIUM_CONDITIONS_MISSING =
  "Completa las condiciones actuales antes de crear el informe completo.";
export const PREMIUM_DATA_MISMATCH =
  "Los datos de la comparativa no coinciden con el estudio. Revisa las propuestas y vuelve a intentarlo.";
export const PREMIUM_GENERATION_FAILED =
  "No se ha podido generar el informe completo. Inténtalo de nuevo.";
export const PREMIUM_UNAVAILABLE = "El informe completo todavía no está disponible.";
export const RETRY = "Reintentar";
export const PREMIUM_SHARE_TITLE = "Informe completo";

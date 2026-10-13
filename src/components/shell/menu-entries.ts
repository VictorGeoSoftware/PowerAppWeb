/** Menu entries in BmApp drawer order (`DrawerContent.kt`). Logout is rendered separately. */
export type MenuEntry = { label: string; href: string };

export const MENU_ENTRIES: readonly MenuEntry[] = [
  { label: "Condiciones actuales", href: "/current-conditions" },
  { label: "Propuestas", href: "/proposals" },
  { label: "Configuración", href: "/configuration" },
  { label: "Nuevo estudio de propuestas", href: "/fetch-consumption" },
];

export const LOGOUT_LABEL = "Cerrar sesión";

/** Screen a signed-in Broker lands on from `/` until `fee-first-gate` routes by stage. */
export const HOME_ROUTE = "/fetch-consumption";

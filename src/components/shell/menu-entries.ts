import { ROUTES } from "@/lib/gate/fee-first";

/**
 * Menu entries in BmApp drawer order (`DrawerContent.kt`), except "Nuevo estudio" first (deliberate deviation, see docs/specs/fee-first-gate.md Decisions). Logout is rendered separately.
 * `gated: false` entries are never locked; "Nuevo estudio" starts a new study instead of navigating.
 */
export type MenuEntry = { label: string; href: string; gated: boolean; newStudy?: boolean };

export const MENU_ENTRIES: readonly MenuEntry[] = [
  { label: "Nuevo estudio de propuestas", href: ROUTES.fetchConsumption, gated: false, newStudy: true },
  { label: "Condiciones actuales", href: ROUTES.currentConditions, gated: true },
  { label: "Propuestas", href: ROUTES.proposals, gated: true },
  { label: "Configuración", href: ROUTES.configuration, gated: true },
];

export const LOGOUT_LABEL = "Cerrar sesión";

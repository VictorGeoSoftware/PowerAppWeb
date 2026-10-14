/** nginx `client_max_body_size 50M` on BmBackend/BmInfra. */
export const MAX_BILL_BYTES = 50 * 1024 * 1024;

export type BillFileCheck = "ok" | "NOT_PDF" | "TOO_LARGE";

const hasPdfName = (name: string) => name.toLowerCase().endsWith(".pdf");

/** Web-only guard (BmApp's picker already filters by MIME). Some iOS providers report an empty `type`. */
export function checkBillFile(file: Pick<File, "name" | "type" | "size">): BillFileCheck {
  if (file.type !== "application/pdf" && !hasPdfName(file.name)) return "NOT_PDF";
  if (file.size > MAX_BILL_BYTES) return "TOO_LARGE";
  return "ok";
}

/** The backend rejects uploads whose filename does not end in `.pdf`. */
export function billUploadName(file: Pick<File, "name">): string {
  return hasPdfName(file.name) ? file.name : "factura.pdf";
}

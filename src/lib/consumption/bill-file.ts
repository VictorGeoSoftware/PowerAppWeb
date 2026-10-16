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

export type BillPhotoCheck = "ok" | "NOT_IMAGE" | "TOO_LARGE";

const PHOTO_TYPES = ["image/jpeg", "image/png"];
const hasPhotoName = (name: string) => /\.(jpe?g|png)$/i.test(name);

/** JPEG/PNG only (the backend sniffs magic bytes); HEIC and others are rejected locally. */
export function checkBillPhoto(file: Pick<File, "name" | "type" | "size">): BillPhotoCheck {
  const ok = PHOTO_TYPES.includes(file.type) || (file.type === "" && hasPhotoName(file.name));
  if (!ok) return "NOT_IMAGE";
  if (file.size > MAX_BILL_BYTES) return "TOO_LARGE";
  return "ok";
}

/** The backend picks the image type from the extension. */
export function photoUploadName(file: Pick<File, "name" | "type">): string {
  if (hasPhotoName(file.name)) return file.name;
  return file.type === "image/png" ? "factura.png" : "factura.jpg";
}

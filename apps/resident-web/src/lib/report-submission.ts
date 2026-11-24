export function getIncidentEvidenceStoragePath(
  residentId: string,
  idempotencyKey: string,
  contentType: string,
): string {
  const extension = contentType === "image/png"
    ? "png"
    : contentType === "image/webp"
      ? "webp"
      : "jpg";

  return `${residentId}/${idempotencyKey}/evidence.${extension}`;
}

export function isDefinitiveSubmissionFailure(code: string | undefined): boolean {
  return code !== undefined
    && /^[0-9A-Z]{5}$/.test(code)
    && !code.startsWith("08")
    && code !== "40003";
}

/* ─── Input Validation ─────────────────────────────────
   Validates user inputs before processing.
   ────────────────────────────────────────────────────── */

export const LIMITS = {
  MAX_PDF_SIZE_MB: 5,
  MAX_PDF_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB
  MAX_JD_LENGTH: 10000,
  MAX_RESUME_TEXT_LENGTH: 50000,
  MIN_JD_LENGTH: 50,
  MIN_RESUME_TEXT_LENGTH: 100,
  ALLOWED_FILE_TYPES: ["application/pdf"],
} as const;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a PDF file before upload.
 */
export function validatePDFFile(file: File): ValidationResult {
  if (!(LIMITS.ALLOWED_FILE_TYPES as readonly string[]).includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type "${file.type}". Only PDF files are accepted.`,
    };
  }

  if (file.size > LIMITS.MAX_PDF_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File too large (${sizeMB} MB). Maximum size is ${LIMITS.MAX_PDF_SIZE_MB} MB.`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: "File is empty." };
  }

  return { valid: true };
}

/**
 * Validate resume text input.
 */
export function validateResumeText(text: string): ValidationResult {
  const trimmed = text.trim();

  if (!trimmed) {
    return { valid: false, error: "Resume text is empty." };
  }

  if (trimmed.length < LIMITS.MIN_RESUME_TEXT_LENGTH) {
    return {
      valid: false,
      error: `Resume text is too short (${trimmed.length} chars). Minimum ${LIMITS.MIN_RESUME_TEXT_LENGTH} characters.`,
    };
  }

  if (trimmed.length > LIMITS.MAX_RESUME_TEXT_LENGTH) {
    return {
      valid: false,
      error: `Resume text is too long (${trimmed.length} chars). Maximum ${LIMITS.MAX_RESUME_TEXT_LENGTH} characters.`,
    };
  }

  return { valid: true };
}

/**
 * Validate job description input.
 */
export function validateJDText(text: string): ValidationResult {
  const trimmed = text.trim();

  if (!trimmed) {
    return { valid: false, error: "Job description is empty." };
  }

  if (trimmed.length < LIMITS.MIN_JD_LENGTH) {
    return {
      valid: false,
      error: `Job description is too short (${trimmed.length} chars). Minimum ${LIMITS.MIN_JD_LENGTH} characters for meaningful analysis.`,
    };
  }

  if (trimmed.length > LIMITS.MAX_JD_LENGTH) {
    return {
      valid: false,
      error: `Job description is too long (${trimmed.length} chars). Maximum ${LIMITS.MAX_JD_LENGTH} characters.`,
    };
  }

  return { valid: true };
}

/**
 * Sanitize text input — strip control characters, normalize whitespace.
 */
export function sanitizeText(text: string): string {
  const withoutControlChars = Array.from(text)
    .filter((char) => {
      const code = char.codePointAt(0);
      if (code === undefined) return false;

      // Keep tab/newline/carriage return for formatting consistency.
      if (code === 9 || code === 10 || code === 13) return true;

      // Drop C0/C1 and DEL control blocks.
      if (code <= 31 || code === 127 || (code >= 128 && code <= 159)) {
        return false;
      }

      // Drop invisible directional/formatting controls that can spoof text.
      if (
        (code >= 0x200b && code <= 0x200f) ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069) ||
        code === 0xfeff
      ) {
        return false;
      }

      return true;
    })
    .join("");

  return withoutControlChars
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\r/g, "\n")
    .trim();
}

/**
 * sanitize.ts — Utilitaires de sanitization des inputs texte.
 *
 * Utilisés pour nettoyer les champs texte libres avant stockage
 * et prévenir les injections XSS dans les réponses JSON.
 *
 * Note : NestJS + `forbidNonWhitelisted: true` + class-validator gèrent
 * la validation de structure. Ces fonctions gèrent la sanitization des
 * valeurs texte dans les champs autorisés.
 */

/** Entités HTML à échapper */
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
};

/**
 * Échappe les caractères HTML spéciaux dans une chaîne.
 * Empêche l'injection XSS dans les réponses JSON rendues en HTML.
 */
export function escapeHtml(input: string): string {
  return String(input).replace(/[&<>"'/]/g, (char) => HTML_ENTITIES[char] ?? char);
}

/**
 * Nettoie une chaîne de texte libre (nom, adresse, description).
 * - Supprime les balises HTML et scripts
 * - Limite la longueur
 * - Trim whitespace
 */
export function sanitizeText(input: string, maxLength = 500): string {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .replace(/<[^>]*>/g, "")                         // supprime balises HTML
    .replace(/javascript:/gi, "")                     // supprime proto JS
    .replace(/on\w+\s*=/gi, "")                      // supprime event handlers
    .slice(0, maxLength);
}

/**
 * Nettoie un numéro de téléphone.
 * Conserve uniquement : chiffres, +, espace, tiret, parenthèses.
 */
export function sanitizePhone(input: string): string {
  return String(input).replace(/[^\d+\s\-()]/g, "").slice(0, 20);
}

/**
 * Normalise un email : trim + lowercase.
 */
export function sanitizeEmail(input: string): string {
  return String(input).trim().toLowerCase().slice(0, 254);
}

/**
 * Sanitize un objet entier — applique sanitizeText sur toutes les valeurs string.
 * Utile pour les champs non typés (ex: données KYC).
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = sanitizeText(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

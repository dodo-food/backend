/**
 * env-validation.ts — Validation des variables d'environnement au démarrage.
 *
 * Arrête le serveur si des variables critiques sont manquantes en production.
 * Émet des avertissements en développement.
 *
 * Railway injecte DATABASE_URL automatiquement via le plugin PostgreSQL (pas DB_HOST/DB_PORT individuels).
 * REDIS_URL est optionnel — sans lui le cache fonctionne en mémoire.
 */

interface EnvSpec {
  name: string;
  required: "always" | "production" | "optional";
  description: string;
}

const ENV_SPECS: EnvSpec[] = [
  // ── Critique — bloque le démarrage si absent en production ──────────────────

  // Environnement
  { name: "NODE_ENV", required: "always", description: "Environnement (development / production)" },

  // Firebase Admin — requis pour toute authentification
  { name: "FIREBASE_PROJECT_ID",           required: "always",     description: "ID du projet Firebase" },
  { name: "FIREBASE_SERVICE_ACCOUNT_JSON", required: "production", description: "Service account Firebase Admin SDK (JSON minifié)" },

  // Base de données — Railway injecte DATABASE_URL via le plugin PostgreSQL lié
  { name: "DATABASE_URL", required: "production", description: "URL PostgreSQL (injectée automatiquement par le plugin PostgreSQL Railway)" },

  // ── Optionnel — avertissement uniquement, n'empêche pas le démarrage ────────

  // Redis — fallback mémoire si absent (BullMQ désactivé)
  { name: "REDIS_URL", required: "optional", description: "URL Redis (optionnel — fallback mémoire actif si absent)" },

  // CORS — vide = tout autoriser (comportement défini dans main.ts)
  { name: "CORS_ORIGIN", required: "optional", description: "Origines CORS (optionnel — vide = tout autoriser, déconseillé en prod)" },

  // Paiement YengaPay — requis uniquement pour le module paiement
  { name: "EXPO_PUBLIC_YENGAPAY_API_KEY",    required: "optional", description: "Clé API YengaPay (module paiement)" },
  { name: "EXPO_PUBLIC_YENGAPAY_MERCHANT_ID",required: "optional", description: "ID marchand YengaPay (module paiement)" },
  { name: "EXPO_PUBLIC_YENGAPAY_BASE_URL",   required: "optional", description: "URL base YengaPay (module paiement)" },
  { name: "YENGAPAY_WEBHOOK_SECRET",         required: "optional", description: "Secret HMAC webhook YengaPay" },

  // Email OTP Brevo — requis uniquement pour l'envoi d'emails
  { name: "BREVO_API_KEY", required: "optional", description: "Clé API Brevo (emails OTP)" },
  { name: "BREVO_SENDER",  required: "optional", description: "Email expéditeur Brevo" },

  // Cloudinary — requis uniquement pour l'upload de fichiers
  { name: "CLOUDINARY_CLOUD_NAME",    required: "optional", description: "Cloud name Cloudinary (upload)" },
  { name: "CLOUDINARY_API_KEY",       required: "optional", description: "Clé API Cloudinary (upload)" },
  { name: "CLOUDINARY_API_SECRET",    required: "optional", description: "Secret Cloudinary (upload)" },
  { name: "CLOUDINARY_UPLOAD_PRESET", required: "optional", description: "Preset Cloudinary (upload)" },

  // Google Maps — fallback Haversine si absent
  { name: "GOOGLE_MAPS_API_KEY", required: "optional", description: "Clé Google Maps (optionnel — fallback Haversine actif)" },
];

export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === "production";
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const spec of ENV_SPECS) {
    if (spec.required === "optional") continue;

    const value = process.env[spec.name];
    const isEmpty = !value || value.trim() === "";

    if (isEmpty) {
      if (spec.required === "always" || (spec.required === "production" && isProd)) {
        missing.push(`  ❌ ${spec.name} — ${spec.description}`);
      } else {
        warnings.push(`  ⚠️  ${spec.name} — ${spec.description}`);
      }
    }
  }

  // Redis absent → simple avertissement (pas bloquant)
  if (!process.env.REDIS_URL) {
    warnings.push("  ⚠️  REDIS_URL — absent → cache mémoire + BullMQ désactivé (recommandé: Upstash free tier)");
  }

  if (warnings.length > 0) {
    console.warn("\n[Env] Variables optionnelles manquantes :");
    warnings.forEach((w) => console.warn(w));
  }

  if (missing.length > 0) {
    const label = isProd ? "PRODUCTION" : "REQUISES";
    console.error(`\n[Env] ❌ Variables ${label} manquantes :\n`);
    missing.forEach((m) => console.error(m));
    if (isProd) {
      console.error(
        "\n[Env] Le serveur ne peut pas démarrer en production sans ces variables.\n" +
        "Configurez-les dans le Dashboard Railway → Variables.\n",
      );
      process.exit(1);
    }
  }
}

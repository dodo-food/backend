import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { validateEnv } from "./common/config/env-validation";

async function bootstrap() {
  // ── 1. Validation des variables d'environnement ──────────────────────────
  validateEnv();

  const logger = new Logger("Bootstrap");
  const isDev = process.env.NODE_ENV !== "production";

  // ── 2. Création de l'application — Express (requis pour Socket.IO) ───────
  //
  // ⚠️  IMPORTANT : NestJS utilise Express par défaut (pas Fastify).
  //     @nestjs/platform-socket.io / IoAdapter sont basés sur Express.
  //     FastifyAdapter est INCOMPATIBLE avec IoAdapter — les WebSockets ne
  //     se connectent pas (handshake échoue silencieusement).
  //     Si performances HTTP max sont nécessaires sans WebSocket, repasser
  //     en Fastify et utiliser un adaptateur Socket.IO compatible Fastify.
  //
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    rawBody: true,
  });

  // ── 3. Helmet — en-têtes de sécurité HTTP ─────────────────────────────────
  try {
    const helmet = require("helmet");
    app.use(
      helmet({
        contentSecurityPolicy: isDev
          ? false
          : {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc:  ["'self'"],
                styleSrc:   ["'self'", "'unsafe-inline'"],
                imgSrc:     ["'self'", "data:", "https://res.cloudinary.com"],
                connectSrc: ["'self'"],
                fontSrc:    ["'self'"],
                objectSrc:  ["'none'"],
                frameSrc:   ["'none'"],
              },
            },
        hsts: isDev
          ? false
          : { maxAge: 31536000, includeSubDomains: true, preload: true },
        frameguard:   { action: "deny" },
        noSniff:      true,
        xssFilter:    true,
        hidePoweredBy: true,
      }),
    );
  } catch {
    logger.warn(
      "helmet non installé — en-têtes de sécurité HTTP désactivés. " +
      "Installer avec : npm install helmet",
    );
  }

  // ── 4. WebSocket adapter — Socket.IO avec Express ─────────────────────────
  //     IoAdapter lit le serveur HTTP sous-jacent Express.
  //     Avec FastifyAdapter, cette injection échoue → WebSockets silencieusement cassés.
  app.useWebSocketAdapter(new IoAdapter(app));

  // ── 5. CORS — permissif en dev, strict en production ────────────────────
  //
  //  ⚠️  Clients mobiles React Native (iOS / Android) :
  //      Les apps mobiles natives N'envoient PAS l'en-tête Origin lors des
  //      requêtes HTTP normales ni des connexions WebSocket.
  //      Il faut donc autoriser les requêtes sans Origin (!origin → true).
  //
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : [];

  app.enableCors({
    origin: (origin, callback) => {
      // Clients mobiles natifs (React Native) : pas d'en-tête Origin → toujours autorisé
      if (!origin) {
        callback(null, true);
        return;
      }
      // En développement : tout autoriser
      if (isDev) {
        callback(null, true);
        return;
      }
      // En production : vérifier la liste blanche
      if (corsOrigins.length === 0 || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`CORS refusé — origine non autorisée : ${origin}`);
        callback(new Error(`CORS non autorisé pour l'origine : ${origin}`));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-Client-Platform"],
    credentials: true,
    maxAge: 86400,
  });

  // ── 6. Préfixe global API ─────────────────────────────────────────────────
  app.setGlobalPrefix("api/v1");

  // ── 7. ValidationPipe global ──────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );

  // ── 8. Filtre d'exceptions global ─────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── 9. Swagger — DÉSACTIVÉ en production ─────────────────────────────────
  if (isDev) {
    const config = new DocumentBuilder()
      .setTitle("FoodBF / Dodo API")
      .setDescription(
        "Backend principal — marketplace livraison Ouagadougou\n\n" +
        "⚠️ Documentation disponible en développement uniquement.",
      )
      .setVersion("1.0")
      .addBearerAuth(
        { type: "http", scheme: "bearer", bearerFormat: "Firebase ID Token" },
        "Firebase",
      )
      .addTag("Auth", "Authentification Firebase (token Bearer)")
      .addTag("Orders", "Commandes acheteur")
      .addTag("Vendors", "Interface vendeur (rôle: vendor)")
      .addTag("Drivers", "Interface livreur (rôle: driver)")
      .addTag("Restaurants", "Catalogue restaurants (lecture publique)")
      .addTag("Payments", "Paiements YengaPay + webhook")
      .addTag("Upload", "Upload fichiers Cloudinary")
      .addTag("Tracking", "Géolocalisation GPS temps réel")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(`📚 Swagger : http://localhost:${process.env.BACKEND_PORT ?? 3001}/api/docs`);
  } else {
    logger.log("📚 Swagger désactivé en production (NODE_ENV=production)");
  }

  // ── 10. Graceful shutdown ─────────────────────────────────────────────────
  app.enableShutdownHooks();

  // ── 11. Démarrage ────────────────────────────────────────────────────────
  //  Railway injecte PORT automatiquement.
  //  BACKEND_PORT est utilisé en développement local.
  //  ⚠️  NE PAS utiliser de valeur fixe autre que 0.0.0.0 pour l'host —
  //      Railway route via son proxy, le backend doit écouter sur toutes les interfaces.
  const port = parseInt(process.env.PORT ?? process.env.BACKEND_PORT ?? "3001", 10);
  await app.listen(port, "0.0.0.0");

  logger.log(`🚀 FoodBF Backend démarré — port ${port} — mode ${process.env.NODE_ENV ?? "development"}`);
  logger.log(`🌐 Adaptateur HTTP : Express (compatible Socket.IO)`);
  logger.log(`🔌 WebSockets : ws://0.0.0.0:${port}/tracking | ws://0.0.0.0:${port}/orders`);

  if (!process.env.PORT && !isDev) {
    logger.warn("⚠️  PORT non défini par Railway — vérifier la configuration du service web Railway");
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !isDev) {
    logger.warn("⚠️  FIREBASE_SERVICE_ACCOUNT_JSON absent — authentification Firebase Admin dégradée");
  }
}

bootstrap();

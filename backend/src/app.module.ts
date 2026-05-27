import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { BullModule } from "@nestjs/bullmq";
import { FirebaseModule } from "./firebase/firebase.module";
import { CacheModule } from "./cache/cache.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { DatabaseModule } from "./database/database.module";
import { RestaurantsModule } from "./modules/restaurants/restaurants.module";
import { FoodsModule } from "./modules/foods/foods.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { UsersModule } from "./modules/users/users.module";
import { VendorsModule } from "./modules/vendors/vendors.module";
import { DriversModule } from "./modules/drivers/drivers.module";
import { DeliveryModule } from "./modules/delivery/delivery.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { TrackingModule } from "./modules/tracking/tracking.module";
import { GeoModule } from "./modules/geo/geo.module";
import { UploadModule } from "./modules/upload/upload.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    // ── Rate Limiting global (anti brute force / spam) ─────────────────────
    ThrottlerModule.forRoot([
      { name: "global", ttl: 60_000, limit: 60 },
      { name: "strict", ttl: 60_000, limit: 10 },
    ]),

    // ── BullMQ — connexion Redis globale ───────────────────────────────────
    // Déclaré ici (root module) pour que tous les modules puissent utiliser
    // BullModule.registerQueue() sans redéclarer la connexion Redis.
    // maxRetriesPerRequest: null  — OBLIGATOIRE pour BullMQ avec ioredis
    // lazyConnect: true           — pas de crash au démarrage si Redis absent
    // enableOfflineQueue: false   — fail-fast, pas de queue infinie d'opérations
    BullModule.forRootAsync({
      useFactory: () => {
        const raw = process.env.REDIS_URL ?? "";
        // Upstash CLI syntax: "redis-cli --tls -u rediss://..." → extraire juste l'URL
        const url = raw.replace(/^.*?(rediss?:\/\/)/, "$1").trim() || "redis://localhost:6379";
        const isTls = url.startsWith("rediss://");
        return {
          connection: {
            url,
            ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
            maxRetriesPerRequest: null,
            lazyConnect: true,
            enableOfflineQueue: false,
            connectTimeout: 10_000,
            commandTimeout: 5_000,
          },
        };
      },
    }),

    // ── Infrastructure ─────────────────────────────────────────────────────
    FirebaseModule,   // @Global — Firebase Admin SDK (Auth + FCM + Firestore)
    CacheModule,      // @Global — Redis avec fallback mémoire (GPS, commandes actives)
    DatabaseModule,   // TypeORM PostgreSQL — DataSource globale (@InjectDataSource)
    RealtimeModule,   // WebSocket Gateways (GPS temps réel, statuts commandes)
    JobsModule,       // BullMQ workers — traitements asynchrones (file de commandes)

    // ── Utilisateurs ───────────────────────────────────────────────────────
    UsersModule,

    // ── Catalogue ─────────────────────────────────────────────────────────
    RestaurantsModule,
    FoodsModule,
    CategoriesModule,

    // ── Commandes & Livraison ──────────────────────────────────────────────
    OrdersModule,
    DeliveryModule,
    PaymentsModule,

    // ── Notifications & Tracking ───────────────────────────────────────────
    NotificationsModule,
    TrackingModule,

    // ── Géolocalisation ────────────────────────────────────────────────────
    GeoModule,

    // ── Rôles spécifiques ──────────────────────────────────────────────────
    VendorsModule,
    DriversModule,

    // ── Médias ────────────────────────────────────────────────────────────
    UploadModule,

    // ── Monitoring ────────────────────────────────────────────────────────
    HealthModule,   // GET /api/v1/health — PostgreSQL + Redis + Firebase + BullMQ
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

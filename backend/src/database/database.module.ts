import { Logger, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./entities/user.entity";
import { Restaurant } from "./entities/restaurant.entity";
import { Food } from "./entities/food.entity";
import { Order } from "./entities/order.entity";
import { OrderItem } from "./entities/order-item.entity";
import { Delivery } from "./entities/delivery.entity";
import { Payment } from "./entities/payment.entity";
import { Notification } from "./entities/notification.entity";
import { DriverLocation } from "./entities/driver-location.entity";

const logger = new Logger("DatabaseModule");

export const ALL_ENTITIES = [
  User, Restaurant, Food, Order, OrderItem,
  Delivery, Payment, Notification, DriverLocation,
];

const hasPostgres = (): boolean => {
  return !!(
    process.env.DATABASE_URL ||
    process.env.DB_HOST
  );
};

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        if (!hasPostgres()) {
          logger.warn(
            "DATABASE_URL absent — PostgreSQL désactivé (Firestore utilisé comme fallback). " +
            "Ajoutez DATABASE_URL dans les variables d'environnement Railway pour activer PostgreSQL.",
          );
          // Retourne une config invalide qui ne tente pas de connexion
          return {
            type: "postgres" as const,
            host: "localhost",
            port: 5432,
            username: "postgres",
            password: "postgres",
            database: "foodbf_disabled",
            entities: ALL_ENTITIES,
            synchronize: false,
            retryAttempts: 0,
            retryDelay: 0,
          };
        }

        const databaseUrl = process.env.DATABASE_URL;
        if (databaseUrl) {
          logger.log("PostgreSQL connecté via DATABASE_URL ✅");
          return {
            type: "postgres" as const,
            url: databaseUrl,
            entities: ALL_ENTITIES,
            synchronize: process.env.NODE_ENV !== "production",
            ssl: process.env.NODE_ENV === "production"
              ? { rejectUnauthorized: false }
              : false,
            logging: false,
          };
        }

        logger.log(`PostgreSQL connecté via ${process.env.DB_HOST}:${process.env.DB_PORT ?? 5432} ✅`);
        const syncEnabled = process.env.NODE_ENV !== "production";
        if (!syncEnabled) {
          logger.log("TypeORM synchronize désactivé en production — utiliser les migrations.");
        }
        return {
          type: "postgres" as const,
          host: process.env.DB_HOST!,
          port: parseInt(process.env.DB_PORT ?? "5432"),
          username: process.env.DB_USER ?? "postgres",
          password: process.env.DB_PASSWORD ?? "postgres",
          database: process.env.DB_NAME ?? "foodbf",
          entities: ALL_ENTITIES,
          synchronize: syncEnabled,
          logging: false,
        };
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

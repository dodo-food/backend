import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { Reflector } from "@nestjs/core";
import { HealthController, PingController } from "./health.controller";
import { HealthService } from "./health.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { QUEUE_ORDER_PREPARATION, QUEUE_NOTIFICATIONS } from "../jobs/jobs.module";

// FirebaseModule et CacheModule sont @Global() — pas besoin de les ré-importer.
// TypeOrmModule.forFeature([]) inutile — @InjectDataSource() est injecté globalement
// via DatabaseModule (TypeOrmModule.forRootAsync avec global:true).
// BullModule.forRootAsync est dans AppModule — on enregistre juste les queues ici.
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_ORDER_PREPARATION },
      { name: QUEUE_NOTIFICATIONS },
    ),
  ],
  controllers: [HealthController, PingController],
  providers: [HealthService, FirebaseAuthGuard, Reflector],
})
export class HealthModule {}

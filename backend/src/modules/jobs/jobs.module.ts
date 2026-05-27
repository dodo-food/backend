import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { JobsService } from "./jobs.service";
import { OrderPreparationProcessor } from "./processors/order-preparation.processor";
import { FirebaseModule } from "../../firebase/firebase.module";
import { CacheModule } from "../../cache/cache.module";
import { QUEUE_ORDER_PREPARATION, QUEUE_NOTIFICATIONS } from "./jobs.constants";

export { QUEUE_ORDER_PREPARATION, QUEUE_NOTIFICATIONS };

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_ORDER_PREPARATION },
      { name: QUEUE_NOTIFICATIONS },
    ),
    FirebaseModule,
    CacheModule,
  ],
  providers: [JobsService, OrderPreparationProcessor],
  exports: [JobsService],
})
export class JobsModule {}

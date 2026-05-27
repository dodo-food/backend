import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DeliveryController } from "./delivery.controller";
import { DeliveryService } from "./delivery.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { RealtimeModule } from "../../realtime/realtime.module";

@Module({
  imports: [RealtimeModule],
  controllers: [DeliveryController],
  providers: [DeliveryService, FirebaseAuthGuard, Reflector],
  exports: [DeliveryService],
})
export class DeliveryModule {}

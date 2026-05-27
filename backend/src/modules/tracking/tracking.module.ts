import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TrackingController } from "./tracking.controller";
import { TrackingService } from "./tracking.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { RealtimeModule } from "../../realtime/realtime.module";

@Module({
  imports: [RealtimeModule],
  controllers: [TrackingController],
  providers: [TrackingService, FirebaseAuthGuard, Reflector],
  exports: [TrackingService],
})
export class TrackingModule {}

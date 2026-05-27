import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { RealtimeModule } from "../../realtime/realtime.module";
import { MatchingModule } from "../matching/matching.module";

@Module({
  imports: [RealtimeModule, MatchingModule],
  controllers: [OrdersController],
  providers: [OrdersService, FirebaseAuthGuard, Reflector],
  exports: [OrdersService],
})
export class OrdersModule {}

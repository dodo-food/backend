import { Module } from "@nestjs/common";
import { TrackingGateway } from "./tracking.gateway";
import { OrdersGateway } from "./orders.gateway";

@Module({
  providers: [TrackingGateway, OrdersGateway],
  exports: [TrackingGateway, OrdersGateway],
})
export class RealtimeModule {}

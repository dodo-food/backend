import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GeoController } from "./geo.controller";
import { GeoService } from "./geo.service";
import { GrpcGeoClient } from "./grpc-geo.client";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";

@Module({
  controllers: [GeoController],
  providers: [GeoService, GrpcGeoClient, FirebaseAuthGuard, Reflector],
  exports: [GeoService, GrpcGeoClient],
})
export class GeoModule {}

import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RestaurantsController } from "./restaurants.controller";
import { RestaurantsService } from "./restaurants.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";

@Module({
  controllers: [RestaurantsController],
  providers: [RestaurantsService, FirebaseAuthGuard, Reflector],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}

import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FoodsController } from "./foods.controller";
import { FoodsService } from "./foods.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";

@Module({
  controllers: [FoodsController],
  providers: [FoodsService, FirebaseAuthGuard, Reflector],
  exports: [FoodsService],
})
export class FoodsModule {}

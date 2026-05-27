import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, FirebaseAuthGuard, Reflector],
  exports: [CategoriesService],
})
export class CategoriesModule {}

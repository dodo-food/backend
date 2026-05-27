import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DriversController } from "./drivers.controller";
import { DriversService } from "./drivers.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";

@Module({
  controllers: [DriversController],
  providers: [DriversService, FirebaseAuthGuard, Reflector],
  exports: [DriversService],
})
export class DriversModule {}

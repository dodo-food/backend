import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, FirebaseAuthGuard, Reflector],
  exports: [NotificationsService],
})
export class NotificationsModule {}

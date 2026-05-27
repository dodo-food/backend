import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";

@Module({
  controllers: [UsersController],
  providers: [UsersService, FirebaseAuthGuard, Reflector],
  exports: [UsersService],
})
export class UsersModule {}

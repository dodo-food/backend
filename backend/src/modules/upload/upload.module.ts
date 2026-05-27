import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UploadController } from "./upload.controller";
import { UploadService } from "./upload.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";

@Module({
  controllers: [UploadController],
  providers: [UploadService, FirebaseAuthGuard, Reflector],
  exports: [UploadService],
})
export class UploadModule {}

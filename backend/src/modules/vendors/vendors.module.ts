import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { VendorsController } from "./vendors.controller";
import { VendorsService } from "./vendors.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { JobsModule } from "../jobs/jobs.module";

// AUDIT v10 Fix (VE-C10b) : import de JobsModule pour permettre à VendorsService
// d'injecter JobsService et déclencher assign-driver via BullMQ quand status=ready.
@Module({
  imports: [JobsModule],
  controllers: [VendorsController],
  providers: [VendorsService, FirebaseAuthGuard, Reflector],
  exports: [VendorsService],
})
export class VendorsModule {}

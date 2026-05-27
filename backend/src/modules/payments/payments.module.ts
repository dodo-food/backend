import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PaymentsController } from "./payments.controller";
import { YengaPayService } from "./yengapay.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";

@Module({
  controllers: [PaymentsController],
  providers: [YengaPayService, FirebaseAuthGuard, Reflector],
  exports: [YengaPayService],
})
export class PaymentsModule {}

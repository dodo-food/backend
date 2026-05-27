import {
  Controller, Get, Post, Param, Body,
  UseGuards, Headers, HttpCode, HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { YengaPayService } from "./yengapay.service";
import { InitiatePaymentDto } from "./dto/initiate-payment.dto";
import { RefundPaymentDto } from "./dto/refund-payment.dto";
import { YengaPayWebhookDto } from "./dto/yengapay-webhook.dto";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

@ApiTags("Payments")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Controller("payments")
export class PaymentsController {
  constructor(private readonly yengaPay: YengaPayService) {}

  // ─── Initier un paiement ───────────────────────────────────────────────────
  // Strictement limité : 5 tentatives de paiement par minute par IP.
  // Protège contre le credential stuffing et les abus de paiement.

  @Post()
  @Roles("client", "vendor", "driver", "admin")
  @Throttle({ strict: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: "Initier un paiement YengaPay",
    description:
      "Méthodes disponibles : `orange_money` (one-step), `moov_money` (OTP), " +
      "`sank_money` (OTP), `telecel_money` (one-step), `coris_money` (OTP), `paypal` (redirect). " +
      "Le champ `phone` est obligatoire pour les 5 méthodes Mobile Money (format +226XXXXXXXX).",
  })
  initiate(@Body() dto: InitiatePaymentDto, @CurrentUser() user: any) {
    return this.yengaPay.initiatePayment(dto, user.uid);
  }

  // ─── Statut d'un paiement ─────────────────────────────────────────────────

  @Get(":orderId/status")
  @ApiOperation({
    summary: "Statut du paiement d'une commande",
    description:
      "Retourne le statut local Firestore. Si une clé YengaPay est configurée, " +
      "vérifie également le statut en temps réel sur l'API YengaPay.",
  })
  status(@Param("orderId") orderId: string, @CurrentUser() user: any) {
    return this.yengaPay.getPaymentStatus(orderId, user.uid);
  }

  // ─── Historique des transactions ──────────────────────────────────────────

  @Get(":orderId/history")
  @ApiOperation({
    summary: "Historique complet des transactions et remboursements d'une commande",
  })
  history(@Param("orderId") orderId: string, @CurrentUser() user: any) {
    return this.yengaPay.getTransactionHistory(orderId, user.uid);
  }

  // ─── Remboursement ────────────────────────────────────────────────────────
  // Limité à 3 remboursements par minute : opération sensible, jamais en rafale.

  @Post("refund")
  @Roles("client", "admin")
  @Throttle({ strict: { ttl: 60_000, limit: 3 } })
  @ApiOperation({
    summary: "Rembourser un paiement YengaPay",
    description:
      "Remboursement total ou partiel. " +
      "Règles métier : commande payée via YengaPay, " +
      "fenêtre maximale de 72h après le paiement, " +
      "montant ≤ solde remboursable restant.",
  })
  refund(@Body() dto: RefundPaymentDto, @CurrentUser() user: any) {
    return this.yengaPay.refundPayment(dto, user.uid);
  }

  // ─── Webhook YengaPay (PUBLIC — sans auth Firebase) ──────────────────────
  //
  // YengaPay appelle cette route automatiquement après chaque changement
  // de statut de paiement (DONE, FAILED, REFUNDED…).
  //
  // Sécurité :
  //   - Vérification de signature HMAC-SHA256 si YENGAPAY_WEBHOOK_SECRET est configuré
  //   - @Public() bypass le FirebaseAuthGuard (route serveur→serveur)
  //   - Rate limité à 30 req/min pour éviter les floods webhook
  //
  // Configuration : ajouter dans le tableau de bord YengaPay :
  //   URL : https://<BACKEND_PUBLIC_URL>/api/v1/payments/webhook/yengapay

  @Post("webhook/yengapay")
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ global: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: "Webhook YengaPay — notification de paiement en temps réel",
    description:
      "Endpoint public appelé par YengaPay après chaque événement de paiement. " +
      "Signature HMAC-SHA256 vérifiée si YENGAPAY_WEBHOOK_SECRET est configuré. " +
      "Retourne HTTP 200 dans tous les cas pour éviter les retries YengaPay.",
  })
  @ApiHeader({
    name: "X-YengaPay-Signature",
    description: "Signature HMAC-SHA256 de la payload — vérifiée si YENGAPAY_WEBHOOK_SECRET est configuré",
    required: false,
  })
  async webhook(
    @Body() dto: YengaPayWebhookDto,
    @Headers("x-yengapay-signature") signature?: string,
  ) {
    await this.yengaPay.handleWebhook(dto, signature);
    return { received: true };
  }
}

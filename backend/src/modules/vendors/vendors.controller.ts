import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { VendorsService } from "./vendors.service";
import { SubmitVendorKycDto } from "./dto/submit-kyc.dto";
import { ReviewKycDto } from "./dto/review-kyc.dto";
import { UpdateVendorOrderStatusDto } from "./dto/update-order-status.dto";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ParseFirestoreIdPipe } from "../../common/pipes/parse-uuid.pipe";
import { sanitizeObject } from "../../common/utils/sanitize";

@ApiTags("Vendors")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Controller("vendors")
export class VendorsController {
  constructor(private readonly service: VendorsService) {}

  // ── KYC Vendeur ───────────────────────────────────────────────────────────

  @Get("kyc")
  @Roles("vendor", "admin")
  @ApiOperation({ summary: "Statut KYC du vendeur connecté (rôle: vendor)" })
  getKyc(@CurrentUser() user: any) {
    return this.service.getKyc(user.uid);
  }

  @Post("kyc")
  @Roles("vendor")
  @Throttle({ strict: { ttl: 60_000, limit: 5 } }) // 5 soumissions KYC max / minute
  @ApiOperation({ summary: "Soumettre le dossier KYC vendeur (rôle: vendor)" })
  submitKyc(@Body() dto: SubmitVendorKycDto, @CurrentUser() user: any) {
    const sanitized = sanitizeObject(dto as any);
    return this.service.submitKyc(user.uid, sanitized);
  }

  /**
   * ⚠️ ADMIN UNIQUEMENT — Validation ou refus d'un KYC vendeur.
   *
   * Vulnérabilité précédente : endpoint accessible à tout utilisateur authentifié
   * (aucun contrôle de rôle). N'importe qui pouvait approuver son propre KYC.
   * Fix : @Roles('admin') + RolesGuard enforced.
   */
  @Patch("kyc/:uid/review")
  @Roles("admin")
  @ApiOperation({ summary: "⚠️ Valider/Refuser un KYC vendeur (rôle: admin uniquement)" })
  reviewKyc(
    @Param("uid", ParseFirestoreIdPipe) uid: string,
    @Body() dto: ReviewKycDto,
    @CurrentUser() reviewer: any,
  ) {
    return this.service.reviewKyc(uid, dto.status, dto.reason);
  }

  // ── Boutique Vendeur ──────────────────────────────────────────────────────

  @Get("shop")
  @Roles("vendor", "admin")
  @ApiOperation({ summary: "Boutique du vendeur connecté (rôle: vendor)" })
  getShop(@CurrentUser() user: any) {
    return this.service.getShop(user.uid);
  }

  @Put("shop")
  @Roles("vendor")
  @ApiOperation({ summary: "Créer ou mettre à jour la boutique (rôle: vendor)" })
  upsertShop(@Body() data: Record<string, unknown>, @CurrentUser() user: any) {
    const sanitized = sanitizeObject(data);
    return this.service.upsertShop(user.uid, sanitized);
  }

  @Get("products")
  @Roles("vendor", "admin")
  @ApiOperation({ summary: "Produits de la boutique (rôle: vendor)" })
  getProducts(@CurrentUser() user: any) {
    return this.service.getProducts(user.uid);
  }

  // ── Commandes Vendeur ─────────────────────────────────────────────────────

  @Get("orders")
  @Roles("vendor")
  @ApiOperation({ summary: "Commandes reçues par le vendeur connecté (rôle: vendor)" })
  getOrders(@CurrentUser() user: any) {
    return this.service.getOrders(user.uid);
  }

  @Patch("orders/:id/status")
  @Roles("vendor")
  @ApiOperation({ summary: "Changer le statut d'une commande vendeur (rôle: vendor)" })
  updateOrderStatus(
    @Param("id", ParseFirestoreIdPipe) id: string,
    @Body() dto: UpdateVendorOrderStatusDto,
    @CurrentUser() user: any,
  ) {
    const extra = dto.refusalReason ? { refusal_reason: dto.refusalReason } : undefined;
    return this.service.updateOrderStatus(id, user.uid, dto.status, extra);
  }
}

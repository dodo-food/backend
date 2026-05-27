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
import { DriversService } from "./drivers.service";
import { SubmitDriverKycDto } from "./dto/submit-kyc.dto";
import { ReviewDriverKycDto } from "./dto/review-kyc.dto";
import { UpdateDriverDeliveryStatusDto } from "./dto/update-delivery-status.dto";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ParseFirestoreIdPipe } from "../../common/pipes/parse-uuid.pipe";
import { sanitizeObject } from "../../common/utils/sanitize";

@ApiTags("Drivers")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Controller("drivers")
export class DriversController {
  constructor(private readonly service: DriversService) {}

  // ── KYC Livreur ───────────────────────────────────────────────────────────

  @Get("kyc")
  @Roles("driver", "admin")
  @ApiOperation({ summary: "Statut KYC du livreur connecté (rôle: driver)" })
  getKyc(@CurrentUser() user: any) {
    return this.service.getKyc(user.uid);
  }

  @Post("kyc")
  @Roles("driver")
  @Throttle({ strict: { ttl: 60_000, limit: 5 } }) // 5 soumissions KYC max / minute
  @ApiOperation({ summary: "Soumettre le dossier KYC livreur (rôle: driver)" })
  submitKyc(@Body() dto: SubmitDriverKycDto, @CurrentUser() user: any) {
    const sanitized = sanitizeObject(dto as any);
    return this.service.submitKyc(user.uid, sanitized);
  }

  /**
   * ⚠️ ADMIN UNIQUEMENT — Validation ou refus d'un KYC livreur.
   *
   * Vulnérabilité précédente : endpoint accessible à tout utilisateur authentifié.
   * N'importe qui pouvait approuver le KYC d'un livreur.
   * Fix : @Roles('admin') + RolesGuard enforced.
   */
  @Patch("kyc/:uid/review")
  @Roles("admin")
  @ApiOperation({ summary: "⚠️ Valider/Refuser un KYC livreur (rôle: admin uniquement)" })
  reviewKyc(
    @Param("uid", ParseFirestoreIdPipe) uid: string,
    @Body() dto: ReviewDriverKycDto,
  ) {
    return this.service.reviewKyc(uid, dto.status, dto.reason);
  }

  // ── Profil Livreur ────────────────────────────────────────────────────────

  @Get("profile")
  @Roles("driver", "admin")
  @ApiOperation({ summary: "Profil du livreur connecté (rôle: driver)" })
  getProfile(@CurrentUser() user: any) {
    return this.service.getProfile(user.uid);
  }

  @Put("profile")
  @Roles("driver")
  @ApiOperation({ summary: "Créer ou mettre à jour le profil livreur (rôle: driver)" })
  upsertProfile(@Body() data: Record<string, unknown>, @CurrentUser() user: any) {
    const sanitized = sanitizeObject(data);
    return this.service.upsertProfile(user.uid, sanitized);
  }

  @Patch("online")
  @Roles("driver")
  @ApiOperation({ summary: "Passer en ligne / hors ligne (rôle: driver)" })
  setOnline(@Body() body: { isOnline: boolean }, @CurrentUser() user: any) {
    return this.service.setOnlineStatus(user.uid, body.isOnline);
  }

  // ── Livraisons ────────────────────────────────────────────────────────────

  @Get("deliveries")
  @Roles("driver")
  @ApiOperation({ summary: "Historique des livraisons du livreur connecté (rôle: driver)" })
  getDeliveries(@CurrentUser() user: any) {
    return this.service.getDeliveries(user.uid);
  }

  @Patch("deliveries/:id/status")
  @Roles("driver")
  @ApiOperation({ summary: "Mettre à jour le statut d'une livraison (rôle: driver)" })
  updateDelivery(
    @Param("id", ParseFirestoreIdPipe) id: string,
    @Body() dto: UpdateDriverDeliveryStatusDto,
    @CurrentUser() user: any,
  ) {
    const { status, ...extra } = dto;
    return this.service.updateDeliveryStatus(id, user.uid, status, extra);
  }

  @Get("earnings")
  @Roles("driver")
  @ApiOperation({ summary: "Gains du livreur connecté (rôle: driver)" })
  getEarnings(@CurrentUser() user: any) {
    return this.service.getEarnings(user.uid);
  }
}

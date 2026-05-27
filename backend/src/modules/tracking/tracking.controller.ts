import { Controller, Get, Post, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { TrackingService } from "./tracking.service";
import { UpdateLocationDto } from "./dto/update-location.dto";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

@ApiTags("Tracking / Location")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("tracking")
export class TrackingController {
  constructor(private readonly service: TrackingService) {}

  @Post("location")
  @ApiOperation({ summary: "Mettre à jour la position GPS du livreur (livreur)" })
  updateLocation(@Body() dto: UpdateLocationDto, @CurrentUser() user: any) {
    return this.service.updateDriverLocation(user.uid, dto);
  }

  @Get("driver/:driverUserId")
  @ApiOperation({ summary: "Position actuelle d'un livreur" })
  getDriverLocation(@Param("driverUserId") driverUserId: string) {
    return this.service.getDriverLocation(driverUserId);
  }

  @Get("order/:orderId")
  @ApiOperation({ summary: "Suivi complet d'une commande (position livreur + statut)" })
  getOrderTracking(@Param("orderId") orderId: string, @CurrentUser() user: any) {
    return this.service.getOrderTracking(orderId, user.uid);
  }

  @Get("eta/:deliveryId")
  @ApiOperation({ summary: "ETA et timestamps d'une livraison" })
  getEta(@Param("deliveryId") deliveryId: string) {
    return this.service.getEta(deliveryId);
  }
}

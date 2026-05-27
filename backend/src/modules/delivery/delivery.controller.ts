import { Controller, Get, Post, Patch, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { DeliveryService } from "./delivery.service";
import { AssignDeliveryDto } from "./dto/assign-delivery.dto";
import { UpdateDeliveryStatusDto } from "./dto/update-delivery-status.dto";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

@ApiTags("Delivery")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Controller("delivery")
export class DeliveryController {
  constructor(private readonly service: DeliveryService) {}

  @Post("assign")
  @Roles("admin")
  @ApiOperation({ summary: "Assigner une livraison à un livreur (admin uniquement)" })
  assign(@Body() dto: AssignDeliveryDto) {
    return this.service.assignDelivery(dto);
  }

  @Patch(":id/status")
  @Roles("driver")
  @ApiOperation({ summary: "Mettre à jour le statut d'une livraison (livreur uniquement)" })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.service.updateStatus(id, dto, user.uid);
  }

  @Get("active")
  @Roles("driver")
  @ApiOperation({ summary: "Livraison active du livreur connecté" })
  getActive(@CurrentUser() user: any) {
    return this.service.getActiveDelivery(user.uid);
  }

  @Get("pending")
  @Roles("driver")
  @ApiOperation({ summary: "Livraisons en attente d'acceptation (livreur uniquement)" })
  getPending(@CurrentUser() user: any) {
    return this.service.getPendingDeliveries(user.uid);
  }

  @Get("history")
  @Roles("driver")
  @ApiOperation({ summary: "Historique des livraisons terminées (livreur uniquement)" })
  getHistory(@CurrentUser() user: any) {
    return this.service.getDeliveryHistory(user.uid);
  }
}

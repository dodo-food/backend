import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { OrdersService } from "./orders.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ParseFirestoreIdPipe } from "../../common/pipes/parse-uuid.pipe";

@ApiTags("Orders")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  // ── Commandes client ──────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "Historique des commandes de l'utilisateur connecté" })
  findMyOrders(@CurrentUser() user: any) {
    return this.service.findAllByUser(user.uid);
  }

  @Get(":id")
  @ApiOperation({ summary: "Détail d'une commande (propriétaire ou admin)" })
  findOne(
    @Param("id", ParseFirestoreIdPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findOne(id, user.uid);
  }

  // AUDIT v10 Fix (O-C5) : restreint la création de commande aux clients et admins.
  // L'ancienne version autorisait aussi les rôles "vendor" et "driver" à créer des commandes
  // pour le compte de clients, ce qui n'est pas conforme au modèle métier.
  @Post()
  @Roles("client", "admin")
  @Throttle({ strict: { ttl: 60_000, limit: 10 } }) // 10 commandes max / minute par IP
  @ApiOperation({ summary: "Passer une commande (rôle: client)" })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.uid);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Mettre à jour le statut d'une commande (propriétaire ou admin)" })
  updateStatus(
    @Param("id", ParseFirestoreIdPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.service.updateStatus(id, dto, user.uid);
  }

  // ── Vue Vendeur ───────────────────────────────────────────────────────────

  /**
   * Commandes d'un restaurant — RÉSERVÉ aux vendeurs et admins.
   *
   * Fix (v8) : vulnérabilité précédente — tout utilisateur authentifié pouvait consulter
   * les commandes de n'importe quel restaurant sans vérification de propriété.
   * Fix (v10) : la vérification de propriété est désormais aussi assurée en service
   *             via findAllByRestaurant(restaurantId, requesterUid, isAdmin).
   */
  @Get("restaurant/:restaurantId")
  @Roles("vendor", "admin")
  @ApiOperation({
    summary: "Commandes d'un restaurant (rôle: vendor — vérifie la propriété)",
  })
  findByRestaurant(
    @Param("restaurantId", ParseFirestoreIdPipe) restaurantId: string,
    @CurrentUser() user: any,
  ) {
    const userRole: string = user["role"] ?? "client";
    // Les admins voient toutes les commandes. Les vendeurs sont vérifiés en service.
    return this.service.findAllByRestaurant(restaurantId, user.uid, userRole === "admin");
  }
}

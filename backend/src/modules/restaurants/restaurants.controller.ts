import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { RestaurantsService } from "./restaurants.service";
import { CreateRestaurantDto } from "./dto/create-restaurant.dto";
import { UpdateRestaurantDto } from "./dto/update-restaurant.dto";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { ParseFirestoreIdPipe } from "../../common/pipes/parse-uuid.pipe";

@ApiTags("Restaurants")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Controller("restaurants")
export class RestaurantsController {
  constructor(private readonly service: RestaurantsService) {}

  // ── Lecture publique ──────────────────────────────────────────────────────

  @Public()
  @Get()
  @ApiOperation({ summary: "Liste tous les restaurants (public)" })
  @ApiQuery({ name: "category", required: false })
  findAll(@Query("category") category?: string) {
    return this.service.findAll(category);
  }

  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Détail d'un restaurant (public)" })
  findOne(@Param("id", ParseFirestoreIdPipe) id: string) {
    return this.service.findOne(id);
  }

  // ── Gestion admin uniquement ──────────────────────────────────────────────

  /**
   * ⚠️ ADMIN UNIQUEMENT — Les endpoints d'écriture sur les restaurants
   * doivent être réservés à l'administrateur.
   *
   * Vulnérabilité précédente : tout utilisateur authentifié pouvait créer,
   * modifier ou supprimer un restaurant.
   */

  @Post()
  @Roles("admin")
  @ApiOperation({ summary: "⚠️ Créer un restaurant (rôle: admin uniquement)" })
  create(@Body() dto: CreateRestaurantDto) {
    return this.service.create(dto);
  }

  @Put(":id")
  @Roles("admin")
  @ApiOperation({ summary: "⚠️ Modifier un restaurant (rôle: admin uniquement)" })
  update(
    @Param("id", ParseFirestoreIdPipe) id: string,
    @Body() dto: UpdateRestaurantDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @Roles("admin")
  @ApiOperation({ summary: "⚠️ Supprimer un restaurant (rôle: admin uniquement)" })
  remove(@Param("id", ParseFirestoreIdPipe) id: string) {
    return this.service.remove(id);
  }
}

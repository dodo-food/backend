import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { GeoService } from "./geo.service";
import { DistanceDto, RouteDto, OptimizeDto, MatchDto } from "./dto/distance.dto";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { Public } from "../../common/decorators/public.decorator";

@ApiTags("Geo / Microservices")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("geo")
export class GeoController {
  constructor(private readonly service: GeoService) {}

  @Public()
  @Get("health")
  @ApiOperation({ summary: "Santé des microservices Go (routing, optimizer, matcher)" })
  health() {
    return this.service.checkHealth();
  }

  @Post("distance")
  @ApiOperation({ summary: "Calcul de distance Haversine entre deux points GPS (routing Go)" })
  distance(@Body() dto: DistanceDto) {
    return this.service.getDistance(dto);
  }

  @Post("route")
  @ApiOperation({ summary: "Calcul de trajet multi-waypoints (routing Go)" })
  route(@Body() dto: RouteDto) {
    return this.service.getRoute(dto);
  }

  @Post("optimize")
  @ApiOperation({ summary: "Optimisation de l'ordre de livraison (optimizer Go, nearest-neighbor)" })
  optimize(@Body() dto: OptimizeDto) {
    return this.service.optimizeDeliveries(dto);
  }

  @Post("match")
  @ApiOperation({ summary: "Matching livreur ↔ commande (matcher Go, score multi-critères)" })
  match(@Body() dto: MatchDto) {
    return this.service.matchDriver(dto);
  }
}

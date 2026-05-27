import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { FoodsService } from "./foods.service";
import { CreateFoodDto } from "./dto/create-food.dto";
import { UpdateFoodDto } from "./dto/update-food.dto";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { Public } from "../../common/decorators/public.decorator";

@ApiTags("Foods")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("foods")
export class FoodsController {
  constructor(private readonly service: FoodsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Liste tous les plats, filtrable par restaurantId" })
  @ApiQuery({ name: "restaurantId", required: false })
  findAll(@Query("restaurantId") restaurantId?: string) {
    return this.service.findAll(restaurantId);
  }

  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Détail d'un plat" })
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: "Ajouter un plat (vendeur)" })
  create(@Body() dto: CreateFoodDto) {
    return this.service.create(dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Modifier un plat" })
  update(@Param("id") id: string, @Body() dto: UpdateFoodDto) {
    return this.service.update(id, dto);
  }

  @Patch(":id/toggle")
  @ApiOperation({ summary: "Basculer la disponibilité d'un plat" })
  toggle(@Param("id") id: string) {
    return this.service.toggleAvailability(id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Supprimer un plat" })
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}

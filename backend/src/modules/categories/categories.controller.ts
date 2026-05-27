import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { CategoriesService } from "./categories.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { Public } from "../../common/decorators/public.decorator";

@ApiTags("Categories")
@UseGuards(FirebaseAuthGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Liste toutes les catégories (public)" })
  findAll() {
    return this.service.findAll();
  }
}

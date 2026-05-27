import { Controller, Get, Patch, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

@ApiTags("Users")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get("me")
  @ApiOperation({ summary: "Profil de l'utilisateur connecté" })
  getMe(@CurrentUser() user: any) {
    return this.service.getProfile(user.uid);
  }

  @Patch("me")
  @ApiOperation({ summary: "Modifier le profil" })
  updateMe(@Body() dto: UpdateUserDto, @CurrentUser() user: any) {
    return this.service.updateProfile(user.uid, dto);
  }

  @Get("me/loyalty")
  @ApiOperation({ summary: "Points de fidélité" })
  getLoyalty(@CurrentUser() user: any) {
    return this.service.getLoyaltyPoints(user.uid);
  }
}

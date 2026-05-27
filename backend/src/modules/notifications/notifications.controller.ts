import { Controller, Get, Post, Patch, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { NotificationsService } from "./notifications.service";
import { SendNotificationDto } from "./dto/send-notification.dto";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

class SaveFcmTokenDto {
  @ApiProperty({ example: "fcm-device-token-string" })
  @IsString()
  fcmToken: string;
}

@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Post()
  @ApiOperation({ summary: "Envoyer une notification in-app + push FCM (système/admin)" })
  send(@Body() dto: SendNotificationDto) {
    return this.service.send(dto);
  }

  @Post("fcm-token")
  @ApiOperation({ summary: "Enregistrer le token FCM de l'appareil" })
  saveFcmToken(@Body() dto: SaveFcmTokenDto, @CurrentUser() user: any) {
    return this.service.saveFcmToken(user.uid, dto.fcmToken);
  }

  @Get()
  @ApiOperation({ summary: "Notifications de l'utilisateur connecté" })
  getMyNotifs(@CurrentUser() user: any) {
    return this.service.getForUser(user.uid);
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Nombre de notifications non lues" })
  unreadCount(@CurrentUser() user: any) {
    return this.service.getUnreadCount(user.uid);
  }

  // N-C5 fix : passage de user.uid pour vérifier la propriété en service (anti-IDOR).
  // L'ancienne version ne passait pas l'UID → n'importe quel utilisateur authentifié
  // pouvait marquer la notification d'un autre comme lue s'il connaissait son ID.
  @Patch(":id/read")
  @ApiOperation({ summary: "Marquer une notification comme lue (propriétaire uniquement)" })
  markRead(@Param("id") id: string, @CurrentUser() user: any) {
    return this.service.markRead(id, user.uid);
  }

  @Patch("read-all")
  @ApiOperation({ summary: "Marquer toutes les notifications comme lues" })
  markAllRead(@CurrentUser() user: any) {
    return this.service.markAllRead(user.uid);
  }
}

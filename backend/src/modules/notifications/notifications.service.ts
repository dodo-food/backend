import { Injectable, Logger, ForbiddenException } from "@nestjs/common";
import { FirebaseService } from "../../firebase/firebase.service";
import { SendNotificationDto } from "./dto/send-notification.dto";
import { NotifType } from "../../common/domain/entities";

const NOTIF_LABELS: Record<NotifType, string> = {
  order_placed:    "Commande reçue ✅",
  order_accepted:  "Commande acceptée 🍽️",
  preparing:       "En préparation 🔥",
  delivering:      "En livraison 🛵",
  delivered:       "Livrée 🎉",
  cancelled:       "Commande annulée ❌",
  driver_assigned: "Nouvelle course 🛵",
  promo:           "Promotion Dodo 🎁",
  system:          "Dodo",
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly col = "notifications";

  constructor(private readonly firebase: FirebaseService) {}

  async send(dto: SendNotificationDto) {
    const title = NOTIF_LABELS[dto.type] ?? "Dodo";
    // AUDIT v8 Fix (BE-C2) : le champ Firestore doit être "body" (pas "message").
    // NotificationsContext.snapToNotif lit data.body pour construire AppNotification.body.
    // L'ancienne version écrivait "message" → body était toujours vide/undefined côté client.
    const payload: Record<string, any> = {
      user_id:    dto.userId,
      type:       dto.type,
      title,
      body:       dto.message,
      is_read:    false,
      created_at: new Date().toISOString(),
    };
    if (dto.orderId)   payload.order_id  = dto.orderId;
    if (dto.orderRef)  payload.order_ref = dto.orderRef;

    const ref = await this.firebase.db.collection(this.col).add(payload);

    const fcmToken = await this.firebase.getFcmToken(dto.userId);
    if (fcmToken) {
      const pushData: Record<string, string> = { type: dto.type, notifId: ref.id };
      if (dto.orderId)  pushData.orderId  = dto.orderId;
      if (dto.orderRef) pushData.orderRef = dto.orderRef;

      await this.firebase.sendPushNotification({
        fcmToken,
        title,
        body: dto.message,
        data: pushData,
      });
      this.logger.log(`FCM push envoyé → user:${dto.userId} type:${dto.type}`);
    } else {
      this.logger.debug(`Pas de token FCM pour user:${dto.userId} — push skippé`);
    }

    return { id: ref.id, ...payload };
  }

  async saveFcmToken(uid: string, fcmToken: string) {
    await this.firebase.saveFcmToken(uid, fcmToken);
    return { success: true, uid };
  }

  async getForUser(userId: string) {
    const snap = await this.firebase.db
      .collection(this.col)
      .where("user_id", "==", userId)
      .orderBy("created_at", "desc")
      .limit(50)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // N-C5 fix : vérification de propriété avant mise à jour — empêche un utilisateur
  // authentifié de marquer la notification d'un autre utilisateur comme lue (IDOR).
  async markRead(notifId: string, userId: string) {
    const docRef = this.firebase.db.collection(this.col).doc(notifId);
    const snap = await docRef.get();
    if (!snap.exists) return { id: notifId, is_read: true };
    const data = snap.data() as any;
    if (data.user_id !== userId) throw new ForbiddenException("Accès refusé");
    await docRef.update({ is_read: true, read_at: new Date().toISOString() });
    return { id: notifId, is_read: true };
  }

  async markAllRead(userId: string) {
    const snap = await this.firebase.db
      .collection(this.col)
      .where("user_id", "==", userId)
      .where("is_read", "==", false)
      .get();
    const batch = this.firebase.db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { is_read: true }));
    await batch.commit();
    return { updated: snap.size };
  }

  async getUnreadCount(userId: string) {
    const snap = await this.firebase.db
      .collection(this.col)
      .where("user_id", "==", userId)
      .where("is_read", "==", false)
      .get();
    return { userId, unreadCount: snap.size };
  }
}

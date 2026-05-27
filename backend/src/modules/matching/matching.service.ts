import { Injectable, Logger } from "@nestjs/common";
import { FirebaseService } from "../../firebase/firebase.service";
import { CacheService } from "../../cache/cache.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrdersGateway } from "../../realtime/orders.gateway";

export interface DriverCandidate {
  userId: string;
  distanceKm: number;
  estimatedMinutes: number;
  rating: number;
  lat: number;
  lng: number;
}

const AVERAGE_SPEED_KMH = 25; // Vitesse moto Ouagadougou heure de pointe

function haversine(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsService,
  ) {}

  async findNearestDrivers(
    restaurantLat: number,
    restaurantLng: number,
    maxDrivers = 5,
  ): Promise<DriverCandidate[]> {
    // AUDIT v8 Fix (M-C1) : champ Firestore snake_case "is_online" (pas camelCase "isOnline")
    // La version précédente utilisait isOnline → retournait toujours 0 livreurs disponibles.
    const snap = await this.firebase.db
      .collection("driver_profiles")
      .where("is_online", "==", true)
      .get();

    if (snap.empty) return [];

    const candidates: DriverCandidate[] = [];

    for (const doc of snap.docs) {
      const profile = doc.data() as any;
      // AUDIT v8 Fix (M-C1b) : user_id snake_case (pas userId)
      const uid: string = profile.user_id ?? doc.id;

      // Filtre : pas plus de 2 livraisons actives
      const activeSnap = await this.firebase.db
        .collection("driver_deliveries")
        .where("driver_user_id", "==", uid)
        .where("status", "in", ["assigned", "accepted", "heading_to_vendor", "at_vendor", "heading_to_client"])
        .get();
      if (activeSnap.size >= 2) continue;

      // Récupère la position (cache Redis → Firestore)
      const cachedLoc = await this.cache.getDriverLocation(uid);
      let lat: number | null = cachedLoc?.lat ?? null;
      let lng: number | null = cachedLoc?.lng ?? null;

      if (lat === null || lng === null) {
        const locDoc = await this.firebase.db
          .collection("driver_locations")
          .doc(uid)
          .get();
        if (!locDoc.exists) continue;
        const loc = locDoc.data() as any;
        lat = loc.lat;
        lng = loc.lng;

        // AUDIT v10 Fix (M-C2) : champ snake_case updated_at (pas camelCase updatedAt)
        // L'ancienne version utilisait loc.updatedAt qui était toujours undefined → new Date(undefined)
        // retourne NaN → le filtre des 15 min ne fonctionnait jamais → positions périmées acceptées.
        const updatedAt = loc.updated_at ? new Date(loc.updated_at).getTime() : 0;
        if (Date.now() - updatedAt > 15 * 60 * 1000) continue;
      }

      const distanceKm = haversine(restaurantLat, restaurantLng, lat!, lng!);
      const estimatedMinutes = Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60 * 10) / 10;

      candidates.push({
        userId: uid,
        distanceKm: Math.round(distanceKm * 100) / 100,
        estimatedMinutes,
        rating: profile.rating ?? 4.5,
        lat: lat!,
        lng: lng!,
      });
    }

    candidates.sort((a, b) => a.distanceKm - b.distanceKm);
    return candidates.slice(0, maxDrivers);
  }

  async autoAssign(params: {
    orderId: string;
    orderRef: string;
    restaurantId: string;
    restaurantName: string;
    restaurantLat?: number;
    restaurantLng?: number;
    restaurantAddress?: string;
    restaurantPhone?: string;
    clientUserId: string;
    clientName?: string;
    clientAddress?: string;
    clientLat?: number;
    clientLng?: number;
    clientPhone?: string;
    items?: { name: string; quantity: number }[];
    deliveryFee?: number;
    paymentMethod?: string;
    ordersGateway?: OrdersGateway;
  }): Promise<{ assigned: boolean; driverUserId?: string; distanceKm?: number; estimatedMinutes?: number }> {
    const { restaurantLat, restaurantLng } = params;

    if (!restaurantLat || !restaurantLng) {
      this.logger.warn(
        `AutoMatch ignoré pour commande ${params.orderId} — coordonnées restaurant absentes`,
      );
      return { assigned: false };
    }

    const candidates = await this.findNearestDrivers(restaurantLat, restaurantLng, 5);

    if (candidates.length === 0) {
      this.logger.warn(`AutoMatch : aucun livreur disponible pour commande ${params.orderId}`);
      return { assigned: false };
    }

    const best = candidates[0];
    this.logger.log(
      `AutoMatch : livreur ${best.userId} sélectionné — distance ${best.distanceKm} km (${best.estimatedMinutes} min)`,
    );

    const now = new Date().toISOString();
    // AUDIT v9 Fix (MA-C1) : vendor enrichi avec lat, lng, address, phone.
    // L'ancienne version ne transmettait que name et restaurantId → delivery.tsx
    // affichait undefined pour vendorPos (carte), vendorName et vendorAddress.
    // AUDIT v9 Fix (MA-C2) : client enrichi avec name, lat, lng, phone.
    // L'ancienne version ne transmettait que address et user_id → delivery.tsx
    // affichait undefined pour clientPos (carte), clientName et clientPhone.
    const deliveryData = {
      driver_user_id: best.userId,
      order_id: params.orderId,
      ref: params.orderRef,
      vendor: {
        name:          params.restaurantName,
        restaurant_id: params.restaurantId,
        address:       params.restaurantAddress ?? "",
        lat:           params.restaurantLat ?? null,
        lng:           params.restaurantLng ?? null,
        phone:         params.restaurantPhone ?? "",
      },
      // AUDIT v8 Fix (DC-C13) : user_id en snake_case (était userId camelCase)
      // → le champ userId était illisible par DriverContext qui lit row.client.user_id.
      client: {
        name:    params.clientName ?? "Client",
        address: params.clientAddress ?? "",
        lat:     params.clientLat ?? null,
        lng:     params.clientLng ?? null,
        phone:   params.clientPhone ?? "",
        user_id: params.clientUserId,
      },
      items_summary: (params.items ?? []).map((i) => `${i.quantity}x ${i.name}`).join(", "),
      delivery_fee: params.deliveryFee ?? 1000,
      payment_method: params.paymentMethod ?? "cash",
      status: "assigned",
      distance_km: best.distanceKm,
      estimated_minutes: best.estimatedMinutes,
      assigned_at: now,
      auto_assigned: true,
    };

    const deliveryRef = await this.firebase.db.collection("driver_deliveries").add(deliveryData);

    // AUDIT v10 Fix (M-C3) : champs snake_case dans la mise à jour de la commande.
    // L'ancienne version écrivait driverUserId, deliveryId, estimatedMinutes, updatedAt (camelCase)
    // → champs illisibles par les queries et le frontend qui utilisent snake_case.
    await this.firebase.db.collection("orders").doc(params.orderId).update({
      status:             "En livraison",
      driver_user_id:     best.userId,
      delivery_id:        deliveryRef.id,
      estimated_minutes:  best.estimatedMinutes,
      updated_at:         now,
    });

    // Notification FCM + Firestore au livreur
    try {
      await this.notifications.send({
        userId: best.userId,
        type: "driver_assigned",
        message: `Nouvelle course : ${params.restaurantName} → livraison à ${best.estimatedMinutes} min`,
        orderId: params.orderId,
        orderRef: params.orderRef,
      });
    } catch (err) {
      this.logger.error(`Erreur notification livreur ${best.userId}`, err);
    }

    // Notification FCM + Firestore au client
    try {
      await this.notifications.send({
        userId: params.clientUserId,
        type: "delivering",
        message: `Votre livreur arrive ! Livraison estimée dans ${best.estimatedMinutes} min`,
        orderId: params.orderId,
        orderRef: params.orderRef,
      });
    } catch (err) {
      this.logger.error(`Erreur notification client ${params.clientUserId}`, err);
    }

    // WebSocket — emit aux rooms concernées
    params.ordersGateway?.emitDeliveryAssigned(best.userId, {
      id: deliveryRef.id,
      ...deliveryData,
    });
    params.ordersGateway?.emitOrderStatusUpdate(params.orderId, {
      orderId: params.orderId,
      status: "En livraison",
      ref: params.orderRef,
      driverUserId: best.userId,
      estimatedMinutes: best.estimatedMinutes,
      updated_at: now,
    });

    return {
      assigned: true,
      driverUserId: best.userId,
      distanceKm: best.distanceKm,
      estimatedMinutes: best.estimatedMinutes,
    };
  }
}

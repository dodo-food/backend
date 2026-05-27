import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { FirebaseService } from "../../firebase/firebase.service";
import { UpdateLocationDto } from "./dto/update-location.dto";
import { CacheService } from "../../cache/cache.service";
import { TrackingGateway } from "../../realtime/tracking.gateway";

@Injectable()
export class TrackingService {
  private readonly colLocations = "driver_locations";
  private readonly colOrders = "orders";
  private readonly colDeliveries = "driver_deliveries";

  constructor(
    private readonly firebase: FirebaseService,
    private readonly cache: CacheService,
    @Optional() private readonly trackingGateway?: TrackingGateway,
  ) {}

  async updateDriverLocation(driverUserId: string, dto: UpdateLocationDto) {
    const now = new Date().toISOString();
    // AUDIT v9 Fix (TS-C3) : champs Firestore snake_case dans locationData.
    // L'ancienne version écrivait driverUserId (camelCase) et updatedAt (camelCase)
    // → matching.service.ts filtrait sur updated_at (snake_case) → filtre 15 min ignoré
    // → positions périmées acceptées pour le matching livreur.
    const locationData = {
      driver_user_id: driverUserId,
      lat:            dto.lat,
      lng:            dto.lng,
      delivery_id:    dto.deliveryId ?? null,
      updated_at:     now,
    };

    await Promise.all([
      this.firebase.db
        .collection(this.colLocations)
        .doc(driverUserId)
        .set(locationData, { merge: true }),
      this.cache.setDriverLocation(driverUserId, dto.lat, dto.lng),
    ]);

    this.trackingGateway?.broadcastDriverLocation(driverUserId, dto.lat, dto.lng, {
      deliveryId: dto.deliveryId,
      orderId:    dto.orderId,
    });

    return locationData;
  }

  async getDriverLocation(driverUserId: string) {
    const cached = await this.cache.getDriverLocation(driverUserId);
    if (cached) {
      return { driverUserId, ...cached, source: "cache" };
    }

    const doc = await this.firebase.db
      .collection(this.colLocations)
      .doc(driverUserId)
      .get();
    if (!doc.exists) throw new NotFoundException("Position livreur introuvable");
    return { id: doc.id, ...doc.data(), source: "firestore" };
  }

  async getOrderTracking(orderId: string, userId: string) {
    const orderDoc = await this.firebase.db.collection(this.colOrders).doc(orderId).get();
    if (!orderDoc.exists) throw new NotFoundException(`Commande ${orderId} introuvable`);
    const order = orderDoc.data() as any;
    // AUDIT v9 Fix (TS-C1) : SÉCURITÉ — contrôle d'autorisation cassé.
    // L'ancienne version utilisait order.userId (camelCase) qui est toujours undefined
    // dans Firestore (snake_case) → la condition était toujours fausse → n'importe
    // quel utilisateur authentifié pouvait voir le tracking de toute commande.
    if (order.user_id !== userId) throw new NotFoundException("Commande non autorisée");

    // AUDIT v9 Fix (TS-C2) : champs snake_case dans la réponse getOrderTracking.
    // L'ancienne version retournait estimatedDelivery / driverUserId (camelCase)
    // → toujours null/undefined car Firestore stocke en snake_case.
    const driverUserId: string | null = order.driver_user_id ?? null;
    const result: Record<string, any> = {
      orderId,
      status:             order.status,
      estimated_delivery: order.estimated_delivery ?? null,
      driver_user_id:     driverUserId,
    };

    // AUDIT v9 Fix (TS-C2b) : utiliser driver_user_id (snake_case) pour la lookup.
    if (driverUserId) {
      const cached = await this.cache.getDriverLocation(driverUserId);
      if (cached) {
        // AUDIT v9 Fix (TS-C4) : updated_at snake_case dans la réponse driverLocation.
        result.driverLocation = { lat: cached.lat, lng: cached.lng, updated_at: cached.updatedAt, source: "cache" };
      } else {
        const locationDoc = await this.firebase.db
          .collection(this.colLocations)
          .doc(driverUserId)
          .get();
        if (locationDoc.exists) {
          const loc = locationDoc.data() as any;
          // AUDIT v9 Fix (TS-C4b) : lire updated_at (snake_case) depuis Firestore.
          result.driverLocation = { lat: loc.lat, lng: loc.lng, updated_at: loc.updated_at, source: "firestore" };
        }
      }
    }

    return result;
  }

  async getEta(deliveryId: string) {
    const doc = await this.firebase.db.collection(this.colDeliveries).doc(deliveryId).get();
    if (!doc.exists) throw new NotFoundException(`Livraison ${deliveryId} introuvable`);
    const data = doc.data() as any;
    return {
      deliveryId,
      status:            data.status,
      estimatedMinutes:  data.estimated_minutes ?? null,
      assignedAt:        data.assigned_at ?? null,
      acceptedAt:        data.accepted_at ?? null,
      pickedUpAt:        data.picked_up_at ?? null,
      deliveredAt:       data.delivered_at ?? null,
    };
  }
}

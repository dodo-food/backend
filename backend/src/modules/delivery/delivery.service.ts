import { Injectable, NotFoundException, BadRequestException, Optional } from "@nestjs/common";
import { FirebaseService } from "../../firebase/firebase.service";
import { AssignDeliveryDto } from "./dto/assign-delivery.dto";
import { UpdateDeliveryStatusDto } from "./dto/update-delivery-status.dto";
import { OrdersGateway } from "../../realtime/orders.gateway";

@Injectable()
export class DeliveryService {
  private readonly colDeliveries = "driver_deliveries";
  private readonly colOrders = "orders";

  constructor(
    private readonly firebase: FirebaseService,
    @Optional() private readonly ordersGateway?: OrdersGateway,
  ) {}

  async assignDelivery(dto: AssignDeliveryDto) {
    const orderDoc = await this.firebase.db.collection(this.colOrders).doc(dto.orderId).get();
    if (!orderDoc.exists) throw new NotFoundException(`Commande ${dto.orderId} introuvable`);
    const order = orderDoc.data() as any;

    const deliveryData = {
      driver_user_id:    dto.driverUserId,
      order_id:          dto.orderId,
      ref:               order.ref ?? "—",
      // AUDIT v10 Fix (DC-C11) : lecture snake_case depuis le doc orders
      // AUDIT v8 Fix (BE-C1) : ajout lat/lng dans vendor et client pour la carte de livraison.
      // Sans ces coordonnées, delivery.tsx utilisait le fallback par défaut (centre Ouagadougou)
      // au lieu des positions réelles du restaurant et du client.
      vendor: {
        name:    order.restaurant_name ?? order.restaurantName ?? "Restaurant",
        address: order.restaurant_address ?? order.delivery_address ?? order.address ?? "",
        lat:     order.restaurant_lat ?? order.restaurantLat ?? null,
        lng:     order.restaurant_lng ?? order.restaurantLng ?? null,
        phone:   order.restaurant_phone ?? order.restaurantPhone ?? "",
      },
      client: {
        address: order.delivery_address ?? order.address ?? "",
        lat:     order.delivery_lat ?? order.deliveryLat ?? null,
        lng:     order.delivery_lng ?? order.deliveryLng ?? null,
        phone:   order.customer_phone ?? order.phone ?? "",
        user_id: order.user_id,
      },
      items_summary:     (order.items ?? [])
        .map((i: any) => `${i.quantity}x ${i.name}`)
        .join(", "),
      delivery_fee:      order.delivery_fee ?? order.deliveryFee ?? 1000,
      payment_method:    order.payment_method ?? order.paymentMethod ?? "cash",
      status:            "assigned",
      distance_km:       dto.distanceKm ?? null,
      estimated_minutes: dto.estimatedMinutes ?? 30,
      assigned_at:       new Date().toISOString(),
    };

    const ref = await this.firebase.db.collection(this.colDeliveries).add(deliveryData);

    // AUDIT v10 Fix (DC-C5) : champs snake_case dans la mise à jour de la commande.
    // L'ancienne version écrivait driverUserId, deliveryId, updatedAt (camelCase)
    // → illisibles par le frontend et les autres services qui utilisent snake_case.
    await this.firebase.db.collection(this.colOrders).doc(dto.orderId).update({
      status:         "En livraison",
      driver_user_id: dto.driverUserId,
      delivery_id:    ref.id,
      updated_at:     new Date().toISOString(),
    });

    const created = { id: ref.id, ...deliveryData };

    this.ordersGateway?.emitDeliveryAssigned(dto.driverUserId, created);
    this.ordersGateway?.emitOrderStatusUpdate(dto.orderId, {
      orderId:          dto.orderId,
      status:           "En livraison",
      ref:              order.ref,
      driverUserId:     dto.driverUserId,
      estimatedMinutes: dto.estimatedMinutes ?? 30,
      updated_at:       new Date().toISOString(),
    });

    return created;
  }

  async updateStatus(deliveryId: string, dto: UpdateDeliveryStatusDto, driverUserId: string) {
    const ref = this.firebase.db.collection(this.colDeliveries).doc(deliveryId);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException(`Livraison ${deliveryId} introuvable`);
    const data = doc.data() as any;
    if (data.driver_user_id !== driverUserId) {
      throw new BadRequestException("Cette livraison ne vous est pas assignée");
    }

    const now = new Date().toISOString();
    // AUDIT v10 Fix (DC-C6) : snake_case updated_at (pas camelCase updatedAt)
    const update: Record<string, any> = { status: dto.status, updated_at: now };

    if (dto.status === "accepted")           update.accepted_at  = now;
    if (dto.status === "heading_to_client")  update.picked_up_at = now;
    if (dto.status === "delivered") {
      // AUDIT v10 Fix (DC-C6b) : snake_case delivered_at et updated_at dans orders
      update.delivered_at = now;
      if (data.order_id) {
        await this.firebase.db.collection(this.colOrders).doc(data.order_id).update({
          status:       "Livré",
          delivered_at: now,
          updated_at:   now,
        });
        this.ordersGateway?.emitOrderStatusUpdate(data.order_id, {
          orderId:   data.order_id,
          status:    "Livré",
          ref:       data.ref,
          updated_at: now,
        });
      }
    }

    await ref.update(update);

    const statusPayload = { deliveryId, status: dto.status, updated_at: now, note: dto.note };
    this.ordersGateway?.emitDeliveryStatusUpdate(data.order_id, driverUserId, statusPayload);

    return { id: deliveryId, ...update };
  }

  async getActiveDelivery(driverUserId: string) {
    const snap = await this.firebase.db
      .collection(this.colDeliveries)
      .where("driver_user_id", "==", driverUserId)
      .where("status", "in", ["assigned", "accepted", "heading_to_vendor", "at_vendor", "heading_to_client"])
      .orderBy("assigned_at", "desc")
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async getPendingDeliveries(driverUserId: string) {
    const snap = await this.firebase.db
      .collection(this.colDeliveries)
      .where("driver_user_id", "==", driverUserId)
      .where("status", "==", "assigned")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async getDeliveryHistory(driverUserId: string) {
    const snap = await this.firebase.db
      .collection(this.colDeliveries)
      .where("driver_user_id", "==", driverUserId)
      .where("status", "in", ["delivered", "refused"])
      .orderBy("assigned_at", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

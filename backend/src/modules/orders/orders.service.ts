import { Injectable, NotFoundException, ForbiddenException, Optional } from "@nestjs/common";
import { FirebaseService } from "../../firebase/firebase.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { OrdersGateway } from "../../realtime/orders.gateway";
import { CacheService } from "../../cache/cache.service";
import { MatchingService } from "../matching/matching.service";

@Injectable()
export class OrdersService {
  private readonly col = "orders";

  constructor(
    private readonly firebase: FirebaseService,
    private readonly cache: CacheService,
    @Optional() private readonly ordersGateway?: OrdersGateway,
    @Optional() private readonly matching?: MatchingService,
  ) {}

  private generateRef(): string {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `FBF${num}S`;
  }

  async findAllByUser(userId: string) {
    // AUDIT v8 Fix (O-C1) : champs Firestore snake_case user_id / created_at
    const snap = await this.firebase.db
      .collection(this.col)
      .where("user_id", "==", userId)
      .orderBy("created_at", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async findOne(id: string, userId: string) {
    const cached = await this.cache.getActiveOrder<any>(id);
    // AUDIT v8 Fix (O-C1b) : cohérence snake_case pour la vérification du cache
    if (cached && cached.user_id === userId) return cached;

    const doc = await this.firebase.db.collection(this.col).doc(id).get();
    if (!doc.exists) throw new NotFoundException(`Commande ${id} introuvable`);
    const data = doc.data() as any;
    // AUDIT v8 Fix (O-C1c) : snake_case user_id
    if (data.user_id !== userId) throw new ForbiddenException("Accès refusé");

    const result = { id: doc.id, ...data };
    if (["En attente", "En préparation", "En livraison"].includes(data.status)) {
      await this.cache.setActiveOrder(id, result);
    }
    return result;
  }

  async create(dto: CreateOrderDto, userId: string) {
    const now = new Date();
    const estimatedMinutes = 30;
    const eta = new Date(now.getTime() + estimatedMinutes * 60000);
    const etaStr = `${eta.getHours().toString().padStart(2, "0")}:${eta.getMinutes().toString().padStart(2, "0")}`;
    const etaEnd = new Date(eta.getTime() + 15 * 60000);
    const etaEndStr = `${etaEnd.getHours().toString().padStart(2, "0")}:${etaEnd.getMinutes().toString().padStart(2, "0")}`;

    // AUDIT v8 Fix (O-C1d) : snake_case user_id / created_at dans le document persisté
    // AUDIT v10 Fix (O-C2) : payment_status et estimated_delivery en snake_case
    const order = {
      ...dto,
      user_id:            userId,
      ref:                this.generateRef(),
      status:             "En attente",
      payment_status:     "pending",
      created_at:         now.toISOString(),
      estimated_delivery: `${etaStr} - ${etaEndStr}`,
    };

    const ref = await this.firebase.db.collection(this.col).add(order);
    const created = { id: ref.id, ...order };

    await this.cache.setActiveOrder(ref.id, created);

    // Notifier le vendeur en temps réel
    this.ordersGateway?.emitNewOrderToVendor(dto.restaurantId, created);

    // AUDIT v10 Fix (DC-C1) : Suppression de l'appel immédiat à matching.autoAssign().
    // L'ancienne version appelait autoAssign() dès la création de la commande (avant
    // acceptation vendeur), ce qui créait une race condition avec le job BullMQ
    // "assign-driver" déclenché après l'acceptation vendeur.
    // Résultat : deux documents driver_deliveries pour la même commande, deux livreurs
    // pensant être assignés à la même course.
    //
    // Le flux correct est :
    //   1. Client crée la commande → statut "En attente"
    //   2. Vendeur accepte → JobsService déclenche "assign-driver" via BullMQ
    //   3. Le processor assign-driver assigne un livreur disponible
    //
    // L'injection MatchingService est conservée (@Optional) pour usage futur éventuel.

    return created;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, userId: string) {
    const ref = this.firebase.db.collection(this.col).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException(`Commande ${id} introuvable`);
    const data = doc.data() as any;
    // AUDIT v8 Fix (O-C1e) : snake_case user_id dans updateStatus
    if (data.user_id !== userId) throw new ForbiddenException("Accès refusé");

    const now = new Date().toISOString();
    // AUDIT v10 Fix (O-C3) : snake_case updated_at et cancellation_reason
    const update: Record<string, any> = { status: dto.status, updated_at: now };
    if (dto.cancellationReason) update.cancellation_reason = dto.cancellationReason;

    await ref.update(update);

    const updated = { id, ...data, ...update };

    if (["Livré", "Annulé"].includes(dto.status)) {
      await this.cache.invalidateActiveOrder(id);
    } else {
      await this.cache.setActiveOrder(id, updated);
    }

    this.ordersGateway?.emitOrderStatusUpdate(id, {
      orderId: id,
      status: dto.status,
      ref: data.ref,
      updated_at: now,
    });

    return updated;
  }

  // AUDIT v10 Fix (O-C4) : signature corrigée pour correspondre à l'appel du contrôleur.
  // AUDIT v10 Fix (VE-C11) : query Firestore snake_case — restaurantId→restaurant_id
  async findAllByRestaurant(restaurantId: string, requesterUid: string, isAdmin = false) {
    if (!isAdmin) {
      const shopSnap = await this.firebase.db
        .collection("vendor_shops")
        .where("restaurant_id", "==", restaurantId)
        .where("user_id", "==", requesterUid)
        .limit(1)
        .get();
      if (shopSnap.empty) throw new ForbiddenException("Accès refusé — vous n'êtes pas propriétaire de ce restaurant");
    }

    const snap = await this.firebase.db
      .collection(this.col)
      .where("restaurant_id", "==", restaurantId)
      .orderBy("created_at", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

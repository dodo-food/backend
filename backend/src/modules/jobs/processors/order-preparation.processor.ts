import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { FirebaseService } from "../../../firebase/firebase.service";
import { QUEUE_ORDER_PREPARATION } from "../jobs.constants";
import type {
  PrepareOrderJobData,
  OrderTimeoutJobData,
  AssignDriverJobData,
  DeliveryCompletedJobData,
} from "../jobs.service";

@Processor(QUEUE_ORDER_PREPARATION, {
  concurrency: 5,
})
export class OrderPreparationProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderPreparationProcessor.name);

  constructor(private readonly firebase: FirebaseService) {
    super();
  }

  // ─── Dispatcher principal ─────────────────────────────────────────────────

  async process(job: Job): Promise<unknown> {
    this.logger.log(`[${job.name}] Traitement job #${job.id}`);

    switch (job.name) {
      case "prepare-order":
        return this.handlePrepareOrder(job as Job<PrepareOrderJobData>);
      case "order-timeout":
        return this.handleOrderTimeout(job as Job<OrderTimeoutJobData>);
      case "assign-driver":
        return this.handleAssignDriver(job as Job<AssignDriverJobData>);
      case "delivery-completed":
        return this.handleDeliveryCompleted(job as Job<DeliveryCompletedJobData>);
      default:
        this.logger.warn(`Job inconnu : ${job.name}`);
        return null;
    }
  }

  // ─── prepare-order ─────────────────────────────────────────────────────────
  // Déclenché immédiatement après POST /orders.
  // Valide la commande, envoie la notification au vendeur, écrit dans Firestore.

  private async handlePrepareOrder(job: Job<PrepareOrderJobData>) {
    const { orderId, restaurantId, restaurantName, userId, ref, grandTotal } = job.data;

    // 1. Vérifier que la commande existe toujours (protection anti-doublon)
    const orderDoc = await this.firebase.db.collection("orders").doc(orderId).get();
    if (!orderDoc.exists) {
      this.logger.warn(`[prepare-order] Commande ${orderId} introuvable — ignoré`);
      return { skipped: true, reason: "order_not_found" };
    }

    const order = orderDoc.data() as any;
    if (order.status !== "En attente") {
      this.logger.log(`[prepare-order] Commande ${orderId} déjà traitée (${order.status})`);
      return { skipped: true, reason: "already_processed" };
    }

    // 2. Notification in-app au vendeur
    // AUDIT v10 Fix (PO-C3) : l'ancienne version écrivait dans "notifications" avec
    // user_id: `vendor_${restaurantId}` (format inexistant dans les UIDs Firebase).
    // VendorContext écoute "vendor_notifications" avec where("vendor_user_id","==",uid).
    // Fix : résolution du vendor_user_id via l'ordre Firestore (champ vendor_user_id)
    // ou fallback requête vendor_shops, puis écriture dans la bonne collection.
    {
      let vendorUserId: string | undefined = (order.vendor_user_id as string | undefined);
      if (!vendorUserId) {
        try {
          const shopSnap = await this.firebase.db
            .collection("vendor_shops")
            .where("restaurant_id", "==", restaurantId)
            .limit(1)
            .get();
          if (!shopSnap.empty) vendorUserId = shopSnap.docs[0].data().user_id as string;
        } catch {}
      }

      if (vendorUserId) {
        await this.firebase.db.collection("vendor_notifications").add({
          vendor_user_id: vendorUserId,
          type:           "new_order",
          title:          "Nouvelle commande !",
          body:           `Commande ${ref} — ${grandTotal} FCFA`,
          order_id:       orderId,
          restaurant_id:  restaurantId,
          ref,
          is_read:        false,
          created_at:     new Date().toISOString(),
        });
      } else {
        // Fallback conservé si vendor_user_id non trouvable
        this.logger.warn(`[prepare-order] vendor_user_id introuvable pour restaurant ${restaurantId} — fallback notifications`);
        await this.firebase.db.collection("notifications").add({
          user_id:    `vendor_${restaurantId}`,
          type:       "new_order",
          title:      "Nouvelle commande !",
          body:       `Commande ${ref} — ${grandTotal} FCFA`,
          data:       { orderId, restaurantId, ref },
          is_read:    false,
          created_at: new Date().toISOString(),
        });
      }
    }

    // 3. Marquer la commande comme "notifiée"
    await this.firebase.db.collection("orders").doc(orderId).update({
      vendor_notified_at: new Date().toISOString(),
    });

    this.logger.log(`[prepare-order] Commande ${ref} notifiée au restaurant ${restaurantName}`);
    return { success: true, orderId, ref };
  }

  // ─── order-timeout ──────────────────────────────────────────────────────────
  // Déclenché 10 minutes après la commande si le vendeur n'a pas encore accepté.
  // Annule la commande et rembourse si applicable.

  private async handleOrderTimeout(job: Job<OrderTimeoutJobData>) {
    const { orderId, ref } = job.data;

    const doc = await this.firebase.db.collection("orders").doc(orderId).get();
    if (!doc.exists) return { skipped: true };

    const order = doc.data() as any;

    // Annuler seulement si toujours "En attente"
    if (order.status !== "En attente") {
      this.logger.log(`[order-timeout] Commande ${ref} déjà traitée (${order.status}) — timeout ignoré`);
      return { skipped: true, currentStatus: order.status };
    }

    await this.firebase.db.collection("orders").doc(orderId).update({
      status:        "Annulé",
      cancelled_at:  new Date().toISOString(),
      cancel_reason: "timeout_vendor_no_response",
      updated_at:    new Date().toISOString(),
    });

    // Notification au client
    await this.firebase.db.collection("notifications").add({
      user_id:    order.user_id,
      type:       "order_cancelled",
      title:      "Commande annulée",
      body:       `Votre commande ${ref} a été annulée — aucun restaurant disponible pour le moment.`,
      data:       { orderId, ref },
      is_read:    false,
      created_at: new Date().toISOString(),
    });

    this.logger.warn(`[order-timeout] Commande ${ref} annulée (vendeur non répondu en 10 min)`);
    return { cancelled: true, orderId, ref };
  }

  // ─── assign-driver ─────────────────────────────────────────────────────────
  // Déclenché après acceptation du vendeur.
  // Cherche le meilleur livreur disponible via Firestore + cache GPS.

  private async handleAssignDriver(job: Job<AssignDriverJobData>) {
    const { orderId, restaurantLat, restaurantLng } = job.data;

    const orderDoc = await this.firebase.db.collection("orders").doc(orderId).get();
    if (!orderDoc.exists) return { skipped: true };
    const orderData = orderDoc.data() as any;

    // AUDIT v10 Fix (DC-C1b) : guard anti-double-assignation.
    // OrdersService.create() appelait aussi matching.autoAssign() (bug DC-C1, supprimé).
    // Ce guard protège contre tout autre chemin de code qui pourrait créer une livraison
    // avant ce job BullMQ (ex : webhook, API externe).
    if (orderData.delivery_id) {
      this.logger.log(
        `[assign-driver] Commande ${orderId} a déjà une livraison (${orderData.delivery_id}) — ignoré`,
      );
      return { skipped: true, reason: "already_assigned" };
    }

    // Récupérer les livreurs en ligne
    const driversSnap = await this.firebase.db
      .collection("driver_profiles")
      .where("is_online", "==", true)
      .get();

    if (driversSnap.empty) {
      this.logger.warn(`[assign-driver] Aucun livreur disponible pour commande ${orderId}`);
      return { assigned: false, reason: "no_driver_available" };
    }

    // AUDIT v9 Fix (PO-C1) : stocker lat/lng du livreur dans le candidat pour éviter
    // le bug de référence périmée (stale locSnap). L'ancienne version stockait uniquement
    // { uid, distKm } et utilisait locSnap.data() APRÈS la boucle — locSnap pointait
    // vers le DERNIER livreur parcouru, pas nécessairement le meilleur (candidates[0]).
    // Résultat : distance_km et estimated_minutes dans driver_deliveries étaient calculés
    // avec la position du mauvais livreur, et .data()! pouvait planter si locSnap
    // n'existait plus (variable de bloc, déjà réaffectée).
    type DriverCandidate = { uid: string; distKm: number; lat: number; lng: number };
    const candidates: DriverCandidate[] = [];

    for (const d of driversSnap.docs) {
      const driver = d.data() as any;

      // AUDIT v10 Fix (DC-C2) : utiliser driver.user_id (Firebase UID) et non d.id (ID du doc profil).
      // L'ancienne version utilisait d.id → notifications et driver_deliveries.driver_user_id
      // pointaient vers l'ID du document profil (ex: "drv_1234567890") et non le Firebase UID.
      // Résultat : le livreur ne recevait jamais ses courses car son UID Firebase ≠ d.id.
      const driverId: string = (driver.user_id as string) ?? d.id;

      // AUDIT v10 Fix (DC-C9) : compter les livraisons actives en temps réel via Firestore
      // et non depuis le champ driver.active_deliveries (potentiellement périmé).
      const activeSnap = await this.firebase.db
        .collection("driver_deliveries")
        .where("driver_user_id", "==", driverId)
        .where("status", "in", ["assigned", "accepted", "heading_to_vendor", "at_vendor", "heading_to_client"])
        .get();
      if (activeSnap.size >= 2) continue;

      const locSnap = await this.firebase.db
        .collection("driver_locations")
        .doc(driverId)
        .get();
      if (!locSnap.exists) continue;

      const loc = locSnap.data() as any;
      // updated_at snake_case (cohérent avec tracking.gateway.ts v10)
      const updatedAt = loc.updated_at ? new Date(loc.updated_at).getTime() : 0;
      if (Date.now() - updatedAt > 15 * 60 * 1000) continue; // position > 15 min

      const distKm = this.haversine(restaurantLat, restaurantLng, loc.lat, loc.lng);
      // AUDIT v9 Fix (PO-C1) : inclure lat/lng dans le candidat pour usage après la boucle.
      candidates.push({ uid: driverId, distKm, lat: loc.lat, lng: loc.lng });
    }

    if (candidates.length === 0) {
      this.logger.warn(`[assign-driver] Aucun livreur avec position récente pour ${orderId}`);
      return { assigned: false, reason: "no_driver_with_recent_location" };
    }

    candidates.sort((a, b) => a.distKm - b.distKm);
    const best = candidates[0];

    // AUDIT v8 Fix (DC-C12) : document driver_deliveries complet avec tous les champs
    // nécessaires à DriverContext.rowToDriverDelivery (ref, vendor, client, items_summary,
    // delivery_fee, payment_method, distance_km, estimated_minutes).
    // L'ancienne version créait un document minimal → le livreur voyait une course vide.
    const itemsSummary = (orderData.items ?? [])
      .map((i: any) => `${i.quantity ?? 1}x ${i.name ?? "?"}`)
      .join(", ");

    // AUDIT v9 Fix (PO-C1b) : utiliser best.lat/best.lng (position du MEILLEUR candidat)
    // au lieu de locSnap.data() qui pointait vers le dernier livreur de la boucle.
    const bestDistKm      = best.distKm;
    const bestEstMinutes  = Math.round(bestDistKm / 25 * 60);

    const deliveryRef = await this.firebase.db.collection("driver_deliveries").add({
      order_id:          orderId,
      driver_user_id:    best.uid,
      ref:               orderData.ref ?? "—",
      vendor: {
        name:    orderData.restaurant_name ?? orderData.restaurantName ?? "Restaurant",
        address: orderData.restaurant_address ?? orderData.address ?? "",
        lat:     orderData.restaurant_lat ?? orderData.restaurantLat ?? null,
        lng:     orderData.restaurant_lng ?? orderData.restaurantLng ?? null,
        phone:   orderData.restaurant_phone ?? orderData.restaurantPhone ?? "",
      },
      client: {
        name:    orderData.customer_name ?? orderData.customerName ?? "Client",
        address: orderData.delivery_address ?? orderData.address ?? "",
        lat:     orderData.delivery_lat ?? orderData.deliveryLat ?? null,
        lng:     orderData.delivery_lng ?? orderData.deliveryLng ?? null,
        phone:   orderData.customer_phone ?? orderData.phone ?? "",
        user_id: orderData.user_id ?? null,
      },
      items_summary:     itemsSummary || "—",
      delivery_fee:      orderData.delivery_fee ?? orderData.deliveryFee ?? 1000,
      payment_method:    orderData.payment_method ?? orderData.paymentMethod ?? "cash",
      tip:               0,
      status:            "assigned",
      distance_km:       String(Math.round(bestDistKm * 100) / 100),
      estimated_minutes: bestEstMinutes,
      assigned_at:       new Date().toISOString(),
      created_at:        new Date().toISOString(),
    });

    // AUDIT v10 Fix (DC-C1b) : écrire delivery_id (snake_case) dans la commande
    await this.firebase.db.collection("orders").doc(orderId).update({
      status:             "En livraison",
      driver_user_id:     best.uid,
      delivery_id:        deliveryRef.id,
      updated_at:         new Date().toISOString(),
    });

    // Notification livreur — user_id = Firebase UID (corrigé DC-C2)
    await this.firebase.db.collection("notifications").add({
      user_id:    best.uid,
      type:       "driver_assigned",
      title:      "Nouvelle course 🛵",
      body:       "Une commande vous a été assignée",
      data:       { orderId, deliveryId: deliveryRef.id },
      is_read:    false,
      created_at: new Date().toISOString(),
    });

    this.logger.log(
      `[assign-driver] Livreur ${best.uid} assigné à commande ${orderId} (${best.distKm.toFixed(2)} km)`,
    );
    return { assigned: true, driverId: best.uid, distKm: best.distKm };
  }

  // ─── delivery-completed ────────────────────────────────────────────────────
  // Déclenché quand le livreur marque la commande comme livrée.
  // Envoie la notification de confirmation + demande d'avis.

  private async handleDeliveryCompleted(job: Job<DeliveryCompletedJobData>) {
    const { orderId, userId, grandTotal } = job.data;

    // Notification client — confirmation livraison
    await this.firebase.db.collection("notifications").add({
      user_id:    userId,
      type:       "order_delivered",
      title:      "Commande livrée ! 🎉",
      body:       `Votre commande a été livrée. Donnez votre avis pour aider la communauté.`,
      data:       { orderId, action: "rate_order" },
      is_read:    false,
      created_at: new Date().toISOString(),
    });

    // Notification fidélité — points gagnés (10 pts / 1000 FCFA)
    const points = Math.floor(grandTotal / 1000) * 10;
    if (points > 0) {
      await this.firebase.db.collection("notifications").add({
        user_id:    userId,
        type:       "loyalty_points",
        title:      `+${points} points Dodo !`,
        body:       `Vous avez gagné ${points} points fidélité pour cette commande.`,
        data:       { orderId, points: String(points) },
        is_read:    false,
        created_at: new Date().toISOString(),
      });

      // Mise à jour du solde fidélité
      // AUDIT v10 Fix (PO-C2) : l'ancienne version utilisait profileRef.update() sur
      // "profiles" qui peut ne pas encore exister (utilisateur sans token FCM).
      // update() sur un document inexistant lève une exception non catchée → points perdus.
      // Fix : set({ merge: true }) crée le document si absent, fusionne si existant.
      // Note : "profiles" est la collection partagée FCM + fidélité (firebase.service.ts).
      const profileRef = this.firebase.db.collection("profiles").doc(userId);
      const profileSnap = await profileRef.get();
      const currentPoints: number = profileSnap.exists
        ? ((profileSnap.data() as any)?.loyalty_points ?? 0)
        : 0;
      await profileRef.set(
        { loyalty_points: currentPoints + points, updated_at: new Date().toISOString() },
        { merge: true },
      );
    }

    this.logger.log(
      `[delivery-completed] Post-livraison traité pour commande ${orderId} (+${points} pts fidélité)`,
    );
    return { success: true, pointsAwarded: points };
  }

  // ─── Événements BullMQ ────────────────────────────────────────────────────

  @OnWorkerEvent("completed")
  onCompleted(job: Job) {
    this.logger.log(`✅ Job [${job.name}] #${job.id} terminé`);
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job, error: Error) {
    this.logger.error(`❌ Job [${job.name}] #${job.id} échoué : ${error.message}`);
  }

  @OnWorkerEvent("stalled")
  onStalled(jobId: string) {
    this.logger.warn(`⚠️  Job #${jobId} bloqué (stalled)`);
  }

  // ─── Haversine interne ────────────────────────────────────────────────────

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

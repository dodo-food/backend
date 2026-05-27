import { Injectable, NotFoundException, ForbiddenException, Optional } from "@nestjs/common";
import { FirebaseService } from "../../firebase/firebase.service";
import { JobsService } from "../jobs/jobs.service";

@Injectable()
export class VendorsService {
  constructor(
    private readonly firebase: FirebaseService,
    @Optional() private readonly jobs?: JobsService,
  ) {}

  async getKyc(uid: string) {
    const doc = await this.firebase.db.collection("vendor_kyc").doc(uid).get();
    if (!doc.exists) return { uid, status: "not_started" };
    return { id: doc.id, ...doc.data() };
  }

  // AUDIT v10 Fix (VE-C1) : champs Firestore snake_case — userId→user_id, submittedAt→submitted_at
  async submitKyc(uid: string, data: Record<string, any>) {
    const payload = {
      ...data,
      user_id:      uid,
      status:       "pending",
      submitted_at: new Date().toISOString(),
    };
    await this.firebase.db.collection("vendor_kyc").doc(uid).set(payload, { merge: true });
    return { uid, ...payload };
  }

  // AUDIT v10 Fix (VE-C2) : champs Firestore snake_case — reviewedAt→reviewed_at, rejectionReason→rejection_reason
  async reviewKyc(uid: string, status: "approved" | "rejected", reason?: string) {
    const update: Record<string, any> = {
      status,
      reviewed_at: new Date().toISOString(),
    };
    if (reason) update.rejection_reason = reason;
    await this.firebase.db.collection("vendor_kyc").doc(uid).update(update);
    return { uid, status };
  }

  async getShop(uid: string) {
    // AUDIT v8 Fix (VS-C1) : champ Firestore snake_case user_id (pas userId).
    const snap = await this.firebase.db
      .collection("vendor_shops")
      .where("user_id", "==", uid)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  // AUDIT v10 Fix (VE-C3) : champs Firestore snake_case — updatedAt→updated_at, createdAt→created_at
  async upsertShop(uid: string, data: Record<string, any>) {
    const existing = await this.getShop(uid);
    const payload = { ...data, user_id: uid, updated_at: new Date().toISOString() };
    if (existing) {
      await this.firebase.db.collection("vendor_shops").doc(existing.id).update(payload);
      return { id: existing.id, ...payload };
    }
    const ref = await this.firebase.db
      .collection("vendor_shops")
      .add({ ...payload, created_at: new Date().toISOString() });
    return { id: ref.id, ...payload };
  }

  // AUDIT v10 Fix (VE-C4) : query Firestore snake_case — shopId→shop_id
  async getProducts(uid: string) {
    const shop = await this.getShop(uid);
    if (!shop) return [];
    const snap = await this.firebase.db
      .collection("vendor_products")
      .where("shop_id", "==", shop.id)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // AUDIT v10 Fix (VE-C5) : orderBy snake_case — createdAt→created_at
  async getOrders(uid: string) {
    const snap = await this.firebase.db
      .collection("vendor_orders")
      .where("vendor_user_id", "==", uid)
      .orderBy("created_at", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // AUDIT v10 Fix (VE-C6) : updatedAt→updated_at dans la mise à jour Firestore.
  // AUDIT v10 Fix (VE-C10b) : déclenchement BullMQ assign-driver quand le vendeur marque
  // la commande "ready", remplaçant l'auto-assignation directe Firestore du frontend
  // (VE-C10 dans VendorContext.tsx) qui bypassait le pipeline BullMQ et créait des
  // race conditions identiques à DC-C1.
  async updateOrderStatus(orderId: string, uid: string, status: string, extra?: Record<string, any>) {
    const ref = this.firebase.db.collection("vendor_orders").doc(orderId);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException(`Commande ${orderId} introuvable`);
    const data = doc.data() as any;
    if (data.vendor_user_id !== uid) throw new ForbiddenException("Accès refusé");
    await ref.update({ status, ...extra, updated_at: new Date().toISOString() });

    if (status === "ready" && this.jobs) {
      const restaurantId  = (data.restaurant_id  as string | undefined) ?? "";
      const restaurantLat = (data.vendor_lat      as number | undefined) ?? 12.3527;
      const restaurantLng = (data.vendor_lng      as number | undefined) ?? -1.5478;
      if (restaurantId) {
        this.jobs.dispatchAssignDriver({ orderId, restaurantId, restaurantLat, restaurantLng })
          .catch(() => {});
      }
    }

    return { id: orderId, status };
  }
}

import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { FirebaseService } from "../../firebase/firebase.service";

@Injectable()
export class DriversService {
  constructor(private readonly firebase: FirebaseService) {}

  async getKyc(uid: string) {
    const doc = await this.firebase.db.collection("driver_kyc").doc(uid).get();
    if (!doc.exists) return { uid, status: "not_started" };
    return { id: doc.id, ...doc.data() };
  }

  async submitKyc(uid: string, data: Record<string, any>) {
    const payload = {
      ...data,
      user_id:      uid,
      status:       "pending",
      submitted_at: new Date().toISOString(),
    };
    await this.firebase.db.collection("driver_kyc").doc(uid).set(payload, { merge: true });
    return { uid, ...payload };
  }

  async reviewKyc(uid: string, status: "approved" | "rejected", reason?: string) {
    const update: Record<string, any> = {
      status,
      reviewed_at: new Date().toISOString(),
    };
    if (reason) update.rejection_reason = reason;
    await this.firebase.db.collection("driver_kyc").doc(uid).update(update);
    return { uid, status };
  }

  async getProfile(uid: string) {
    const snap = await this.firebase.db
      .collection("driver_profiles")
      .where("user_id", "==", uid)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async upsertProfile(uid: string, data: Record<string, any>) {
    const existing = await this.getProfile(uid);
    const payload = { ...data, user_id: uid, updated_at: new Date().toISOString() };
    if (existing) {
      await this.firebase.db.collection("driver_profiles").doc(existing.id).update(payload);
      return { id: existing.id, ...payload };
    }
    const ref = await this.firebase.db
      .collection("driver_profiles")
      .add({ ...payload, rating: 4.8, total_deliveries: 0, is_online: false, created_at: new Date().toISOString() });
    return { id: ref.id, ...payload };
  }

  async setOnlineStatus(uid: string, isOnline: boolean) {
    const profile = await this.getProfile(uid);
    if (!profile) throw new NotFoundException("Profil livreur introuvable");
    await this.firebase.db
      .collection("driver_profiles")
      .doc(profile.id)
      .update({ is_online: isOnline, updated_at: new Date().toISOString() });
    return { uid, isOnline };
  }

  async getDeliveries(uid: string) {
    const snap = await this.firebase.db
      .collection("driver_deliveries")
      .where("driver_user_id", "==", uid)
      .orderBy("assigned_at", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async updateDeliveryStatus(deliveryId: string, uid: string, status: string, extra?: Record<string, any>) {
    const ref = this.firebase.db.collection("driver_deliveries").doc(deliveryId);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException(`Livraison ${deliveryId} introuvable`);
    const data = doc.data() as any;
    if (data.driver_user_id !== uid) throw new ForbiddenException("Accès refusé");
    await ref.update({ status, ...extra, updated_at: new Date().toISOString() });
    return { id: deliveryId, status };
  }

  async getEarnings(uid: string) {
    const snap = await this.firebase.db
      .collection("driver_earnings")
      .where("driver_user_id", "==", uid)
      .orderBy("created_at", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

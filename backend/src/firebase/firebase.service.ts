import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import * as admin from "firebase-admin";

export type FirebaseUserRole = "client" | "vendor" | "driver" | "admin";

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private _app: admin.app.App;

  onModuleInit() {
    if (admin.apps.length > 0) {
      this._app = admin.apps[0]!;
      return;
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      this._app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID || "kassiripulse";
      this._app = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
      this.logger.warn(
        "FIREBASE_SERVICE_ACCOUNT_JSON absent — utilisation des credentials par défaut (ADC).",
      );
    }

    this.logger.log(`Firebase Admin initialisé (projet: ${this._app.options.projectId})`);
  }

  get app(): admin.app.App {
    return this._app;
  }

  get db(): admin.firestore.Firestore {
    return admin.firestore(this._app);
  }

  get auth(): admin.auth.Auth {
    return admin.auth(this._app);
  }

  get messaging(): admin.messaging.Messaging {
    return admin.messaging(this._app);
  }

  async verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
    return this.auth.verifyIdToken(token);
  }

  // ── RBAC — Custom Claims Firebase ─────────────────────────────────────────

  /**
   * Définit le rôle d'un utilisateur comme custom claim Firebase.
   *
   * Le claim `role` sera inclus dans tous les tokens JWT suivants
   * (après refresh côté client). Utilisé par RolesGuard.
   *
   * @param uid  UID Firebase de l'utilisateur
   * @param role Rôle à assigner : 'client' | 'vendor' | 'driver' | 'admin'
   */
  async setUserRole(uid: string, role: FirebaseUserRole): Promise<void> {
    await this.auth.setCustomUserClaims(uid, { role });
    this.logger.log(`Custom claim role=${role} défini pour uid=${uid}`);
  }

  /**
   * Récupère le rôle d'un utilisateur depuis ses custom claims Firebase.
   * Retourne 'client' par défaut si aucun rôle n'est défini.
   */
  async getUserRole(uid: string): Promise<FirebaseUserRole> {
    const user = await this.auth.getUser(uid);
    return (user.customClaims?.["role"] as FirebaseUserRole) ?? "client";
  }

  /**
   * Révoque tous les refresh tokens d'un utilisateur.
   * Utile après un changement de rôle ou une compromission de compte.
   * Le client devra se reconnecter pour obtenir un nouveau token.
   */
  async revokeUserTokens(uid: string): Promise<void> {
    await this.auth.revokeRefreshTokens(uid);
    this.logger.warn(`Tokens révoqués pour uid=${uid}`);
  }

  /**
   * Désactive un compte Firebase (bloque toute connexion).
   * Utilisé pour suspendre un compte livreur ou vendeur non conforme.
   */
  async disableUser(uid: string): Promise<void> {
    await this.auth.updateUser(uid, { disabled: true });
    await this.revokeUserTokens(uid);
    this.logger.warn(`Compte désactivé pour uid=${uid}`);
  }

  /**
   * Réactive un compte Firebase précédemment désactivé.
   */
  async enableUser(uid: string): Promise<void> {
    await this.auth.updateUser(uid, { disabled: false });
    this.logger.log(`Compte réactivé pour uid=${uid}`);
  }

  // ── FCM — Notifications Push ──────────────────────────────────────────────

  async getFcmToken(uid: string): Promise<string | null> {
    const doc = await this.db.collection("profiles").doc(uid).get();
    if (!doc.exists) return null;
    return (doc.data() as any)?.fcmToken ?? null;
  }

  async saveFcmToken(uid: string, fcmToken: string): Promise<void> {
    await this.db
      .collection("profiles")
      .doc(uid)
      .set({ fcmToken, fcmUpdatedAt: new Date().toISOString() }, { merge: true });
  }

  async sendPushNotification(params: {
    fcmToken: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<string | null> {
    try {
      const messageId = await this.messaging.send({
        token: params.fcmToken,
        notification: { title: params.title, body: params.body },
        data: params.data ?? {},
        android: {
          priority: "high",
          notification: { sound: "default", channelId: "dodo_orders" },
        },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
        },
      });
      return messageId;
    } catch (err: any) {
      this.logger.warn(`FCM push échoué : ${err.message}`);
      return null;
    }
  }

  async sendMulticastPush(params: {
    fcmTokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<{ successCount: number; failureCount: number }> {
    if (!params.fcmTokens.length) return { successCount: 0, failureCount: 0 };
    try {
      const response = await this.messaging.sendEachForMulticast({
        tokens: params.fcmTokens,
        notification: { title: params.title, body: params.body },
        data: params.data ?? {},
        android: { priority: "high" },
      });
      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (err: any) {
      this.logger.warn(`FCM multicast échoué : ${err.message}`);
      return { successCount: 0, failureCount: params.fcmTokens.length };
    }
  }
}

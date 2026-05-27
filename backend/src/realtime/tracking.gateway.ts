import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { CacheService } from "../cache/cache.service";
import { FirebaseService } from "../firebase/firebase.service";

interface LocationPayload {
  lat: number;
  lng: number;
  deliveryId?: string;
  orderId?: string;
}

interface AuthenticatedSocket extends Socket {
  uid?: string;
  role?: string;
}

/** Limites GPS : coordonnées Burkina Faso + zone élargie */
const LAT_MIN = 9.0;
const LAT_MAX = 15.5;
const LNG_MIN = -5.5;
const LNG_MAX = 2.5;

function isValidCoord(lat: number, lng: number): boolean {
  return (
    typeof lat === "number" && isFinite(lat) &&
    typeof lng === "number" && isFinite(lng) &&
    lat >= LAT_MIN && lat <= LAT_MAX &&
    lng >= LNG_MIN && lng <= LNG_MAX
  );
}

// ─── Rate limiting WebSocket ──────────────────────────────────────────────────
const WS_LOCATION_MIN_INTERVAL_MS = 2_000;
const locationLastEmit = new Map<string, number>();

setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [uid, ts] of locationLastEmit.entries()) {
    if (ts < cutoff) locationLastEmit.delete(uid);
  }
}, 60_000);

// ─── Persistance Firestore driver_locations toutes les 30s ───────────────────
const FIRESTORE_LOCATION_INTERVAL_MS = 30_000;
const locationLastFirestoreWrite = new Map<string, number>();

// ─── Helper CORS WebSocket ────────────────────────────────────────────────────
//
// ⚠️  Clients mobiles React Native (iOS / Android) :
//     Les apps mobiles natives N'envoient PAS l'en-tête Origin lors des
//     connexions WebSocket. Il faut donc autoriser origin === undefined.
//
// ⚠️  Si CORS_ORIGIN n'est pas configuré sur Railway, utiliser ?? false
//     bloquait TOUTES les connexions WebSocket en production.
//     Fix : liste vide = tout autoriser.
//
function resolveWsCorsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, ok?: boolean) => void,
): void {
  if (!origin) {
    callback(null, true);
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    callback(null, true);
    return;
  }
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : [];

  if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    callback(null, true);
  } else {
    callback(new Error(`CORS WebSocket refusé — origine non autorisée : ${origin}`));
  }
}

@WebSocketGateway({
  namespace: "/tracking",
  cors: {
    origin: resolveWsCorsOrigin,
    credentials: true,
  },
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  constructor(
    private readonly cache: CacheService,
    private readonly firebase: FirebaseService,
  ) {}

  // ── Authentification à la connexion ──────────────────────────────────────
  async handleConnection(client: AuthenticatedSocket) {
    const token = (client.handshake.auth?.token as string | undefined)
      ?? (client.handshake.query?.token as string | undefined);

    if (!token) {
      this.logger.warn(`WS rejet [tracking] id=${client.id} — token manquant (Origin: ${client.handshake.headers.origin ?? "mobile/aucune"})`);
      client.emit("error", { message: "Authentification requise. Fournir auth.token." });
      client.disconnect(true);
      return;
    }

    try {
      const decoded = await this.firebase.verifyIdToken(token);
      client.uid  = decoded.uid;
      client.role = (decoded["role"] as string | undefined) ?? "client";
      this.logger.log(
        `WS connecté [tracking] uid=${decoded.uid} role=${client.role} id=${client.id}`,
      );
    } catch (err: any) {
      this.logger.warn(`WS rejet [tracking] id=${client.id} — token invalide ou expiré : ${err?.message ?? "inconnu"}`);
      client.emit("error", { message: "Token Firebase invalide ou expiré." });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.uid) {
      locationLastEmit.delete(client.uid);
      locationLastFirestoreWrite.delete(client.uid);
    }
    this.logger.debug(`WS déconnecté [tracking] uid=${client.uid ?? "inconnu"} id=${client.id}`);
  }

  // ── Mise à jour position livreur — LIVREUR uniquement ────────────────────
  @SubscribeMessage("driver:location")
  async handleDriverLocation(
    @MessageBody() payload: LocationPayload & { driverUserId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { driverUserId, lat, lng, deliveryId, orderId } = payload;

    if (!driverUserId || lat == null || lng == null) {
      client.emit("error", { message: "Payload invalide : driverUserId, lat, lng requis." });
      return;
    }

    if (client.uid !== driverUserId) {
      this.logger.warn(
        `WS spoofing GPS [tracking] uid=${client.uid} a tenté de modifier driverUserId=${driverUserId}`,
      );
      client.emit("error", { message: "Non autorisé : identifiant livreur incohérent." });
      return;
    }

    if (client.role !== "driver") {
      client.emit("error", { message: "Accès refusé : rôle driver requis pour l'émission GPS." });
      return;
    }

    // ── Rate limiting ─────────────────────────────────────────────────────
    const uid = client.uid!;
    const now = Date.now();
    const last = locationLastEmit.get(uid) ?? 0;
    if (now - last < WS_LOCATION_MIN_INTERVAL_MS) {
      client.emit("driver:location:ack", { ok: false, reason: "rate_limited" });
      return;
    }
    locationLastEmit.set(uid, now);

    if (!isValidCoord(lat, lng)) {
      this.logger.warn(
        `WS coordonnées GPS invalides [tracking] uid=${client.uid} lat=${lat} lng=${lng}`,
      );
      client.emit("error", { message: "Coordonnées GPS hors zone autorisée." });
      return;
    }

    // ── Cache Redis ───────────────────────────────────────────────────────
    await this.cache.setDriverLocation(driverUserId, lat, lng);

    // ── Persistance Firestore toutes les 30s ──────────────────────────────
    const lastFirestore = locationLastFirestoreWrite.get(uid) ?? 0;
    if (now - lastFirestore >= FIRESTORE_LOCATION_INTERVAL_MS) {
      locationLastFirestoreWrite.set(uid, now);
      this.firebase.db
        .collection("driver_locations")
        .doc(driverUserId)
        .set({ lat, lng, updated_at: new Date(now).toISOString() }, { merge: true })
        .catch((err) =>
          this.logger.warn(`GPS Firestore persist error uid=${driverUserId}: ${err?.message}`),
        );
    }

    const update = { driverUserId, lat, lng, updated_at: now, deliveryId };

    this.server.to(`driver:${driverUserId}`).emit("driver:location:update", update);

    if (orderId && typeof orderId === "string" && orderId.length <= 128) {
      this.server.to(`order:${orderId}`).emit("driver:location:update", update);
    }

    client.emit("driver:location:ack", { ok: true });
  }

  // ── Souscription rooms ─────────────────────────────────────────────────────

  @SubscribeMessage("driver:subscribe")
  handleSubscribeDriver(
    @MessageBody() data: { driverUserId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.uid) {
      client.emit("error", { message: "Non authentifié." });
      return;
    }

    if (client.role === "driver" && client.uid !== data?.driverUserId) {
      this.logger.warn(
        `WS IDOR [tracking] driver:subscribe — uid=${client.uid} → driverUserId=${data?.driverUserId}`,
      );
      client.emit("error", { message: "Accès refusé : vous ne pouvez écouter que votre propre room GPS." });
      return;
    }

    if (client.role !== "driver" && client.role !== "admin") {
      client.emit("error", { message: "Accès refusé : rôle driver ou admin requis." });
      return;
    }

    const room = `driver:${data.driverUserId}`;
    client.join(room);
    client.emit("driver:subscribed", { room });
  }

  @SubscribeMessage("order:subscribe")
  async handleSubscribeOrder(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.uid) {
      client.emit("error", { message: "Non authentifié." });
      return;
    }

    const orderId = data?.orderId;
    if (!orderId || typeof orderId !== "string" || orderId.length > 128) {
      client.emit("error", { message: "orderId invalide." });
      return;
    }

    if (client.role === "driver" || client.role === "admin") {
      const room = `order:${orderId}`;
      client.join(room);
      client.emit("order:subscribed", { room });
      return;
    }

    try {
      const orderDoc = await this.firebase.db.collection("orders").doc(orderId).get();
      if (!orderDoc.exists) {
        client.emit("error", { message: "Commande introuvable." });
        return;
      }
      const order = orderDoc.data() as any;

      const isOwner =
        (client.role === "client" && order.user_id === client.uid) ||
        (client.role === "vendor" && order.vendor_user_id === client.uid);

      if (!isOwner) {
        this.logger.warn(
          `WS IDOR [tracking] order:subscribe — uid=${client.uid} role=${client.role} → orderId=${orderId}`,
        );
        client.emit("error", { message: "Accès refusé : cette commande ne vous appartient pas." });
        return;
      }
    } catch (err) {
      this.logger.error(`[tracking] order:subscribe ownership check failed: ${(err as Error)?.message}`);
      client.emit("error", { message: "Erreur lors de la vérification d'accès." });
      return;
    }

    const room = `order:${orderId}`;
    client.join(room);
    client.emit("order:subscribed", { room });
  }

  @SubscribeMessage("driver:location:get")
  async handleGetLocation(
    @MessageBody() data: { driverUserId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.uid) {
      client.emit("error", { message: "Non authentifié." });
      return;
    }

    const driverUserId = data?.driverUserId;
    const isOwner = client.uid === driverUserId;
    const isAdmin = client.role === "admin";

    if (!isOwner && !isAdmin) {
      this.logger.warn(
        `WS IDOR [tracking] driver:location:get — uid=${client.uid} role=${client.role} → driverUserId=${driverUserId}`,
      );
      client.emit("error", { message: "Accès refusé : position GPS non disponible." });
      return;
    }

    const loc = await this.cache.getDriverLocation(driverUserId);
    client.emit("driver:location:current", loc ?? { error: "Position non disponible" });
  }

  broadcastDriverLocation(
    driverUserId: string,
    lat: number,
    lng: number,
    extra?: Record<string, unknown>,
  ) {
    const payload = {
      driverUserId,
      lat,
      lng,
      updated_at: Date.now(),
      ...extra,
    };
    this.server.to(`driver:${driverUserId}`).emit("driver:location:update", payload);
    const orderId = extra?.orderId as string | undefined;
    if (orderId && typeof orderId === "string" && orderId.length <= 128) {
      this.server.to(`order:${orderId}`).emit("driver:location:update", payload);
    }
  }
}

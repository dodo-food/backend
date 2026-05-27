import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";

// ─── Types partagés ───────────────────────────────────────────────────────────

interface LatLng { lat: number; lng: number }

interface DistanceResult { distanceKm: number; durationMinutes: number; source: string }
interface RouteResult {
  totalDistanceKm: number;
  totalDurationMinutes: number;
  legs: Array<{ from: LatLng; to: LatLng; distanceKm: number; durationMinutes: number }>;
  source: string;
}
interface OptimizeResult {
  algorithm: string;
  orderedStops: Array<{
    position: number;
    orderId: string;
    location: LatLng;
    distanceFromPrevKm: number;
    cumulativeKm: number;
  }>;
  totalDistanceKm: number;
  estimatedMinutes: number;
}
interface MatchResult {
  bestDriverId: string;
  candidates: Array<{
    userId: string;
    score: number;
    distanceToRestaurantKm: number;
    estimatedMinutes: number;
    rating: number;
    vehicleType: string;
  }>;
  algorithm: string;
}

// ─── Chemins vers les fichiers .proto ─────────────────────────────────────────

const PROTO_BASE = path.resolve(__dirname, "../../../../services/proto");

// ─── Loader options ────────────────────────────────────────────────────────────

const LOADER_OPTS: protoLoader.Options = {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class GrpcGeoClient implements OnModuleDestroy {
  private readonly logger = new Logger(GrpcGeoClient.name);

  private routingClient: grpc.ServiceClientConstructor | null = null;
  private optimizerClient: grpc.ServiceClientConstructor | null = null;
  private matcherClient: grpc.ServiceClientConstructor | null = null;

  private routingStub: grpc.Client | null = null;
  private optimizerStub: grpc.Client | null = null;
  private matcherStub: grpc.Client | null = null;

  readonly isConfigured: boolean;

  constructor() {
    const routingAddr  = process.env.ROUTING_GRPC_URL;
    const optimizerAddr = process.env.OPTIMIZER_GRPC_URL;
    const matcherAddr  = process.env.MATCHER_GRPC_URL;

    if (!routingAddr || !optimizerAddr || !matcherAddr) {
      this.logger.warn(
        "Variables ROUTING_GRPC_URL / OPTIMIZER_GRPC_URL / MATCHER_GRPC_URL absentes " +
        "— client gRPC désactivé, HTTP REST utilisé en fallback"
      );
      this.isConfigured = false;
      return;
    }

    try {
      this.routingStub  = this.buildStub("routing.proto",  "routing.RoutingService",  routingAddr);
      this.optimizerStub = this.buildStub("optimizer.proto", "optimizer.OptimizerService", optimizerAddr);
      this.matcherStub  = this.buildStub("matcher.proto",  "matcher.MatcherService",  matcherAddr);
      this.isConfigured = true;
      this.logger.log("Clients gRPC initialisés ✅");
    } catch (err: any) {
      this.logger.error(`Échec initialisation gRPC : ${err.message} — HTTP REST activé`);
      this.isConfigured = false;
    }
  }

  // ─── API publique ─────────────────────────────────────────────────────────

  async getDistance(origin: LatLng, destination: LatLng): Promise<DistanceResult> {
    return this.call<DistanceResult>(this.routingStub, "getDistance", {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
    });
  }

  async getRoute(waypoints: LatLng[]): Promise<RouteResult> {
    return this.call<RouteResult>(this.routingStub, "getRoute", { waypoints });
  }

  async optimize(depot: LatLng, deliveries: Array<{ orderId: string; location: LatLng; priority?: number }>): Promise<OptimizeResult> {
    return this.call<OptimizeResult>(this.optimizerStub, "optimize", {
      depot,
      deliveries: deliveries.map((d) => ({
        orderId: d.orderId,
        location: d.location,
        priority: d.priority ?? 0,
      })),
    });
  }

  async match(order: {
    orderId: string;
    restaurantLocation: LatLng;
    clientLocation: LatLng;
  }, availableDrivers: Array<{
    userId: string;
    location: LatLng;
    rating: number;
    activeDeliveries: number;
    vehicleType: string;
  }>, maxDrivers = 3): Promise<MatchResult> {
    return this.call<MatchResult>(this.matcherStub, "match", {
      order: {
        orderId: order.orderId,
        restaurantLocation: order.restaurantLocation,
        clientLocation: order.clientLocation,
      },
      availableDrivers,
      maxDrivers,
    });
  }

  async healthCheck(): Promise<{ routing: string; optimizer: string; matcher: string }> {
    const [r, o, m] = await Promise.allSettled([
      this.call<{ status: string }>(this.routingStub,  "health", {}),
      this.call<{ status: string }>(this.optimizerStub, "health", {}),
      this.call<{ status: string }>(this.matcherStub,  "health", {}),
    ]);
    return {
      routing:   r.status === "fulfilled" ? r.value.status : "down",
      optimizer: o.status === "fulfilled" ? o.value.status : "down",
      matcher:   m.status === "fulfilled" ? m.value.status : "down",
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildStub(protoFile: string, servicePath: string, address: string): grpc.Client {
    const packageDef = protoLoader.loadSync(path.join(PROTO_BASE, protoFile), LOADER_OPTS);
    const grpcObj = grpc.loadPackageDefinition(packageDef) as Record<string, any>;

    const [pkg, svc] = servicePath.split(".");
    const ServiceClass = grpcObj[pkg]?.[svc] as grpc.ServiceClientConstructor;
    if (!ServiceClass) throw new Error(`Service ${servicePath} introuvable dans ${protoFile}`);

    return new ServiceClass(address, grpc.credentials.createInsecure());
  }

  private call<T>(stub: grpc.Client | null, method: string, payload: unknown): Promise<T> {
    if (!stub) return Promise.reject(new Error("gRPC stub non initialisé"));
    return new Promise((resolve, reject) => {
      (stub as any)[method](payload, (err: grpc.ServiceError | null, res: T) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  }

  onModuleDestroy() {
    [this.routingStub, this.optimizerStub, this.matcherStub].forEach((s) => {
      if (s) s.close();
    });
  }
}

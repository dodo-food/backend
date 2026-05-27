import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Client, DirectionsRequest, DistanceMatrixRequest } from "@googlemaps/google-maps-services-js";
import { DistanceDto, RouteDto, OptimizeDto, MatchDto } from "./dto/distance.dto";

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly mapsClient: Client;
  private readonly mapsApiKey: string | null;

  // URLs des microservices Go (Future Scale — optionnel)
  private readonly routingUrl: string;
  private readonly optimizerUrl: string;
  private readonly matcherUrl: string;

  constructor() {
    this.mapsClient = new Client({});
    this.mapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? null;

    this.routingUrl = process.env.ROUTING_SERVICE_URL ?? "http://localhost:8080";
    this.optimizerUrl = process.env.OPTIMIZER_SERVICE_URL ?? "http://localhost:8008";
    this.matcherUrl = process.env.MATCHER_SERVICE_URL ?? "http://localhost:8099";

    if (!this.mapsApiKey) {
      this.logger.warn(
        "GOOGLE_MAPS_API_KEY absent — fallback calcul Haversine actif. " +
        "Ajoutez la clé dans les variables d'environnement Railway pour activer Google Maps.",
      );
    } else {
      this.logger.log("Google Maps API configurée ✅");
    }
  }

  // ─── Google Maps API (primaire) ──────────────────────────────────────────────

  async getDistance(dto: DistanceDto) {
    if (!this.mapsApiKey) return this.haversineDistance(dto);

    try {
      const res = await this.mapsClient.distancematrix({
        params: {
          origins: [`${dto.origin.lat},${dto.origin.lng}`],
          destinations: [`${dto.destination.lat},${dto.destination.lng}`],
          key: this.mapsApiKey,
        },
      });
      const element = res.data.rows[0]?.elements[0];
      if (!element || element.status !== "OK") {
        this.logger.warn("Google Maps matrix vide — fallback Haversine");
        return this.haversineDistance(dto);
      }
      return {
        distanceKm: Math.round((element.distance.value / 1000) * 100) / 100,
        durationMinutes: Math.round((element.duration.value / 60) * 10) / 10,
        source: "google_maps",
      };
    } catch (err: any) {
      this.logger.warn(`Google Maps error: ${err.message} — fallback Haversine`);
      return this.haversineDistance(dto);
    }
  }

  async getRoute(dto: RouteDto) {
    if (!this.mapsApiKey || dto.waypoints.length < 2) {
      return this.haversineRoute(dto);
    }

    try {
      const waypoints = dto.waypoints;
      const origin = `${waypoints[0].lat},${waypoints[0].lng}`;
      const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`;
      const middle = waypoints
        .slice(1, -1)
        .map((w) => `${w.lat},${w.lng}`)
        .join("|");

      const params: DirectionsRequest["params"] = {
        origin,
        destination,
        key: this.mapsApiKey,
      };
      if (middle) (params as any).waypoints = middle;

      const res = await this.mapsClient.directions({ params });
      const route = res.data.routes[0];
      if (!route) {
        return this.haversineRoute(dto);
      }

      let totalDistance = 0;
      let totalDuration = 0;
      const legs = route.legs.map((leg) => {
        totalDistance += leg.distance.value;
        totalDuration += leg.duration.value;
        return {
          from: leg.start_location,
          to: leg.end_location,
          distanceKm: Math.round((leg.distance.value / 1000) * 100) / 100,
          durationMinutes: Math.round((leg.duration.value / 60) * 10) / 10,
        };
      });

      return {
        totalDistanceKm: Math.round((totalDistance / 1000) * 100) / 100,
        totalDurationMinutes: Math.round((totalDuration / 60) * 10) / 10,
        polyline: route.overview_polyline.points,
        legs,
        source: "google_maps",
      };
    } catch (err: any) {
      this.logger.warn(`Google Directions error: ${err.message} — fallback Haversine`);
      return this.haversineRoute(dto);
    }
  }

  async getEta(
    driverLat: number, driverLng: number,
    destLat: number, destLng: number,
  ) {
    const dto: DistanceDto = {
      origin: { lat: driverLat, lng: driverLng },
      destination: { lat: destLat, lng: destLng },
    };
    return this.getDistance(dto);
  }

  // ─── Optimize & Match (Go microservices — Future Scale) ─────────────────────

  async optimizeDeliveries(dto: OptimizeDto) {
    return this.callGoService<unknown>(`${this.optimizerUrl}/optimize`, dto);
  }

  async matchDriver(dto: MatchDto) {
    return this.callGoService<unknown>(`${this.matcherUrl}/match`, dto);
  }

  async checkHealth() {
    const [mapsStatus, routingStatus, optimizerStatus, matcherStatus] = await Promise.allSettled([
      this.mapsApiKey
        ? Promise.resolve({ status: "configured", key: "***" })
        : Promise.resolve({ status: "not_configured", fallback: "haversine" }),
      this.callGoService<{ status: string }>(`${this.routingUrl}/health`),
      this.callGoService<{ status: string }>(`${this.optimizerUrl}/health`),
      this.callGoService<{ status: string }>(`${this.matcherUrl}/health`),
    ]);

    return {
      googleMaps: mapsStatus.status === "fulfilled" ? mapsStatus.value : null,
      goServices: {
        routing: routingStatus.status === "fulfilled"
          ? { status: "ok", url: this.routingUrl }
          : { status: "down", note: "Future Scale — optionnel" },
        optimizer: optimizerStatus.status === "fulfilled"
          ? { status: "ok", url: this.optimizerUrl }
          : { status: "down", note: "Future Scale — optionnel" },
        matcher: matcherStatus.status === "fulfilled"
          ? { status: "ok", url: this.matcherUrl }
          : { status: "down", note: "Future Scale — optionnel" },
      },
    };
  }

  // ─── Haversine fallback ──────────────────────────────────────────────────────

  private haversineDistance(dto: DistanceDto) {
    const dist = this.haversine(dto.origin, dto.destination);
    return {
      distanceKm: Math.round(dist * 100) / 100,
      durationMinutes: Math.round((dist / 25) * 60 * 10) / 10,
      source: "haversine_fallback",
    };
  }

  private haversineRoute(dto: RouteDto) {
    const pts = dto.waypoints;
    let total = 0;
    const legs: Array<{ from: unknown; to: unknown; distanceKm: number; durationMinutes: number }> = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const d = this.haversine(pts[i], pts[i + 1]);
      total += d;
      legs.push({
        from: pts[i], to: pts[i + 1],
        distanceKm: Math.round(d * 100) / 100,
        durationMinutes: Math.round((d / 25) * 60 * 10) / 10,
      });
    }
    return {
      totalDistanceKm: Math.round(total * 100) / 100,
      totalDurationMinutes: Math.round((total / 25) * 60 * 10) / 10,
      legs,
      source: "haversine_fallback",
    };
  }

  private haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  // ─── Go services HTTP client ─────────────────────────────────────────────────

  private async callGoService<T>(url: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    };
    if (body) init.body = JSON.stringify(body);
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json() as Promise<T>;
    } catch (err: any) {
      throw new ServiceUnavailableException(
        `Service Go indisponible (${url}) — Future Scale non activé.`,
      );
    }
  }
}

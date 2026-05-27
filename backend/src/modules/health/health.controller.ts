import {
  Controller, Get, HttpCode, HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { HealthService, HealthReport } from "./health.service";

/**
 * PingController — Séparé de HealthController pour que la route soit
 * exactement /api/v1/ping (sans le préfixe "health").
 * Utilisé par Railway comme healthcheckPath.
 */
@ApiTags("Health")
@Controller("ping")
export class PingController {
  /**
   * GET /api/v1/ping
   *
   * Endpoint ultra-léger — toujours 200, aucune dépendance externe.
   * Utilisé par :
   *   - Railway comme healthcheckPath (déploiement réussi dès que l'app démarre)
   *   - UptimeRobot toutes les 14 min pour éviter le sommeil du plan gratuit
   */
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Ping keep-alive (Railway + UptimeRobot)" })
  @ApiResponse({ status: 200, description: "Toujours 200 — app en ligne" })
  ping() {
    return { ok: true, ts: new Date().toISOString() };
  }
}

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * GET /api/v1/health
   *
   * Endpoint public — aucune authentification requise.
   * Vérifie PostgreSQL, Redis, Firebase et BullMQ en parallèle.
   * Retourne 200 si status = "ok" ou "degraded", 503 si status = "down".
   *
   * À utiliser pour le monitoring (Grafana, alertes, tableau de bord) —
   * PAS comme healthcheckPath Railway (utiliser /ping à la place).
   */
  @Public()
  @Get()
  @ApiOperation({
    summary: "Santé détaillée du backend",
    description:
      "Vérifie PostgreSQL, Redis, Firebase Admin SDK et BullMQ.\n\n" +
      "- `ok` : tous les services sont opérationnels\n" +
      "- `degraded` : service optionnel dégradé (ex: Redis absent → fallback mémoire)\n" +
      "- `down` : service critique indisponible (PostgreSQL ou Firebase)\n\n" +
      "⚠️ Retourne 503 si `down`. Pour le healthcheck Railway/UptimeRobot, utiliser `/ping`.",
  })
  @ApiResponse({ status: 200, description: "ok ou degraded — backend opérationnel" })
  @ApiResponse({ status: 503, description: "down — service critique indisponible" })
  async check(): Promise<HealthReport> {
    const report = await this.health.check();

    if (report.status === "down") {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}

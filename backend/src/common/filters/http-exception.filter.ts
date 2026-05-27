import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "crypto";

/**
 * HttpExceptionFilter — Filtre global des erreurs HTTP.
 *
 * Sécurité production :
 *   - Les erreurs 5xx n'exposent JAMAIS le message interne (stack traces, query SQL, etc.)
 *   - Chaque erreur reçoit un errorId unique traceable dans les logs
 *   - Le chemin de l'endpoint est inclus uniquement en développement
 *   - Les erreurs 4xx (validation, auth, permissions) sont retransmises telles quelles
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isDev  = process.env.NODE_ENV !== "production";

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse();
    const request  = ctx.getRequest();

    const errorId = randomUUID();

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Erreur interne du serveur";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === "string"
          ? res
          : (res as any)?.message ?? exception.message;

      // Erreurs 4xx : retransmettre le message (utile à l'utilisateur)
      if (status < 500) {
        this.logger.warn(
          `[${errorId}] HTTP ${status} ${request.method} ${request.url} — ${Array.isArray(message) ? message.join(", ") : message}`,
        );
      } else {
        // Erreurs 5xx : logger avec contexte complet, réponse générique
        this.logger.error(
          `[${errorId}] HTTP ${status} ${request.method} ${request.url}`,
          exception instanceof Error ? exception.stack : String(exception),
        );
        // En production : ne jamais exposer le message d'erreur interne
        if (!this.isDev) {
          message = "Erreur interne du serveur";
        }
      }
    } else if (exception instanceof Error) {
      // Erreur non-HTTP (ex: TypeError, bug interne)
      this.logger.error(
        `[${errorId}] Uncaught ${exception.name}: ${exception.message}`,
        exception.stack,
      );
      // En production : message générique + errorId pour debugging côté équipe
      message = this.isDev
        ? exception.message
        : "Erreur interne du serveur";
    } else {
      this.logger.error(`[${errorId}] Exception inconnue :`, String(exception));
    }

    const body: Record<string, unknown> = {
      statusCode: status,
      message: Array.isArray(message) ? message.join(", ") : message,
      errorId,
      timestamp: new Date().toISOString(),
    };

    // Chemin exposé uniquement en développement (évite le fingerprinting en prod)
    if (this.isDev) {
      body.path = request.url;
    }

    response.status(status).send(body);
  }
}

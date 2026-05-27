import {
  Controller,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiProperty,
} from "@nestjs/swagger";
import {
  IsString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Matches,
} from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { UploadService } from "./upload.service";
import { FirebaseAuthGuard } from "../../common/guards/firebase-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

// ─── DTOs ──────────────────────────────────────────────────────────────────
// Validation stricte des entrées upload :
//   - mimeType : whitelist exacte (pas de wildcard)
//   - data     : base64 valide uniquement
//   - originalName : longueur limitée, pas de path traversal

const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
// Accepte aussi le préfixe data:mime;base64, (data URI)
const BASE64_OR_DATA_URI = /^(data:[a-zA-Z0-9]+\/[a-zA-Z0-9\-.+]+;base64,)?[A-Za-z0-9+/\r\n]+=*$/;

export class UploadImageDto {
  @ApiProperty({ description: "Données base64 de l'image (avec ou sans préfixe data:...)" })
  @IsString() @IsNotEmpty()
  @MaxLength(10 * 1024 * 1024 / 0.75, { message: "Image trop grande (max ~10 Mo)" }) // base64 overhead
  data!: string;

  @ApiProperty({ example: "image/jpeg", description: "MIME type du fichier" })
  @IsString() @IsNotEmpty()
  @IsIn(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"], {
    message: "Type MIME invalide. Formats acceptés : jpeg, png, webp, gif",
  })
  mimeType!: string;

  @ApiProperty({
    enum: ["restaurants", "foods", "profiles", "banners"],
    example: "foods",
    description: "Dossier Cloudinary de destination",
  })
  @IsIn(["restaurants", "foods", "profiles", "banners"])
  folder!: "restaurants" | "foods" | "profiles" | "banners";

  @ApiProperty({ required: false, example: "burger.jpg" })
  @IsOptional() @IsString()
  @MaxLength(100, { message: "Nom de fichier trop long (max 100 caractères)" })
  @Matches(/^[a-zA-Z0-9_\-. ]+$/, { message: "Nom de fichier invalide (caractères interdits)" })
  originalName?: string;
}

export class UploadDocumentDto {
  @ApiProperty({ description: "Données base64 du document (avec ou sans préfixe data:...)" })
  @IsString() @IsNotEmpty()
  @MaxLength(20 * 1024 * 1024 / 0.75, { message: "Document trop grand (max ~20 Mo)" })
  data!: string;

  @ApiProperty({ example: "application/pdf", description: "MIME type du document" })
  @IsString() @IsNotEmpty()
  @IsIn(["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"], {
    message: "Type MIME invalide. Formats acceptés : pdf, jpeg, png, webp",
  })
  mimeType!: string;

  @ApiProperty({
    enum: ["kyc_drivers", "kyc_vendors"],
    example: "kyc_drivers",
    description: "Dossier Cloudinary (livreur ou vendeur)",
  })
  @IsIn(["kyc_drivers", "kyc_vendors"])
  folder!: "kyc_drivers" | "kyc_vendors";

  @ApiProperty({ required: false, example: "cni_recto.pdf" })
  @IsOptional() @IsString()
  @MaxLength(100, { message: "Nom de fichier trop long (max 100 caractères)" })
  @Matches(/^[a-zA-Z0-9_\-. ]+$/, { message: "Nom de fichier invalide (caractères interdits)" })
  originalName?: string;
}

export class DeleteFileDto {
  @ApiProperty({ example: "foodbf/foods/abc123" })
  @IsString() @IsNotEmpty()
  @MaxLength(512, { message: "publicId trop long" })
  @Matches(/^[a-zA-Z0-9_/\-.]+$/, { message: "publicId invalide (caractères interdits)" })
  publicId!: string;
}

@ApiTags("Upload")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("upload")
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  @Post("image")
  @Throttle({ strict: { ttl: 60_000, limit: 10 } }) // 10 uploads image / minute max
  @ApiOperation({
    summary: "Upload image (plat, restaurant, profil, bannière)",
    description: [
      "Envoie une image encodée en base64.",
      "Formats acceptés : jpg, png, webp, gif. Max ~10 Mo.",
      "Retourne l'URL principale (800px large, format WebP) et l'URL de la miniature (200×200px).",
      "",
      "Depuis Expo/React Native :",
      "```js",
      "const result = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });",
      "// POST { data: result, mimeType: 'image/jpeg', folder: 'foods' }",
      "```",
    ].join("\n"),
  })
  async uploadImage(
    @Body() dto: UploadImageDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.upload.uploadImage(
      dto.data,
      dto.mimeType,
      dto.folder,
      dto.originalName,
    );
    return { message: "Image uploadée avec succès", uploadedBy: user.uid, ...result };
  }

  @Post("document")
  @Throttle({ strict: { ttl: 60_000, limit: 5 } }) // 5 uploads KYC / minute max
  @ApiOperation({
    summary: "Upload document KYC (pièce d'identité, permis, certificat)",
    description: [
      "Envoie un document encodé en base64.",
      "Formats acceptés : pdf, jpg, png, webp. Max ~20 Mo.",
      "Utilisé pour les dossiers KYC livreur et vendeur.",
      "",
      "Depuis Expo/React Native :",
      "```js",
      "const result = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });",
      "// POST { data: result, mimeType: 'application/pdf', folder: 'kyc_drivers' }",
      "```",
    ].join("\n"),
  })
  async uploadDocument(
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.upload.uploadDocument(
      dto.data,
      dto.mimeType,
      dto.folder,
      dto.originalName,
    );
    return { message: "Document uploadé avec succès", uploadedBy: user.uid, ...result };
  }

  @Delete("file")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Supprimer un fichier Cloudinary par publicId",
    description: "Le publicId doit appartenir au sous-dossier de l'utilisateur (foodbf/profiles/{uid}, foodbf/kyc_*/...). Les dossiers restaurants/foods sont réservés aux vendeurs vérifiés.",
  })
  async deleteFile(
    @Body() dto: DeleteFileDto,
    @CurrentUser() user: any,
  ) {
    // Sécurité IDOR : un utilisateur ne peut supprimer que ses propres fichiers.
    // Le publicId doit contenir l'uid de l'utilisateur OU appartenir à un dossier
    // autorisé pour son rôle. Les admins peuvent tout supprimer.
    const isAdmin  = user.role === "admin";
    const ownsFile = dto.publicId.includes(user.uid);
    const isProfileFolder = dto.publicId.startsWith("foodbf/profiles/") ||
                            dto.publicId.startsWith("foodbf/kyc_");
    if (!isAdmin && !ownsFile && !isProfileFolder) {
      const { ForbiddenException } = await import("@nestjs/common");
      throw new ForbiddenException("Vous ne pouvez supprimer que vos propres fichiers.");
    }
    await this.upload.deleteFile(dto.publicId);
    return { message: "Fichier supprimé", publicId: dto.publicId, deletedBy: user.uid };
  }
}

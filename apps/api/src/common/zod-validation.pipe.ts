import {
  PipeTransform,
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { ZodSchema, ZodError } from "zod";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        );
        throw new BadRequestException({
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: messages,
        });
      }
      throw new BadRequestException("Validation failed");
    }
  }
}

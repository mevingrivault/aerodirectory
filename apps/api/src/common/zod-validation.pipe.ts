import {
  PipeTransform,
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { ZodType, ZodError, ZodIssue } from "zod";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodType) {}

  transform(value: unknown) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues.map(
          (e: ZodIssue) => `${e.path.join(".")}: ${e.message}`,
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

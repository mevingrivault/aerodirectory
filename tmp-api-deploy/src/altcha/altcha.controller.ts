import { Controller, Get } from "@nestjs/common";
import { AltchaService } from "./altcha.service";
import { Public } from "../common/decorators";
import { SkipAltcha } from "./altcha.guard";

@Controller("altcha")
export class AltchaController {
  constructor(private readonly altcha: AltchaService) {}

  /** Returns a fresh PoW challenge for the frontend widget */
  @Public()
  @SkipAltcha()
  @Get("challenge")
  async challenge() {
    return this.altcha.createChallenge();
  }
}

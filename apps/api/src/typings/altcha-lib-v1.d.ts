declare module "altcha-lib/v1" {
  interface ChallengeOptions {
    hmacKey: string;
    algorithm?: string;
    expires?: Date;
    maxNumber?: number;
    number?: number;
    salt?: string;
    saltLength?: number;
    params?: Record<string, string>;
  }

  interface Challenge {
    algorithm: string;
    challenge: string;
    maxnumber?: number;
    salt: string;
    signature: string;
  }

  export function createChallenge(options: ChallengeOptions): Promise<Challenge>;
  export function verifySolution(
    payload: string,
    hmacKey: string,
    checkExpires?: boolean,
  ): Promise<boolean>;
}

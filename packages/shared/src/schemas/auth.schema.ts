import { z } from "zod";

const emailSchema = z
  .string()
  .email("Invalid email address")
  .max(255)
  .transform((v) => v.toLowerCase().trim());

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a digit")
  .regex(/[^a-zA-Z0-9]/, "Password must contain a special character");

export const RegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().min(2).max(50).trim().optional(),
});

export const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const TotpVerifySchema = z.object({
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, "TOTP code must be 6 digits"),
});

export const ForgotPasswordSchema = z.object({
  email: emailSchema,
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const UpdateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).trim().optional(),
  homeAerodromeId: z.string().cuid().nullable().optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type TotpVerifyInput = z.infer<typeof TotpVerifySchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

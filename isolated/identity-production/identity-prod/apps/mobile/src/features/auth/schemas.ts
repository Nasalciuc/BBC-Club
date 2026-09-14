import { z } from "zod";

export const Email = z.string().trim().toLowerCase().email("Please enter a valid email address.");
export const Password = z
  .string()
  .min(8, "Your password needs at least 8 characters.")
  .max(128)
  .refine((p) => /[\d\W]/.test(p), "Add at least one number or symbol.");
export const Otp = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");

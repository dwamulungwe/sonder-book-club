import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters."),
});

export const signupSchema = loginSchema.extend({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(80, "Name must be 80 characters or fewer."),
});

import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Имейлът е задължителен")
    .email("Невалиден имейл адрес"),
  password: z.string().min(1, "Паролата е задължителна"),
});

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, "Имейлът е задължителен")
    .email("Невалиден имейл адрес")
    .max(254, "Имейлът е твърде дълъг"),
  password: z
    .string()
    .min(8, "Паролата трябва да е поне 8 символа")
    .max(72, "Паролата е твърде дълга"),
  phone: z
    .string()
    .min(1, "Телефонният номер е задължителен")
    .regex(
      /^\+?[0-9\s\-().]{7,20}$/,
      "Невалиден телефонен номер"
    ),
  teamName: z
    .string()
    .max(100, "Името на отбора е твърде дълго")
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

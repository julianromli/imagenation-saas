import { z } from "zod";

export const cartLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

export const cartLinesSchema = z.array(cartLineSchema).min(1).max(50);

export const checkoutSchema = z.object({
  addressLine: z.string().trim().min(5).max(200),
  city: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  guestName: z.string().trim().min(2).max(100),
  lines: cartLinesSchema,
  phone: z.string().trim().min(8).max(24),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/),
  province: z.string().trim().min(2).max(80),
});

export const productInputSchema = z.object({
  categoryId: z.string().nullable().optional(),
  description: z.string().trim().min(10).max(5000),
  name: z.string().trim().min(2).max(120),
  price: z.number().int().min(0),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  stock: z.number().int().min(0),
});

export const statusUpdateSchema = z.object({
  note: z.string().trim().max(500).optional(),
  orderId: z.string().min(1),
  status: z.enum([
    "cancelled",
    "delivered",
    "paid",
    "processing",
    "refunded",
    "shipped",
  ]),
});

export type CartLine = z.infer<typeof cartLineSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;

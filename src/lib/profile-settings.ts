import { z } from "zod";

export const profileSettings = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, "Enter your first name.")
      .max(60, "First name must be 60 characters or fewer."),
    lastName: z
      .string()
      .trim()
      .min(1, "Enter your last name.")
      .max(60, "Last name must be 60 characters or fewer."),
    region: z
      .string()
      .trim()
      .min(1, "Choose your country.")
      .max(100, "Country must be 100 characters or fewer."),
    learnerRole: z
      .string()
      .trim()
      .min(1, "Enter your role.")
      .max(60, "Role must be 60 characters or fewer."),
    bio: z.string().trim().max(2000, "About me must be 2,000 characters or fewer."),
  })
  .refine((data) => `${data.firstName} ${data.lastName}`.length <= 100, {
    message: "Your combined name must be 100 characters or fewer.",
  })
  .transform((data) => ({
    full_name: `${data.firstName} ${data.lastName}`,
    first_name: data.firstName,
    last_name: data.lastName,
    region: data.region,
    learner_role: data.learnerRole,
    bio: data.bio,
  }));

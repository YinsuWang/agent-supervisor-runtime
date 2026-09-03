import { z } from "zod";

const ExtensionIdSchema = z.string().regex(/^[a-p]{32}$/, "Chrome extension ID must be 32 lowercase a-p characters");
const NativeHostNameSchema = z.string().regex(/^[a-z0-9_.]+$/, "Native host name contains invalid characters");

export const NativeHostManifestSchema = z.object({
  name: NativeHostNameSchema,
  description: z.string().min(1),
  path: z.string().min(1),
  type: z.literal("stdio"),
  allowed_origins: z.array(z.string().regex(/^chrome-extension:\/\/[a-p]{32}\/$/)).length(1),
});

export type NativeHostManifest = z.infer<typeof NativeHostManifestSchema>;

export function createNativeHostManifest(input: {
  name?: string;
  description?: string;
  path: string;
  extensionId: string;
}): NativeHostManifest {
  const extensionId = ExtensionIdSchema.parse(input.extensionId);
  if (input.extensionId.includes("*")) throw new Error("Wildcard extension origins are forbidden");
  return NativeHostManifestSchema.parse({
    name: input.name ?? "com.agent_supervisor_runtime",
    description: input.description ?? "Agent Supervisor Runtime native messaging bridge",
    path: input.path,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`],
  });
}

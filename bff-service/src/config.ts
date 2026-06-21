import 'dotenv/config';

export const PORT = Number(process.env.PORT) || 8080;

export function resolveServiceUrl(service: string | undefined): string | undefined {
  if (!service) return;

  const value =
    process.env[service] ?? process.env[service.toLowerCase()];

  const trimmed = value?.trim();
  return trimmed || undefined;
}

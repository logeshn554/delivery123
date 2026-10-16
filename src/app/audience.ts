import { resolveAudience } from '../../scripts/app-audiences.mjs';
import type { AppAudience } from './workspace';
const application = resolveAudience(import.meta.env.VITE_APP_AUDIENCE) as { id: AppAudience; title: string; appId: string; scheme: string };
export const appAudience = application.id;
export const appTitle = application.title;
export const appScheme = application.scheme;

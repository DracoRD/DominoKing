import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function resolveProjectId(): string | undefined {
  if (process.env.FIREBASE_PROJECT_ID) {
    return process.env.FIREBASE_PROJECT_ID;
  }
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        projectId?: string;
      };
      return parsed.projectId;
    }
  } catch {
    // Ignore missing or unreadable local config
  }
  return undefined;
}

if (!getApps().length) {
  const projectId = resolveProjectId();
  initializeApp(projectId ? { projectId } : {});
}

export const adminAuth = getAuth();

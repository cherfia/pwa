import { promises as fs } from "fs";
import path from "path";

type SerializedSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
};

export type ScheduledNotification = {
  id: string;
  message: string;
  subscription: SerializedSubscription;
  scheduledFor: number; // Unix timestamp in milliseconds
  createdAt: number;
};

const STORAGE_FILE = path.join(
  process.cwd(),
  "data",
  "scheduled-notifications.json"
);

async function ensureDataDir() {
  const dataDir = path.join(process.cwd(), "data");
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

async function readScheduledNotifications(): Promise<ScheduledNotification[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(STORAGE_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet, return empty array
    return [];
  }
}

async function writeScheduledNotifications(
  notifications: ScheduledNotification[]
): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(
    STORAGE_FILE,
    JSON.stringify(notifications, null, 2),
    "utf-8"
  );
}

export async function addScheduledNotification(
  notification: ScheduledNotification
): Promise<void> {
  const notifications = await readScheduledNotifications();
  notifications.push(notification);
  await writeScheduledNotifications(notifications);
}

export async function getDueNotifications(): Promise<ScheduledNotification[]> {
  const notifications = await readScheduledNotifications();
  const now = Date.now();
  return notifications.filter((n) => n.scheduledFor <= now);
}

export async function removeScheduledNotification(id: string): Promise<void> {
  const notifications = await readScheduledNotifications();
  const filtered = notifications.filter((n) => n.id !== id);
  await writeScheduledNotifications(filtered);
}

export async function getAllScheduledNotifications(): Promise<
  ScheduledNotification[]
> {
  return readScheduledNotifications();
}

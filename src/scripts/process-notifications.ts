#!/usr/bin/env node

/**
 * Local development script to process scheduled notifications.
 * Run this script periodically (e.g., every minute) during development.
 *
 * Usage:
 *   node src/scripts/process-notifications.js
 *
 * Or set up a cron job:
 *   * * * * * cd /path/to/project && node src/scripts/process-notifications.js
 */

async function processNotifications() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  try {
    const headers: HeadersInit = {};
    if (cronSecret) {
      headers["Authorization"] = `Bearer ${cronSecret}`;
    }

    const response = await fetch(`${baseUrl}/api/cron/process-notifications`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(
        `Failed to process notifications: ${response.status} ${error}`
      );
      process.exit(1);
    }

    const result = await response.json();
    console.log(
      `Processed ${
        result.processed
      } notification(s) at ${new Date().toISOString()}`
    );
    if (result.results && result.results.length > 0) {
      result.results.forEach((r: { id: string; status: string }) => {
        console.log(`  - ${r.id}: ${r.status}`);
      });
    }
  } catch (error) {
    console.error("Error processing notifications:", error);
    process.exit(1);
  }
}

processNotifications();
